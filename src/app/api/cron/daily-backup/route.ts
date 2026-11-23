import { NextResponse, type NextRequest } from "next/server";
import { env, isConfigured } from "@/lib/env";
import { withPlatformTx } from "@/lib/db";
import { runHousekeeping, runTenantBackup } from "@/lib/backups/exporter";
import { isFeatureEnabled } from "@/lib/auth/access";
import type { TenantRow } from "@/types/database";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  if (!isConfigured.cron || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isConfigured.db || !isConfigured.storage) {
    return NextResponse.json({ ok: true, skipped: "DB or storage not configured" });
  }

  // Process up to 10 tenants per run using a cursor in platform_settings (safe for Hobby timeout)
  const tenants = await withPlatformTx(async (client) => {
    const curRes = await client.query<{ value: { last_id?: string } }>(
      "SELECT value FROM public.platform_settings WHERE key = 'backup_cursor'"
    );
    const lastId = curRes.rows[0]?.value?.last_id ?? "00000000-0000-0000-0000-000000000000";

    const tRes = await client.query<TenantRow>(
      "SELECT * FROM public.tenants WHERE status = 'active' AND id > $1 ORDER BY id ASC LIMIT 10",
      [lastId]
    );
    if (tRes.rows.length === 0) {
      const wrapRes = await client.query<TenantRow>(
        "SELECT * FROM public.tenants WHERE status = 'active' ORDER BY id ASC LIMIT 10"
      );
      return wrapRes.rows;
    }
    return tRes.rows;
  });

  const results: Array<{ tenantId: string; skipped: boolean; error?: string }> = [];
  let lastProcessed = "00000000-0000-0000-0000-000000000000";

  for (const t of tenants) {
    lastProcessed = t.id;
    if (!isFeatureEnabled(t, "daily_backups")) {
      results.push({ tenantId: t.id, skipped: true });
      continue;
    }
    try {
      const res = await runTenantBackup(t.id, "scheduled", null);
      results.push({ tenantId: t.id, skipped: res.skipped });
    } catch (err) {
      results.push({
        tenantId: t.id,
        skipped: false,
        error: err instanceof Error ? err.message : "Backup failed",
      });
    }
  }

  await withPlatformTx(async (client) => {
    await client.query(
      `INSERT INTO public.platform_settings (key, value) VALUES ('backup_cursor', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify({ last_id: tenants.length < 10 ? "00000000-0000-0000-0000-000000000000" : lastProcessed })]
    );
  });

  const housekeeping = await runHousekeeping();

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
    housekeeping,
  });
}
