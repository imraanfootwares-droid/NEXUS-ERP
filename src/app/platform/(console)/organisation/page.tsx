import { withPlatformTx } from "@/lib/db";
import type { TierKey } from "@/lib/constants/saas";
import type { BranchRow, TenantRow } from "@/types/database";
import { OrganisationVisualEditorClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function PlatformOrganisationPage() {
  const data = await withPlatformTx(async (client) => {
    const [tenantsRes, branchesRes, profilesRes, pbRes, resetsRes, auditsRes] = await Promise.all([
      client.query<TenantRow>("SELECT * FROM public.tenants ORDER BY created_at DESC"),
      client.query<BranchRow>("SELECT * FROM public.branches ORDER BY is_default DESC, name"),
      client.query<{
        id: string;
        tenant_id: string | null;
        role: "owner" | "branch_admin" | "worker";
        full_name: string;
        username: string | null;
        email: string | null;
        is_active: boolean;
        tier_override: TierKey | null;
      }>("SELECT id, tenant_id, role, full_name, username, email, is_active, tier_override FROM public.profiles WHERE is_platform_admin = false ORDER BY role, full_name"),
      client.query<{ user_id: string; branch_id: string }>(
        "SELECT user_id, branch_id FROM public.user_branch_assignments"
      ),
      client.query<{
        id: string;
        tenant_id: string | null;
        user_id: string;
        identifier_submitted: string;
        note: string | null;
        created_at: string;
        full_name: string | null;
      }>(
        `SELECT r.id, r.tenant_id, r.user_id, r.identifier_submitted, r.note, r.created_at, p.full_name
         FROM public.password_reset_requests r
         LEFT JOIN public.profiles p ON p.id = r.user_id
         WHERE r.status = 'pending'
         ORDER BY r.created_at DESC
         LIMIT 40`
      ),
      client.query<{
        id: string;
        tenant_id: string | null;
        action: string;
        entity_type: string | null;
        created_at: string;
      }>("SELECT id, tenant_id, action, entity_type, created_at FROM public.audit_logs ORDER BY created_at DESC LIMIT 30"),
    ]);

    return {
      tenants: tenantsRes.rows,
      branches: branchesRes.rows,
      profiles: profilesRes.rows,
      profileBranches: pbRes.rows,
      resets: resetsRes.rows,
      audits: auditsRes.rows,
    };
  });

  return (
    <OrganisationVisualEditorClient
      tenants={data.tenants}
      branches={data.branches}
      profiles={data.profiles}
      profileBranches={data.profileBranches}
      resets={data.resets}
      audits={data.audits}
    />
  );
}
