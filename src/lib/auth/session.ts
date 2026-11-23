import { cookies } from "next/headers";
import {
  IMPERSONATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  verifyImpersonationToken,
  verifySessionToken,
} from "@/lib/auth/crypto";
import { resolveAllFeatures, resolveRolePermissions } from "@/lib/auth/access";
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

export async function getServerSessionContext(): Promise<SessionContext | null> {
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
          };
        }
      }
      return base;
    }
  }

  if (!isConfigured.db) return null;

  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const jwt = await verifySessionToken(token);
  if (!jwt) return null;

  const impToken = cookieStore.get(IMPERSONATE_COOKIE_NAME)?.value;
  const impPayload = impToken ? await verifyImpersonationToken(impToken) : null;

  return withPlatformTx(async (client) => {
    const profRes = await client.query<ProfileRow>(
      `SELECT id, tenant_id, is_platform_admin, role, full_name, email, username, phone,
              session_version, must_change_password, is_active, created_at
       FROM public.profiles
       WHERE id = $1`,
      [jwt.sub]
    );

    const user = profRes.rows[0];
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

    const tRes = await client.query<TenantRow>(
      "SELECT * FROM public.tenants WHERE id = $1",
      [activeTenantId]
    );
    const tenant = tRes.rows[0] ?? null;
    if (!tenant) return null;

    const bRes = await client.query<BranchRow>(
      "SELECT * FROM public.branches WHERE tenant_id = $1 ORDER BY is_default DESC, created_at ASC",
      [activeTenantId]
    );

    const assignRes = await client.query<{ branch_id: string }>(
      "SELECT branch_id FROM public.user_branch_assignments WHERE user_id = $1 AND tenant_id = $2",
      [user.id, activeTenantId]
    );

    const permRes = await client.query<{ permission_key: string; allowed: boolean }>(
      "SELECT permission_key, allowed FROM public.tenant_role_permissions WHERE tenant_id = $1 AND role = $2",
      [activeTenantId, effectiveRole]
    );

    return {
      user: impersonation ? { ...user, role: "owner", tenant_id: activeTenantId } : user,
      tenant,
      branches: bRes.rows,
      assignedBranchIds:
        effectiveRole === "owner"
          ? bRes.rows.map((b) => b.id)
          : assignRes.rows.map((a) => a.branch_id),
      permissions: resolveRolePermissions(effectiveRole, permRes.rows),
      enabledFeatures: resolveAllFeatures(tenant),
      impersonation,
    };
  });
}
