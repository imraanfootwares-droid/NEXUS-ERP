import { NextResponse, type NextRequest } from "next/server";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { exportResponse, isExportFormat } from "@/lib/exports/export-response";
import { collectExport } from "@/lib/exports/full-export";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Downloads all of one business's data as Excel, zipped CSV or PDF. */
export async function GET(request: NextRequest) {
  const ctx = await getServerSessionContext();
  if (!ctx?.tenant) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Tier 1 & 2 owners keep 1-click manual download; Tier 3+ also get automated daily R2 backups.
  const canManualExport =
    canAccess(ctx, "backups.manage").allowed ||
    (ctx.user.role === "owner" && canAccess(ctx, "reports.export_gst").allowed);
  if (!canManualExport) {
    return NextResponse.json({ error: "You do not have permission to export data." }, { status: 403 });
  }
  const format = request.nextUrl.searchParams.get("format") ?? "xlsx";
  if (!isExportFormat(format)) return NextResponse.json({ error: "Unknown format." }, { status: 400 });

  const tenant = ctx.tenant;
  const sheets = await withTenantTx(
    { tenantId: tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    (client) => collectExport(client, tenant.id),
    { snapshot: true }
  );
  await withTenantTx({ tenantId: tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, (client) =>
    client.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, metadata)
       VALUES ($1, $2, 'data.full_export', 'tenant', $3)`,
      [tenant.id, ctx.user.id, JSON.stringify({ format })]
    )
  );
  return exportResponse(sheets, format, tenant.slug, `${tenant.name} - Full Data Export`);
}
