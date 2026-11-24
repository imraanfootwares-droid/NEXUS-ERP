import { after, NextResponse } from "next/server";
import { getServerSessionContext } from "@/lib/auth/session";
import { maybeRunBackupCycle } from "@/lib/backups/scheduler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Lets an open app notice a block or unblock without a page reload. */
export async function GET() {
  const ctx = await getServerSessionContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  after(() => maybeRunBackupCycle().catch(() => undefined));
  return NextResponse.json({ block: ctx.accessBlock ?? null }, { headers: { "Cache-Control": "no-store" } });
}
