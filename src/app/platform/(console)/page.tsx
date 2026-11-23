import Link from "next/link";
import { Building2, HardDrive, ShieldCheck, Users } from "lucide-react";
import { KpiGrid } from "@/components/ui/kpi-grid";
import { Badge, Card, CardContent, CardHeader } from "@/components/ui/primitives";
import { FEATURE_KEYS, FEATURE_META, TIER_DEFAULT_FEATURES, type TierKey } from "@/lib/constants/saas";
import { withPlatformTx } from "@/lib/db";
import { PasswordResetQueueCard, PlatformAnalyticsCharts } from "@/app/platform/_client";

export const dynamic = "force-dynamic";

export default async function PlatformOverviewPage() {
  const data = await withPlatformTx(async (client) => {
    const [tenantsRes, usersRes, resetsRes, auditsRes] = await Promise.all([
      client.query<{
        id: string;
        name: string;
        tier: TierKey;
        status: string;
        max_users: number;
        storage_used_bytes: string;
        amc_renewal_date: string | null;
        feature_overrides: Record<string, boolean>;
      }>("SELECT id, name, tier, status, max_users, storage_used_bytes, amc_renewal_date, feature_overrides FROM public.tenants ORDER BY created_at DESC"),
      client.query<{
        tenant_id: string | null;
        role: string;
        is_active: boolean;
      }>("SELECT tenant_id, role, is_active FROM public.profiles WHERE is_platform_admin = false"),
      client.query<{
        id: string;
        user_id: string;
        identifier_submitted: string;
        note: string | null;
        created_at: string;
        tenant_name: string | null;
        full_name: string | null;
        role: string | null;
      }>(
        `SELECT r.id, r.user_id, r.identifier_submitted, r.note, r.created_at,
                t.name AS tenant_name, p.full_name, p.role
         FROM public.password_reset_requests r
         LEFT JOIN public.tenants t ON t.id = r.tenant_id
         LEFT JOIN public.profiles p ON p.id = r.user_id
         WHERE r.status = 'pending'
         ORDER BY r.created_at DESC
         LIMIT 20`
      ),
      client.query<{
        id: string;
        action: string;
        entity_type: string | null;
        created_at: string;
      }>("SELECT id, action, entity_type, created_at FROM public.audit_logs ORDER BY created_at DESC LIMIT 12"),
    ]);

    return {
      tenants: tenantsRes.rows,
      users: usersRes.rows,
      resets: resetsRes.rows,
      audits: auditsRes.rows,
    };
  });

  const totalBytes = data.tenants.reduce((acc, t) => acc + Number(t.storage_used_bytes || 0), 0);
  const activeUsers = data.users.filter((u) => u.is_active).length;

  const usersByTenant = data.tenants.slice(0, 12).map((t) => {
    const tu = data.users.filter((u) => u.tenant_id === t.id && u.is_active);
    return {
      name: t.name.slice(0, 22),
      owners: tu.filter((u) => u.role === "owner").length,
      branch_admins: tu.filter((u) => u.role === "branch_admin").length,
      workers: tu.filter((u) => u.role === "worker").length,
      max_users: t.max_users,
    };
  });

  const featureCoverage = FEATURE_KEYS.map((fk) => {
    let tierCount = 0;
    let overrideCount = 0;
    for (const t of data.tenants) {
      const ov = t.feature_overrides?.[fk];
      if (ov === true && !TIER_DEFAULT_FEATURES[t.tier].includes(fk)) overrideCount++;
      else if (ov !== false && TIER_DEFAULT_FEATURES[t.tier].includes(fk)) tierCount++;
    }
    return { label: FEATURE_META[fk].label, tierCount, overrideCount };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Application Owner Control Plane
          </h1>
          <p className="text-sm text-slate-600">
            Monitor tenants, seat utilization, cross-tier overrides &amp; password resets.
          </p>
        </div>
        <Link
          href="/platform/tenants"
          className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Manage Tenants →
        </Link>
      </div>

      <KpiGrid
        items={[
          {
            label: "Active Tenants",
            value: data.tenants.filter((t) => t.status === "active").length,
            subtext: `${data.tenants.length} total clients`,
            tone: "info",
            icon: <Building2 className="h-4 w-4" />,
          },
          {
            label: "Active Staff Users",
            value: activeUsers,
            subtext: `${data.users.length} total accounts`,
            tone: "success",
            icon: <Users className="h-4 w-4" />,
          },
          {
            label: "Pending Resets",
            value: data.resets.length,
            subtext: "Forgot-password queue",
            tone: data.resets.length > 0 ? "warning" : "default",
            icon: <ShieldCheck className="h-4 w-4" />,
          },
          {
            label: "Tenant R2 Media",
            value: `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`,
            subtext: "Of 10 GB R2 free tier",
            tone: "default",
            icon: <HardDrive className="h-4 w-4" />,
          },
        ]}
      />

      <PasswordResetQueueCard requests={data.resets} />

      <PlatformAnalyticsCharts usersByTenant={usersByTenant} featureCoverage={featureCoverage} />

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Recent Platform Audit Trail</h3>
        </CardHeader>
        <CardContent className="divide-y divide-slate-100 text-xs">
          {data.audits.length === 0 ? (
            <p className="text-slate-500">No audit logs recorded yet.</p>
          ) : (
            data.audits.map((a) => (
              <div key={a.id} className="py-2 flex items-center justify-between gap-2">
                <span className="font-medium text-slate-800">{a.action}</span>
                <div className="flex items-center gap-2">
                  {a.entity_type && <Badge>{a.entity_type}</Badge>}
                  <span className="text-slate-400">
                    {new Date(a.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
