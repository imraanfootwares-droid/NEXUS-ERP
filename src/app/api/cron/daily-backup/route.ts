import { NextResponse, type NextRequest } from "next/server";
import { env, isConfigured } from "@/lib/env";
import { runHousekeeping } from "@/lib/backups/exporter";
import { runBackupCycle } from "@/lib/backups/scheduler";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization") || "";
  if (!isConfigured.cron || authHeader !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isConfigured.db || !isConfigured.storage) {
    return NextResponse.json({ ok: true, skipped: "DB or storage not configured" });
  }

  const cycle = await runBackupCycle();
  const housekeeping = await runHousekeeping();
  return NextResponse.json({
    ok: (cycle.failed?.length ?? 0) === 0 && !cycle.platform_error,
    ran: cycle.ran,
    saved: cycle.saved ?? 0,
    unchanged: cycle.unchanged ?? 0,
    failed: cycle.failed?.length ?? 0,
    housekeeping,
  });
}
