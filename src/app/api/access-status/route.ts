import { NextResponse } from "next/server";
import { getServerSessionContext } from "@/lib/auth/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Lightweight check so an open tab notices a block or unblock without pulling in heavy backup/export modules. */
export async function GET() {
  const ctx = await getServerSessionContext();
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ block: ctx.accessBlock ?? null }, { headers: { "Cache-Control": "no-store" } });
}
