import { NextResponse, type NextRequest } from "next/server";
import { getServerSessionContext } from "@/lib/auth/session";
import { withPlatformTx, withTenantTx } from "@/lib/db";
import { exportResponse, isExportFormat } from "@/lib/exports/export-response";
import { collectExport } from "@/lib/exports/full-export";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Downloads all data across every business. Platform admins only. */
export async function GET(request: NextRequest) {
  const ctx = await getServerSessionContext("platform");
  if (!ctx?.user.is_platform_admin || ctx.impersonation) {
    return NextResponse.json({ error: "Platform Super Admin access required." }, { status: 403 });
  }
  const format = request.nextUrl.searchParams.get("format") ?? "xlsx";
  if (!isExportFormat(format)) return NextResponse.json({ error: "Unknown format." }, { status: 400 });

  const sheets = await withTenantTx(
    { tenantId: null, isPlatformAdmin: true },
    (client) => collectExport(client, null),
    { snapshot: true }
  );
  await withPlatformTx((client) =>
    client.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, metadata)
       VALUES (NULL, $1, 'platform.full_export', 'platform', $2)`,
      [ctx.user.id, JSON.stringify({ format })]
    )
  );
  return exportResponse(sheets, format, "nexus-platform", "Nexus ERP - Full Platform Export");
}
