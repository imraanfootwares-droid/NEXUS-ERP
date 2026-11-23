import Link from "next/link";
import { Badge, Card, CardContent } from "@/components/ui/primitives";
import { TIER_META, type TierKey } from "@/lib/constants/saas";
import { withPlatformTx } from "@/lib/db";
import { ProvisionTenantModal } from "@/app/platform/_client";

export const dynamic = "force-dynamic";

export default async function PlatformTenantsPage() {
  const tenants = await withPlatformTx(async (client) => {
    const res = await client.query<{
      id: string;
      name: string;
      slug: string;
      vertical_key: string;
      tier: TierKey;
      status: string;
      custom_domain: string | null;
      max_users: number;
      max_branches: number;
      storage_used_bytes: string;
      max_storage_mb: number;
      user_count: string;
      branch_count: string;
    }>(
      `SELECT t.*,
              (SELECT COUNT(*) FROM public.profiles p WHERE p.tenant_id = t.id)::text AS user_count,
              (SELECT COUNT(*) FROM public.branches b WHERE b.tenant_id = t.id)::text AS branch_count
       FROM public.tenants t
       ORDER BY t.created_at DESC`
    );
    return res.rows;
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Tenant Directory</h1>
          <p className="text-sm text-slate-600">
            Provision new clients, promote Tiers 1–4, and manage cross-tier feature overrides.
          </p>
        </div>
        <ProvisionTenantModal />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tenants.map((t) => (
          <Card key={t.id} className="hover:border-sky-300 transition-colors">
            <CardContent className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{t.name}</h3>
                  <p className="text-xs text-slate-500">
                    /{t.slug} • {t.vertical_key}
                  </p>
                </div>
                <Badge variant={t.status === "active" ? "success" : "danger"}>{t.status}</Badge>
              </div>

              <div className="text-xs text-slate-600 space-y-1">
                <div>Tier: <strong className="text-slate-900">{TIER_META[t.tier].name}</strong></div>
                <div>Seats: {t.user_count} / {t.max_users} • Branches: {t.branch_count} / {t.max_branches}</div>
                <div>R2 Used: {(Number(t.storage_used_bytes) / (1024 * 1024)).toFixed(2)} / {t.max_storage_mb} MB</div>
                {t.custom_domain && <div>Domain: <code>{t.custom_domain}</code></div>}
              </div>

              <div className="pt-2 flex items-center justify-between border-t border-slate-100">
                <Link
                  href={`/s/${t.slug}`}
                  className="text-xs text-slate-500 hover:text-slate-900 underline"
                >
                  Storefront
                </Link>
                <Link
                  href={`/platform/tenants/${t.id}`}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"
                >
                  Manage Tenant →
                </Link>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
