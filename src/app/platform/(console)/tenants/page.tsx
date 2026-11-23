import { withPlatformTx } from "@/lib/db";
import {
  TenantsDirectoryClient,
  type DirectoryTenantRow,
} from "@/app/platform/_tenants-directory-client";

export const dynamic = "force-dynamic";

export default async function PlatformTenantsPage() {
  const tenants = await withPlatformTx(async (client) => {
    const res = await client.query<DirectoryTenantRow>(
      `SELECT t.id, t.name, t.slug, t.vertical_key, t.tier, t.status,
              t.custom_domain, t.max_users, t.max_branches,
              t.storage_used_bytes::text, t.max_storage_mb, t.feature_overrides,
              (SELECT COUNT(*) FROM public.profiles p WHERE p.tenant_id = t.id)::text AS user_count,
              (SELECT COUNT(*) FROM public.branches b WHERE b.tenant_id = t.id)::text AS branch_count
       FROM public.tenants t
       ORDER BY t.created_at DESC`
    );
    return res.rows;
  });

  return <TenantsDirectoryClient tenants={tenants} />;
}
