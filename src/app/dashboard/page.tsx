import { canAccess, isFeatureEnabled } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { DashboardAnalyticsClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function DashboardOverviewPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const billingEnabled = isFeatureEnabled(ctx.tenant, "gst_billing_pdf");
  const stockEnabled = isFeatureEnabled(ctx.tenant, "dynamic_stock_matrix");
  const transferEnabled = isFeatureEnabled(ctx.tenant, "stock_transfers");
  const profitAllowed = canAccess(ctx, "analytics.view_profit").allowed;
  const salesAllowed = canAccess(ctx, "analytics.view_sales").allowed;

  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [salesRes, branchRes, trendRes, stockValRes, inTransitRes, oversoldRes] = await Promise.all([
        billingEnabled
          ? client.query<{ today_sales: string; month_sales: string; total_dues: string }>(
              `SELECT
                 COALESCE(SUM(CASE WHEN (created_at AT TIME ZONE 'Asia/Kolkata')::date = (now() AT TIME ZONE 'Asia/Kolkata')::date THEN grand_total ELSE 0 END), 0)::text AS today_sales,
                 COALESCE(SUM(grand_total), 0)::text AS month_sales,
                 COALESCE(SUM(due_amount), 0)::text AS total_dues
               FROM public.invoices
               WHERE tenant_id = $1 AND status NOT IN ('draft','cancelled') AND invoice_type = 'sale'
                 AND (created_at AT TIME ZONE 'Asia/Kolkata')::date >= date_trunc('month', now() AT TIME ZONE 'Asia/Kolkata')::date`,
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [{ today_sales: "0", month_sales: "0", total_dues: "0" }] }),
        billingEnabled && ctx.branches.length > 1
          ? client.query<{ name: string; revenue: number; cogs: number }>(
              `SELECT b.name,
                      COALESCE(SUM(ii.line_total), 0)::float AS revenue,
                      COALESCE(SUM(ii.qty * ii.cost_price_snapshot), 0)::float AS cogs
               FROM public.branches b
               LEFT JOIN public.invoices i ON i.branch_id = b.id AND i.status NOT IN ('draft','cancelled') AND i.invoice_type = 'sale'
               LEFT JOIN public.invoice_items ii ON ii.invoice_id = i.id
               WHERE b.tenant_id = $1
               GROUP BY b.id, b.name`,
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [] }),
        billingEnabled
          ? client.query<{ day: string; sales: number; profit: number }>(
              `SELECT TO_CHAR((i.created_at AT TIME ZONE 'Asia/Kolkata')::date, 'DD Mon') AS day,
                      COALESCE(SUM(ii.line_total), 0)::float AS sales,
                      COALESCE(SUM(ii.line_total - (ii.qty * ii.cost_price_snapshot)), 0)::float AS profit
               FROM public.invoices i
               JOIN public.invoice_items ii ON ii.invoice_id = i.id
               WHERE i.tenant_id = $1 AND i.status NOT IN ('draft','cancelled') AND i.invoice_type = 'sale'
                 AND i.created_at >= now() - interval '14 days'
               GROUP BY (i.created_at AT TIME ZONE 'Asia/Kolkata')::date
               ORDER BY (i.created_at AT TIME ZONE 'Asia/Kolkata')::date ASC`,
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [] }),
        stockEnabled
          ? client.query<{ total_qty: string; stock_val: string }>(
              `SELECT COALESCE(SUM(bs.quantity), 0)::text AS total_qty,
                      COALESCE(SUM(bs.quantity * pv.avg_cost), 0)::text AS stock_val
               FROM public.branch_stock bs
               JOIN public.product_variants pv ON pv.id = bs.variant_id
               WHERE bs.tenant_id = $1`,
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [{ total_qty: "0", stock_val: "0" }] }),
        transferEnabled
          ? client.query<{ cnt: string }>(
              "SELECT COUNT(*)::text AS cnt FROM public.stock_transfers WHERE tenant_id = $1 AND status = 'dispatched'",
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [{ cnt: "0" }] }),
        billingEnabled
          ? client.query<{ cnt: string }>(
              "SELECT COUNT(*)::text AS cnt FROM public.invoices WHERE tenant_id = $1 AND has_oversold = true AND status <> 'cancelled'",
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [{ cnt: "0" }] }),
      ]);

      return {
        sales: salesRes.rows[0],
        branchCompare: branchRes.rows,
        trend: trendRes.rows,
        stock: stockValRes.rows[0],
        inTransitCount: Number(inTransitRes.rows[0]?.cnt ?? 0),
        oversoldCount: Number(oversoldRes.rows[0]?.cnt ?? 0),
      };
    }
  );

  return (
    <DashboardAnalyticsClient
      tenantName={ctx.tenant.name}
      billingEnabled={billingEnabled && salesAllowed}
      stockEnabled={stockEnabled}
      transferEnabled={transferEnabled}
      profitAllowed={profitAllowed}
      sales={data.sales}
      branchCompare={data.branchCompare}
      trend={data.trend}
      stock={data.stock}
      inTransitCount={data.inTransitCount}
      oversoldCount={data.oversoldCount}
    />
  );
}
