import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/primitives";
import { withPlatformTx } from "@/lib/db";
import type { TenantRow } from "@/types/database";
import { TenantDetailControls } from "@/app/platform/_client";

export const dynamic = "force-dynamic";

export default async function PlatformTenantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const data = await withPlatformTx(async (client) => {
    const tRes = await client.query<TenantRow>("SELECT * FROM public.tenants WHERE id = $1", [id]);
    if (tRes.rows.length === 0) return null;
    const uRes = await client.query<{
      id: string;
      full_name: string;
      username: string | null;
      email: string | null;
      role: string;
      is_active: boolean;
    }>(
      "SELECT id, full_name, username, email, role, is_active FROM public.profiles WHERE tenant_id = $1 ORDER BY role, created_at",
      [id]
    );
    return { tenant: tRes.rows[0], users: uRes.rows };
  });

  if (!data) notFound();

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/platform/tenants" className="text-xs text-sky-600 hover:underline">
            ← Back to Tenants
          </Link>
          <div className="flex items-center gap-2 mt-1">
            <h1 className="font-display text-2xl font-bold text-slate-900">{data.tenant.name}</h1>
            <Badge variant={data.tenant.status === "active" ? "success" : "danger"}>
              {data.tenant.status}
            </Badge>
          </div>
          <p className="text-xs text-slate-500">
            Slug: <code>{data.tenant.slug}</code> • Vertical: {data.tenant.vertical_key}
          </p>
        </div>
      </div>

      <TenantDetailControls tenant={data.tenant} users={data.users} />
    </div>
  );
}
