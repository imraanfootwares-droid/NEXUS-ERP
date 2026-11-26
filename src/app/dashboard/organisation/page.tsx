import { redirect } from "next/navigation";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { TierKey } from "@/lib/constants/saas";
import type { BranchRow } from "@/types/database";
import { DashboardOrganisationClient, type OrgProfileSummary } from "./_client";

export const dynamic = "force-dynamic";

export default async function DashboardOrganisationPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (ctx.user.role !== "owner" && ctx.user.role !== "branch_admin") {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const validTabs = new Set(["visual", "branches", "staff", "permissions"]);
  const initialTab = sp.tab && validTabs.has(sp.tab) ? sp.tab : "visual";

  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [branchesRes, profilesRes, pbRes, resetsRes, permsRes] = await Promise.all([
        client.query<BranchRow>(
          "SELECT * FROM public.branches WHERE tenant_id = $1 ORDER BY is_default DESC, name ASC",
          [ctx.tenant!.id]
        ),
        client.query<OrgProfileSummary & { tier_override: TierKey | null }>(
          `SELECT id, tenant_id, role, full_name, username, email, phone, is_active, tier_override
           FROM public.profiles
           WHERE tenant_id = $1 AND is_platform_admin = false
           ORDER BY role, full_name`,
          [ctx.tenant!.id]
        ),
        client.query<{ user_id: string; branch_id: string }>(
          "SELECT user_id, branch_id FROM public.user_branch_assignments WHERE tenant_id = $1",
          [ctx.tenant!.id]
        ),
        client.query<{
          id: string;
          user_id: string;
          identifier_submitted: string;
          note: string | null;
          created_at: string;
          full_name: string | null;
          role: string | null;
        }>(
          `SELECT r.id, r.user_id, r.identifier_submitted, r.note, r.created_at, p.full_name, p.role
           FROM public.password_reset_requests r
           JOIN public.profiles p ON p.id = r.user_id
           WHERE r.tenant_id = $1 AND r.status = 'pending' AND p.role <> 'owner'
           ORDER BY r.created_at DESC`,
          [ctx.tenant!.id]
        ),
        client.query<{ role: "branch_admin" | "worker"; permission_key: string; allowed: boolean }>(
          "SELECT role, permission_key, allowed FROM public.tenant_role_permissions WHERE tenant_id = $1 AND role IN ('branch_admin','worker')",
          [ctx.tenant!.id]
        ),
      ]);

      return {
        branches: branchesRes.rows,
        profiles: profilesRes.rows,
        profileBranches: pbRes.rows,
        resets: resetsRes.rows,
        perms: permsRes.rows,
      };
    }
  );

  return (
    <DashboardOrganisationClient
      tenant={ctx.tenant}
      userRole={ctx.user.role}
      initialTab={initialTab}
      permissions={ctx.permissions}
      branches={data.branches}
      profiles={data.profiles}
      profileBranches={data.profileBranches}
      resets={data.resets}
      rolePermRows={data.perms}
      canCreateBranch={canAccess(ctx, "settings.tax_and_hsn", { isMutation: true }).allowed}
      canCreateStaff={canAccess(ctx, "staff.create", { isMutation: true }).allowed}
    />
  );
}
