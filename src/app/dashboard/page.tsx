import { getBranchScope } from "@/lib/auth/active-branch";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { buildTrendSeries, trendBucketsSql, type TrendBucketRow } from "@/lib/analytics/trend";
import {
  loadPeriodProfitSummary,
  loadStockValuation,
  type PeriodProfitSummary,
  type StockValuationReport,
} from "@/lib/analytics/stock-valuation";
import { withTenantTx } from "@/lib/db";
import { DashboardAnalyticsClient, type RecentInvoiceRow } from "./_client";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const billingEnabled = ctx.enabledFeatures.gst_billing_pdf;
  const stockEnabled = ctx.enabledFeatures.dynamic_stock_matrix;
  const transferEnabled = ctx.enabledFeatures.stock_transfers;
  const profitAllowed = canAccess(ctx, "analytics.view_profit").allowed;
  const salesAllowed = canAccess(ctx, "analytics.view_sales").allowed;
  const showSales = billingEnabled && salesAllowed;

  const scope = await getBranchScope(ctx);
  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const isOwnerOrAdmin = ctx.user.role === "owner" || ctx.user.role === "branch_admin";
      const [salesRes, branchRes, trendRes, recentRes, stockValRes, inTransitRes, oversoldRes, stockValuation, periodProfit] = await Promise.all([
        billingEnabled
          ? client.query<{ today_sales: string; month_sales: string; total_dues: string }>(
              `SELECT
                 COALESCE(SUM(CASE WHEN (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date THEN grand_total ELSE 0 END), 0)::text AS today_sales,
                 COALESCE(SUM(grand_total), 0)::text AS month_sales,
                 COALESCE(SUM(due_amount), 0)::text AS total_dues
               FROM public.invoices
               WHERE tenant_id = $1 AND status NOT IN ('draft','cancelled') AND invoice_type = 'sale' AND branch_id = ANY($2::uuid[])
                 AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date`,
              [ctx.tenant!.id, scope.ids]
            )
          : Promise.resolve({ rows: [{ today_sales: "0", month_sales: "0", total_dues: "0" }] }),
        showSales && scope.ids.length > 1
          ? client.query<{ name: string; revenue: number; cogs: number }>(
              `SELECT b.name,
                      COALESCE(SUM(ii.line_total), 0)::float AS revenue,
                      COALESCE(SUM(ii.qty * ii.cost_price_snapshot), 0)::float AS cogs
               FROM public.branches b
               LEFT JOIN public.invoices i ON i.branch_id = b.id AND i.status NOT IN ('draft','cancelled') AND i.invoice_type = 'sale'
               LEFT JOIN public.invoice_items ii ON ii.invoice_id = i.id
               WHERE b.tenant_id = $1 AND b.id = ANY($2::uuid[])
               GROUP BY b.id, b.name`,
              [ctx.tenant!.id, scope.ids]
            )
          : Promise.resolve({ rows: [] }),
        showSales
          ? client.query<TrendBucketRow>(trendBucketsSql(true, true), [ctx.tenant!.id, scope.ids])
          : Promise.resolve({ rows: [] as TrendBucketRow[] }),
        showSales
          ? client.query<RecentInvoiceRow>(
              `/* recent_invoices */
               SELECT i.id, i.invoice_number, i.customer_snapshot->>'name' AS customer_name,
                      b.name AS branch_name, i.grand_total::text, i.due_amount::text, i.status, i.created_at
               FROM public.invoices i
               LEFT JOIN public.branches b ON b.id = i.branch_id
               WHERE i.tenant_id = $1 AND i.status <> 'draft' AND i.invoice_type = 'sale' AND i.branch_id = ANY($2::uuid[])
               ORDER BY i.created_at DESC
               LIMIT 8`,
              [ctx.tenant!.id, scope.ids]
            )
          : Promise.resolve({ rows: [] as RecentInvoiceRow[] }),
        stockEnabled
          ? client.query<{ total_qty: string; stock_val: string }>(
              `SELECT COALESCE(SUM(bs.quantity), 0)::text AS total_qty,
                      COALESCE(SUM(bs.quantity * pv.avg_cost), 0)::text AS stock_val
               FROM public.branch_stock bs
               JOIN public.product_variants pv ON pv.id = bs.variant_id
               WHERE bs.tenant_id = $1 AND bs.branch_id = ANY($2::uuid[])`,
              [ctx.tenant!.id, scope.ids]
            )
          : Promise.resolve({ rows: [{ total_qty: "0", stock_val: "0" }] }),
        transferEnabled
          ? client.query<{ cnt: string }>(
              "SELECT COUNT(*)::text AS cnt FROM public.stock_transfers WHERE tenant_id = $1 AND status = 'dispatched' AND (from_branch_id = ANY($2::uuid[]) OR to_branch_id = ANY($2::uuid[]))",
              [ctx.tenant!.id, scope.ids]
            )
          : Promise.resolve({ rows: [{ cnt: "0" }] }),
        billingEnabled
          ? client.query<{ cnt: string }>(
              "SELECT COUNT(*)::text AS cnt FROM public.invoices WHERE tenant_id = $1 AND has_oversold = true AND status <> 'cancelled' AND branch_id = ANY($2::uuid[])",
              [ctx.tenant!.id, scope.ids]
            )
          : Promise.resolve({ rows: [{ cnt: "0" }] }),
        stockEnabled || isOwnerOrAdmin
          ? loadStockValuation(client, ctx.tenant!.id, scope.ids)
          : Promise.resolve(null as StockValuationReport | null),
        billingEnabled || isOwnerOrAdmin
          ? loadPeriodProfitSummary(client, ctx.tenant!.id, scope.ids)
          : Promise.resolve(null as PeriodProfitSummary | null),
      ]);

      return {
        sales: salesRes.rows[0],
        branchCompare: branchRes.rows,
        trend: buildTrendSeries(trendRes.rows),
        recentInvoices: recentRes.rows,
        stock: stockValRes.rows[0],
        inTransitCount: Number(inTransitRes.rows[0]?.cnt ?? 0),
        oversoldCount: Number(oversoldRes.rows[0]?.cnt ?? 0),
        stockValuation,
        periodProfit,
      };
    }
  );

  return (
    <DashboardAnalyticsClient
      userName={ctx.user.full_name}
      todayLabel={new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}
      billingEnabled={showSales}
      canCreateBill={canAccess(ctx, "billing.create").allowed}
      stockEnabled={stockEnabled}
      transferEnabled={transferEnabled}
      profitAllowed={profitAllowed}
      sales={data.sales}
      branchCompare={data.branchCompare.map((b) => ({
        name: b.name,
        revenue: b.revenue,
        ...(profitAllowed ? { cogs: b.cogs } : {}),
      }))}
      trend={data.trend}
      recentInvoices={data.recentInvoices}
      stock={profitAllowed ? data.stock : { total_qty: data.stock.total_qty, stock_val: "0" }}
      stockValuation={data.stockValuation}
      periodProfit={data.periodProfit}
      showCostAndProfit={ctx.user.role === "owner" || ctx.user.role === "branch_admin" || profitAllowed}
      inTransitCount={data.inTransitCount}
      oversoldCount={data.oversoldCount}
    />
  );
}
