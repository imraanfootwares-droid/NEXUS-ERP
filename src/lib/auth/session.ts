import { cache } from "react";
import { cookies, headers } from "next/headers";
import {
  IMPERSONATE_COOKIE_NAME,
  PLATFORM_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  verifyImpersonationToken,
  verifySessionToken,
} from "@/lib/auth/crypto";
import {
  resolveAccessBlock,
  resolveAllFeatures,
  resolveRolePermissions,
  resolveUserFeatures,
} from "@/lib/auth/access";
import { getMockSessionContext, getMockState } from "@/lib/dev/mock-db";
import { DEV_ROLE_COOKIE, isDevPreviewAllowed, parseDevPreviewRole } from "@/lib/dev/preview";
import { isConfigured } from "@/lib/env";
import { withPlatformTx } from "@/lib/db";
import type {
  BranchRow,
  ImpersonationState,
  ProfileRow,
  SessionContext,
  TenantRow,
} from "@/types/database";

export type SessionScope = "platform" | "tenant";

async function detectSessionScope(): Promise<SessionScope> {
  try {
    const hdrs = await headers();
    const explicit = hdrs.get("x-nexus-scope");
    if (explicit === "platform" || explicit === "tenant") return explicit;
    const referer = hdrs.get("referer");
    if (referer) {
      try {
        const pathname = new URL(referer).pathname;
        if (pathname.startsWith("/platform")) return "platform";
      } catch {
        // ignore malformed referer
      }
    }
  } catch {
    // headers() unavailable outside request context
  }
  return "tenant";
}

/**
 * Request-memoized via React `cache()` so layout.tsx + page.tsx share a single
 * DB lookup per navigation, and collapsed into a single CTE SQL query to
 * eliminate 5x sequential round-trips to Neon Postgres.
 * Platform Admin and Tenant sessions are isolated in separate cookies so signing
 * into both in different tabs never logs out the other.
 */
