import { notFound } from "next/navigation";
import { withPlatformTx } from "@/lib/db";
import type { TenantRow } from "@/types/database";
import {
  TenantStudioClient,
  type TenantStudioStats,
  type TenantStudioUser,
} from "@/app/platform/_tenant-studio-client";

export const dynamic = "force-dynamic";

export default async function PlatformTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch tenant, users, and live telemetry in one parallel pipelined batch
  const data = await withPlatformTx(async (client) => {
    const [tRes, uRes, statsRes] = await Promise.all([
      client.query<TenantRow>("SELECT * FROM public.tenants WHERE id = $1", [id]),
      client.query<TenantStudioUser>(
        "SELECT id, full_name, username, email, role, is_active FROM public.profiles WHERE tenant_id = $1 ORDER BY role, created_at",
        [id]
      ),
      client.query<{ branch_count: string; product_count: string; invoice_count: string }>(
        `SELECT
           (SELECT COUNT(*) FROM public.branches WHERE tenant_id = $1)::text AS branch_count,
           (SELECT COUNT(*) FROM public.products WHERE tenant_id = $1 AND is_active = true)::text AS product_count,
           (SELECT COUNT(*) FROM public.invoices WHERE tenant_id = $1 AND status <> 'cancelled')::text AS invoice_count`,
        [id]
      ),
    ]);

    if (tRes.rows.length === 0) return null;
    const s = statsRes.rows[0];
    const stats: TenantStudioStats = {
      branchCount: Number(s?.branch_count ?? 0),
      productCount: Number(s?.product_count ?? 0),
      invoiceCount: Number(s?.invoice_count ?? 0),
    };
    return { tenant: tRes.rows[0], users: uRes.rows, stats };
  });

  if (!data) notFound();

  return <TenantStudioClient tenant={data.tenant} users={data.users} stats={data.stats} />;
}
