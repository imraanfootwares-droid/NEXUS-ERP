import { redirect } from "next/navigation";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { TierKey } from "@/lib/constants/saas";
import type { BranchRow } from "@/types/database";
import { DashboardOrganisationClient, type OrgProfileSummary } from "./_client";

export const dynamic = "force-dynamic";

export default async function DashboardOrganisationPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (ctx.user.role !== "owner" && ctx.user.role !== "branch_admin") {
    redirect("/dashboard");
  }

  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [branchesRes, profilesRes, pbRes] = await Promise.all([
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
      ]);

      return {
        branches: branchesRes.rows,
        profiles: profilesRes.rows,
        profileBranches: pbRes.rows,
      };
    }
  );

  return (
    <DashboardOrganisationClient
      tenant={ctx.tenant}
      branches={data.branches}
      profiles={data.profiles}
      profileBranches={data.profileBranches}
    />
  );
}