const loadSessionForScope = cache(async (scope: SessionScope): Promise<SessionContext | null> => {
  const cookieStore = await cookies();

  // Strictly dev-only mock session switcher (allows previewing all roles without a backend)
  if (isDevPreviewAllowed()) {
    const devRole = parseDevPreviewRole(cookieStore.get(DEV_ROLE_COOKIE)?.value);
    if (devRole) {
      const base = getMockSessionContext(devRole);
      if (devRole === "platform_admin") {
        const impToken = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;
        const impPayload = impToken ? await verifyImpersonationToken(impToken) : null;
        if (impPayload) {
          const mock = getMockState();
          const tenant = mock.tenants.find((t) => t.id === impPayload.tenantId) ?? mock.tenants[0];
          const branches = mock.branches.filter((b) => b.tenant_id === tenant.id);
          return {
            ...base,
            user: { ...base.user, role: "owner", tenant_id: tenant.id },
            tenant,
            branches,
            assignedBranchIds: branches.map((b) => b.id),
            enabledFeatures: resolveAllFeatures(tenant),
            impersonation: {
              tenantId: tenant.id,
              adminId: base.user.id,
              mode: impPayload.mode,
              expiresAt: (impPayload.exp ?? 0) * 1000,
            },
            accessBlock: null,
          };
        }
      }
      return base;
    }
  }

  if (!isConfigured.db) return null;

  const impToken = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;
  let token: string | undefined;
  if (scope === "platform") {
    token = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value;
  } else {
    token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!token && impToken) {
      token = cookieStore.get(PLATFORM_SESSION_COOKIE_NAME)?.value;
    }
  }
  if (!token) return null;

  const [jwt, impPayload] = await Promise.all([
    verifySessionToken(token),
    impToken ? verifyImpersonationToken(impToken) : Promise.resolve(null),
  ]);
  if (!jwt) return null;
  if (scope === "platform" && !jwt.pa) return null;

  const impTenantId =
    impPayload && impPayload.adminId === jwt.sub ? impPayload.tenantId : null;

  return withPlatformTx(async (client) => {
    const res = await client.query<{
      user_row: ProfileRow | null;
      tenant_row: TenantRow | null;
      branches_json: BranchRow[];
      assigned_branch_ids_json: string[];
      permissions_json: Array<{ permission_key: string; allowed: boolean }>;
    }>(
      `WITH u AS (
         SELECT id, tenant_id, is_platform_admin, role, full_name, email, username, phone,
                session_version, must_change_password, is_active, tier_override,
                access_blocked, access_block_message, access_block_amount, access_block_contact, access_blocked_at,
                created_at
         FROM public.profiles
         WHERE id = $1
       ),
       eff AS (
         SELECT
           u.id,
           CASE WHEN u.is_platform_admin AND $2::uuid IS NOT NULL THEN $2::uuid ELSE u.tenant_id END AS active_tenant_id,
           CASE WHEN u.is_platform_admin AND $2::uuid IS NOT NULL THEN 'owner'::text ELSE u.role::text END AS effective_role
         FROM u
       )
       SELECT
         row_to_json(u.*) AS user_row,
         (SELECT row_to_json(t.*) FROM public.tenants t WHERE t.id = eff.active_tenant_id) AS tenant_row,
         COALESCE((
           SELECT json_agg(b.* ORDER BY b.is_default DESC, b.created_at ASC)
           FROM public.branches b
           WHERE b.tenant_id = eff.active_tenant_id
         ), '[]'::json) AS branches_json,
         COALESCE((
           SELECT json_agg(uba.branch_id)
           FROM public.user_branch_assignments uba
           WHERE uba.user_id = eff.id AND uba.tenant_id = eff.active_tenant_id
         ), '[]'::json) AS assigned_branch_ids_json,
         COALESCE((
           SELECT json_agg(json_build_object('permission_key', trp.permission_key, 'allowed', trp.allowed))
           FROM public.tenant_role_permissions trp
           WHERE trp.tenant_id = eff.active_tenant_id AND trp.role::text = eff.effective_role
         ), '[]'::json) AS permissions_json
       FROM u
       JOIN eff ON eff.id = u.id`,
      [jwt.sub, impTenantId]
    );

    const row = res.rows[0];
    const user = row?.user_row ?? null;
    if (!user || !user.is_active || user.session_version !== jwt.sv) {
      return null;
    }

    let impersonation: ImpersonationState | null = null;
    let activeTenantId = user.tenant_id;
    let effectiveRole = user.role;

    if (user.is_platform_admin && impPayload && impPayload.adminId === user.id) {
      impersonation = {
        tenantId: impPayload.tenantId,
        adminId: impPayload.adminId,
        mode: impPayload.mode,
        expiresAt: (impPayload.exp ?? 0) * 1000,
      };
      activeTenantId = impPayload.tenantId;
      effectiveRole = "owner";
    }

    if (!activeTenantId) {
      return {
        user,
        tenant: null,
        branches: [],
        assignedBranchIds: [],
        permissions: resolveRolePermissions("owner", []),
        enabledFeatures: resolveAllFeatures(null),
        impersonation: null,
      };
    }

    const tenant = row.tenant_row ?? null;
    if (!tenant) return null;

    const branches = Array.isArray(row.branches_json) ? row.branches_json : [];
    const assignedIds = Array.isArray(row.assigned_branch_ids_json)
      ? row.assigned_branch_ids_json
      : [];
    const perms = Array.isArray(row.permissions_json) ? row.permissions_json : [];

    return {
      user: impersonation ? { ...user, role: "owner", tenant_id: activeTenantId } : user,
      tenant,
      branches,
      assignedBranchIds:
        effectiveRole === "owner" ? branches.map((b) => b.id) : assignedIds,
      permissions: resolveRolePermissions(effectiveRole, perms),
      // Support sessions see the whole business; everyone else is limited by their tier.
      enabledFeatures: impersonation
        ? resolveAllFeatures(tenant)
        : resolveUserFeatures(tenant, user.tier_override),
      impersonation,
      accessBlock: impersonation ? null : resolveAccessBlock(tenant, user),
    };
  });
});

export async function getServerSessionContext(
  scope?: SessionScope
): Promise<SessionContext | null> {
  const resolvedScope = scope ?? (await detectSessionScope());
  return loadSessionForScope(resolvedScope);
}
