import { isConfigured } from "@/lib/env";
import { withPlatformTx } from "@/lib/db";
import { runPlatformBackup, runTenantBackup } from "./exporter";

// Automatic cloud backups run at most once every 2 days (48h) to protect Free Tier DB egress & compute;
// owners can always trigger an instant backup anytime via "Backup Now".
export const BACKUP_INTERVAL_HOURS = 48;
const HOUR_MS = 60 * 60 * 1000;
const RUN_BUDGET_MS = 20_000;
const CHECK_EVERY_MS = HOUR_MS;
const ZERO_ID = "00000000-0000-0000-0000-000000000000";

export interface BackupHealth {
  last_run_at?: string;
  last_completed_at?: string;
  retry_after?: string;
  saved?: number;
  unchanged?: number;
  failed?: Array<{ tenantId: string; error: string }>;
  platform_error?: string | null;
  storage_bytes?: number;
}

async function readSetting<T>(key: string): Promise<T | null> {
  return withPlatformTx(async (client) => {
    const res = await client.query<{ value: T }>("SELECT value FROM public.platform_settings WHERE key = $1", [key]);
    return res.rows[0]?.value ?? null;
  });
}

async function writeSetting(key: string, value: unknown): Promise<void> {
  await withPlatformTx((client) =>
    client.query(
      `INSERT INTO public.platform_settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)]
    )
  );
}

export const readBackupHealth = () => readSetting<BackupHealth>("backup_health");

/** Only one server instance can run a backup at a time. */
async function acquireLease(): Promise<boolean> {
  return withPlatformTx(async (client) => {
    const res = await client.query(
      `INSERT INTO public.platform_settings (key, value)
       VALUES ('backup_lease', jsonb_build_object('until', now() + interval '3 minutes'))
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       WHERE (public.platform_settings.value->>'until')::timestamptz < now()
       RETURNING key`
    );
    return res.rows.length > 0;
  });
}

function isDue(health: BackupHealth | null, now: number): boolean {
  if (health?.retry_after && new Date(health.retry_after).getTime() > now) return false;
  if (!health?.last_completed_at) return true;
  return now - new Date(health.last_completed_at).getTime() >= BACKUP_INTERVAL_HOURS * HOUR_MS;
}

/**
 * Backs up businesses in small batches, one at a time. Unchanged businesses are
 * skipped, and an unfinished cycle continues from where it stopped on the next run.
 */
export async function runBackupCycle(options: { force?: boolean } = {}): Promise<BackupHealth & { ran: boolean }> {
  const before = await readBackupHealth();
  if (!isConfigured.db || !isConfigured.storage) return { ...(before ?? {}), ran: false };
  if (!options.force && !isDue(before, Date.now())) return { ...(before ?? {}), ran: false };
  if (!(await acquireLease())) return { ...(before ?? {}), ran: false };

  const startedAt = Date.now();
  try {
    const cursor = (await readSetting<{ last_id?: string }>("backup_cursor"))?.last_id ?? ZERO_ID;
    const resuming = cursor !== ZERO_ID;
    const tenants = await withPlatformTx(async (client) => {
      const res = await client.query<{ id: string }>(
        `SELECT id FROM public.tenants
         WHERE id > $1
           AND status = 'active'
           AND public.is_feature_enabled(id, 'daily_backups') = true
         ORDER BY id ASC`,
        [cursor]
      );
      return res.rows;
    });

    let saved = resuming ? before?.saved ?? 0 : 0;
    let unchanged = resuming ? before?.unchanged ?? 0 : 0;
    const failed = resuming ? [...(before?.failed ?? [])] : [];
    let lastId = cursor;
    let finished = true;

    for (const tenant of tenants) {
      if (Date.now() - startedAt > RUN_BUDGET_MS) {
        finished = false;
        break;
      }
      try {
        const result = await runTenantBackup(tenant.id, "scheduled", null);
        if (result.skipped) unchanged++;
        else saved++;
      } catch (err) {
        failed.push({ tenantId: tenant.id, error: err instanceof Error ? err.message.slice(0, 160) : "Backup failed" });
      }
      lastId = tenant.id;
    }

    let platformError: string | null = null;
    if (finished) {
      try {
        await runPlatformBackup();
      } catch (err) {
        platformError = err instanceof Error ? err.message.slice(0, 160) : "Platform backup failed";
      }
    }

    const nowIso = new Date().toISOString();
    const clean = finished && failed.length === 0 && !platformError;
    const health: BackupHealth = {
      last_run_at: nowIso,
      last_completed_at: clean ? nowIso : before?.last_completed_at,
      retry_after: finished && !clean ? new Date(Date.now() + HOUR_MS).toISOString() : undefined,
      saved,
      unchanged,
      failed,
      platform_error: platformError,
      storage_bytes: await withPlatformTx(async (client) => {
        const res = await client.query<{ total: string }>(
          "SELECT coalesce(sum(file_size_bytes), 0)::text AS total FROM public.tenant_backups"
        );
        return Number(res.rows[0]?.total ?? 0);
      }),
    };
    await writeSetting("backup_cursor", { last_id: finished ? ZERO_ID : lastId });
    await writeSetting("backup_health", health);
    return { ...health, ran: true };
  } finally {
    await writeSetting("backup_lease", { until: new Date().toISOString() }).catch(() => undefined);
  }
}

let lastCheck = 0;

/**
 * Called while people use the app. At most one light check per server each hour,
 * so backups follow real activity and never wake a sleeping database.
 */
export async function maybeRunBackupCycle(): Promise<void> {
  if (process.env.NODE_ENV !== "production" || !isConfigured.storage) return;
  const now = Date.now();
  if (now - lastCheck < CHECK_EVERY_MS) return;
  lastCheck = now;
  await runBackupCycle();
}
