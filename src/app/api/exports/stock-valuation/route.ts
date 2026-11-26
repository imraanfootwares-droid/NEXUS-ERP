import { NextResponse, type NextRequest } from "next/server";
import { getBranchScope } from "@/lib/auth/active-branch";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { loadStockValuation } from "@/lib/analytics/stock-valuation";
import { withTenantTx } from "@/lib/db";
import { fetchImageForPdf } from "@/lib/pdf/image-helper";
import { getPublicAssetUrl } from "@/lib/storage/s3-client";

export const runtime = "nodejs";

function rowsToCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return "Model Code,Product Name,Category,Unit,Stock Qty\r\n";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => headers.map((h) => esc(r[h])).join(","))].join("\r\n");
}

export async function GET(request: NextRequest) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!ctx.enabledFeatures.dynamic_stock_matrix || !canAccess(ctx, "stock.view").allowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const format = (request.nextUrl.searchParams.get("format") || "pdf").toLowerCase();
  if (!["pdf", "xlsx", "csv"].includes(format)) {
    return NextResponse.json({ error: "Unsupported format. Use pdf, xlsx, or csv." }, { status: 400 });
  }

  const scope = await getBranchScope(ctx);
  const showCostAndProfit =
    ctx.user.role === "owner" ||
    ctx.user.role === "branch_admin" ||
    canAccess(ctx, "analytics.view_profit").allowed;

  const report = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    (client) => loadStockValuation(client, ctx.tenant!.id, scope.ids)
  );

  const branchScopeLabel =
    scope.activeId === "all"
      ? "All Branches"
      : scope.allowed.find((b) => b.id === scope.activeId)?.name ?? "Active Branch";
  const generatedAt = new Date().toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    dateStyle: "medium",
    timeStyle: "short",
  });
  const fileBase = `${ctx.tenant.slug}-stock-valuation`;

  if (format === "pdf") {
    const rawLogoKey = ctx.tenant.brand_config?.logo_key ?? null;
    const logoSource =
      ctx.tenant.brand_config?.logo_pdf_data_url ||
      (rawLogoKey ? getPublicAssetUrl(rawLogoKey) : null);
    const pdfSafeLogo = await fetchImageForPdf(logoSource, { format: "png", maxDim: 160 });

    const { renderStockValuationPdfBuffer } = await import("@/lib/pdf/documents");
    const pdf = await renderStockValuationPdfBuffer({
      tenantName: ctx.tenant.name,
      logoUrl: pdfSafeLogo,
      branchScopeLabel,
      generatedAt,
      showCostAndProfit,
      summary: report.summary,
      products: report.products,
    });

    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${fileBase}.pdf"`,
      },
    });
  }

  const productRows = report.products.map((p) => ({
    "Model Code": p.model_code,
    "Product Name": p.product_name,
    Category: p.category,
    Unit: p.uom,
    "Stock Qty": p.stock_qty,
    ...(showCostAndProfit ? { "Unit Cost (INR)": Number(p.unit_cost.toFixed(2)) } : {}),
    "Unit Retail (INR)": Number(p.unit_retail.toFixed(2)),
    "Unit Wholesale (INR)": Number(p.unit_wholesale.toFixed(2)),
    ...(showCostAndProfit ? { "Total Stock Cost (INR)": Number(p.total_cost.toFixed(2)) } : {}),
    "Expected Retail Value (INR)": Number(p.total_retail_value.toFixed(2)),
    ...(showCostAndProfit ? { "Expected Retail Profit (INR)": Number(p.expected_retail_profit.toFixed(2)) } : {}),
    "Expected Wholesale Value (INR)": Number(p.total_wholesale_value.toFixed(2)),
    ...(showCostAndProfit ? { "Expected Wholesale Profit (INR)": Number(p.expected_wholesale_profit.toFixed(2)) } : {}),
  }));

  if (format === "csv") {
    const csv = rowsToCsv(productRows);
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileBase}.csv"`,
      },
    });
  }

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const wsProducts = XLSX.utils.json_to_sheet(productRows);
  const summaryRows = [
    { Metric: "Business", Value: ctx.tenant.name },
    { Metric: "Branch Scope", Value: branchScopeLabel },
    { Metric: "Generated At", Value: generatedAt },
    { Metric: "Total Active Products", Value: report.summary.totalProducts },
    { Metric: "Total Stock Units", Value: report.summary.totalUnits },
    ...(showCostAndProfit ? [{ Metric: "Total Stock Cost (INR)", Value: Number(report.summary.totalStockCost.toFixed(2)) }] : []),
    { Metric: "Expected Retail Sale Value (INR)", Value: Number(report.summary.totalRetailValue.toFixed(2)) },
    ...(showCostAndProfit
      ? [
          { Metric: "Expected Retail Profit (INR)", Value: Number(report.summary.expectedRetailProfit.toFixed(2)) },
          { Metric: "Expected Retail Margin (%)", Value: Number(report.summary.retailMarginPct.toFixed(2)) },
        ]
      : []),
    { Metric: "Expected Wholesale Sale Value (INR)", Value: Number(report.summary.totalWholesaleValue.toFixed(2)) },
    ...(showCostAndProfit
      ? [
          { Metric: "Expected Wholesale Profit (INR)", Value: Number(report.summary.expectedWholesaleProfit.toFixed(2)) },
          { Metric: "Expected Wholesale Margin (%)", Value: Number(report.summary.wholesaleMarginPct.toFixed(2)) },
        ]
      : []),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), "Summary");
  XLSX.utils.book_append_sheet(wb, wsProducts, "All Products Valuation");
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${fileBase}.xlsx"`,
    },
  });
}
