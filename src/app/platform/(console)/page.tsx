import { buildTrendSeries, trendBucketsSql, type TrendBucketRow } from "@/lib/analytics/trend";
import { getServerSessionContext } from "@/lib/auth/session";
import { FEATURE_KEYS, FEATURE_META, TIER_DEFAULT_FEATURES, type TierKey } from "@/lib/constants/saas";
import { withPlatformTx } from "@/lib/db";
import { PasswordResetQueueCard } from "@/app/platform/_client";
import { SparkPlatformDashboard } from "@/app/platform/_spark-dashboard";

export const dynamic = "force-dynamic";

/** Counts records created in each of the last nine IST calendar months. */
function monthlyCounts(rows: Array<{ created_at: string | Date | null | undefined }>, now: Date): number[] {
  const istMonth = (d: Date) => {
    const shifted = new Date(d.getTime() + 5.5 * 60 * 60 * 1000);
    return shifted.getUTCFullYear() * 12 + shifted.getUTCMonth();
  };
  const current = istMonth(now);
  const counts = Array.from({ length: 9 }, () => 0);
  for (const row of rows) {
    if (!row.created_at) continue;
    const age = current - istMonth(new Date(row.created_at));
    if (age >= 0 && age < 9) counts[8 - age]!++;
  }
  return counts;
}

export default async function PlatformOverviewPage() {
  const ctx = await getServerSessionContext();

  const data = await withPlatformTx(async (client) => {
    const [tenantsRes, usersRes, resetsRes, auditsRes, trendRes] = await Promise.all([
      client.query<{
        id: string;
        name: string;
        slug: string;
        vertical_key: string;
        tier: TierKey;
        status: string;
        max_users: number;
        storage_used_bytes: string;
        max_storage_mb: number;
        created_at: string;
        feature_overrides: Record<string, boolean>;
      }>(
        "SELECT id, name, slug, vertical_key, tier, status, max_users, storage_used_bytes, max_storage_mb, created_at, feature_overrides FROM public.tenants ORDER BY created_at DESC"
      ),
      client.query<{
        tenant_id: string | null;
        role: string;
        is_active: boolean;
        created_at: string;
      }>("SELECT tenant_id, role, is_active, created_at FROM public.profiles WHERE is_platform_admin = false"),
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
      }>("SELECT id, action, entity_type, created_at FROM public.audit_logs ORDER BY created_at DESC LIMIT 20"),
      client.query<TrendBucketRow>(trendBucketsSql(false)),
    ]);

    return {
      tenants: tenantsRes.rows,
      users: usersRes.rows,
      resets: resetsRes.rows,
      audits: auditsRes.rows,
      trend: buildTrendSeries(trendRes.rows),
    };
  });

  const totalBytes = data.tenants.reduce((acc, t) => acc + Number(t.storage_used_bytes || 0), 0);
  const activeUsers = data.users.filter((u) => u.is_active).length;
  const now = new Date();

  const sparkTenants = data.tenants.map((t) => ({
    id: t.id,
    name: t.name,
    slug: t.slug,
    vertical_key: t.vertical_key,
    tier: t.tier,
    status: t.status,
    max_users: t.max_users,
    active_users: data.users.filter((u) => u.tenant_id === t.id && u.is_active).length,
    storage_mb: (Number(t.storage_used_bytes || 0) / (1024 * 1024)).toFixed(1),
    created_at: t.created_at,
  }));

  const featureCoverage = FEATURE_KEYS.map((fk) => {
    let tierCount = 0;
    let overrideCount = 0;
    for (const t of data.tenants) {
      const ov = t.feature_overrides?.[fk];
      if (ov === true && !TIER_DEFAULT_FEATURES[t.tier].includes(fk)) overrideCount++;
      else if (ov !== false && TIER_DEFAULT_FEATURES[t.tier].includes(fk)) tierCount++;
    }
    return { label: FEATURE_META[fk].label, category: FEATURE_META[fk].category, tierCount, overrideCount };
  });

  return (
    <SparkPlatformDashboard
      ownerName={ctx?.user.full_name || "Application Owner"}
      todayLabel={now.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
      tenants={sparkTenants}
      trend={data.trend}
      newTenantsByMonth={monthlyCounts(data.tenants, now)}
      newUsersByMonth={monthlyCounts(data.users, now)}
      storageCapacityMb={data.tenants.reduce((acc, t) => acc + Number(t.max_storage_mb || 0), 0)}
      activeStaff={activeUsers}
      totalStaff={data.users.length}
      pendingResetsCount={data.resets.length}
      totalStorageMb={(totalBytes / (1024 * 1024)).toFixed(1)}
      featureCoverage={featureCoverage}
      audits={data.audits}
      resetQueueSlot={
        data.resets.length > 0 ? <PasswordResetQueueCard requests={data.resets} /> : null
      }
    />
  );
}
