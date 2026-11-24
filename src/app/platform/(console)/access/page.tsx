import { withPlatformTx } from "@/lib/db";
import { AccessControlClient, type AccessHistoryRow, type AccessPerson, type AccessTenant } from "./_client";

export const dynamic = "force-dynamic";

export default async function PlatformAccessPage() {
  const data = await withPlatformTx(async (client) => {
    const [tenantsRes, peopleRes, historyRes] = await Promise.all([
      client.query<AccessTenant>(
        `SELECT id, name, slug, tier, access_blocked, access_block_message, access_block_amount::float AS access_block_amount,
                access_block_contact, access_blocked_at
         FROM public.tenants ORDER BY name`
      ),
      client.query<AccessPerson>(
        `SELECT id, tenant_id, full_name, username, role, access_blocked, access_block_message,
                access_block_amount::float AS access_block_amount, access_block_contact, access_blocked_at
         FROM public.profiles WHERE is_platform_admin = false ORDER BY full_name`
      ),
      client.query<AccessHistoryRow>(
        `SELECT id, tenant_id, action, entity_type, entity_id, metadata, created_at
         FROM public.audit_logs
         WHERE action IN ('platform.access_blocked', 'platform.access_unblocked')
         ORDER BY created_at DESC LIMIT 40`
      ),
    ]);
    return {
      tenants: tenantsRes.rows,
      people: peopleRes.rows,
      history: historyRes.rows.filter((h) => h.action.startsWith("platform.access_")),
    };
  });

  return <AccessControlClient tenants={data.tenants} people={data.people} history={data.history} />;
}
