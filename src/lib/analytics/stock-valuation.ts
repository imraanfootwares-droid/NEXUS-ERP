import type { PoolClient } from "pg";

export interface ProductValuationRow {
  product_id: string;
  model_code: string;
  product_name: string;
  category: string;
  uom: string;
  stock_qty: number;
  unit_cost: number;
  unit_retail: number;
  unit_wholesale: number;
  total_cost: number;
  total_retail_value: number;
  total_wholesale_value: number;
  expected_retail_profit: number;
  expected_wholesale_profit: number;
}

export interface CategoryValuationBucket {
  category: string;
  stock_qty: number;
  total_cost: number;
  total_retail_value: number;
  total_wholesale_value: number;
  expected_retail_profit: number;
  expected_wholesale_profit: number;
}

export interface StockValuationReport {
  products: ProductValuationRow[];
  byCategory: CategoryValuationBucket[];
  summary: {
    totalProducts: number;
    totalUnits: number;
    totalStockCost: number;
    totalRetailValue: number;
    totalWholesaleValue: number;
    expectedRetailProfit: number;
    expectedWholesaleProfit: number;
    retailMarginPct: number;
    wholesaleMarginPct: number;
  };
}

export type ProfitPeriodKey = "Today" | "This Week" | "This Month" | "This Year" | "All Time";

export interface PeriodProfitMetric {
  revenue: number;
  cost: number;
  profit: number;
  marginPct: number;
  bills: number;
  unitsSold: number;
}

export type PeriodProfitSummary = Record<ProfitPeriodKey, PeriodProfitMetric>;

export async function loadPeriodProfitSummary(
  client: PoolClient,
  tenantId: string,
  branchIds: string[]
): Promise<PeriodProfitSummary> {
  const res = await client.query<{
    bucket: string;
    revenue: string;
    cost: string;
    bills: string;
    units_sold: string;
  }>(
    `WITH sales AS (
       SELECT
         i.id,
         (i.created_at AT TIME ZONE 'Asia/Kolkata')::date AS sale_date,
         COALESCE(SUM(ii.line_total), 0) AS rev,
         COALESCE(SUM(ii.qty * COALESCE(NULLIF(ii.cost_price_snapshot, 0), pv.avg_cost, pv.cost_price, 0)), 0) AS cogs,
         COALESCE(SUM(ii.qty), 0) AS qty
       FROM public.invoices i
       JOIN public.invoice_items ii ON ii.invoice_id = i.id AND ii.tenant_id = i.tenant_id
       LEFT JOIN public.product_variants pv ON pv.id = ii.variant_id
       WHERE i.tenant_id = $1
         AND i.branch_id = ANY($2::uuid[])
         AND i.status NOT IN ('draft', 'cancelled')
         AND i.invoice_type = 'sale'
       GROUP BY i.id, (i.created_at AT TIME ZONE 'Asia/Kolkata')::date
     ),
     now_ist AS (
       SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date AS today
     )
     SELECT 'Today' AS bucket,
            COALESCE(SUM(rev), 0)::text AS revenue,
            COALESCE(SUM(cogs), 0)::text AS cost,
            COUNT(*)::text AS bills,
            COALESCE(SUM(qty), 0)::text AS units_sold
     FROM sales, now_ist WHERE sale_date = today
     UNION ALL
     SELECT 'This Week',
            COALESCE(SUM(rev), 0)::text,
            COALESCE(SUM(cogs), 0)::text,
            COUNT(*)::text,
            COALESCE(SUM(qty), 0)::text
     FROM sales, now_ist WHERE sale_date >= today - 6
     UNION ALL
     SELECT 'This Month',
            COALESCE(SUM(rev), 0)::text,
            COALESCE(SUM(cogs), 0)::text,
            COUNT(*)::text,
            COALESCE(SUM(qty), 0)::text
     FROM sales, now_ist WHERE sale_date >= date_trunc('month', today)::date
     UNION ALL
     SELECT 'This Year',
            COALESCE(SUM(rev), 0)::text,
            COALESCE(SUM(cogs), 0)::text,
            COUNT(*)::text,
            COALESCE(SUM(qty), 0)::text
     FROM sales, now_ist WHERE sale_date >= date_trunc('year', today)::date
     UNION ALL
     SELECT 'All Time',
            COALESCE(SUM(rev), 0)::text,
            COALESCE(SUM(cogs), 0)::text,
            COUNT(*)::text,
            COALESCE(SUM(qty), 0)::text
     FROM sales`,
    [tenantId, branchIds]
  );

  const empty = (): PeriodProfitMetric => ({
    revenue: 0,
    cost: 0,
    profit: 0,
    marginPct: 0,
    bills: 0,
    unitsSold: 0,
  });

  const out: PeriodProfitSummary = {
    Today: empty(),
    "This Week": empty(),
    "This Month": empty(),
    "This Year": empty(),
    "All Time": empty(),
  };

  for (const row of res.rows) {
    const key = row.bucket as ProfitPeriodKey;
    if (!(key in out)) continue;
    const revenue = Number(row.revenue || 0);
    const cost = Number(row.cost || 0);
    const profit = revenue - cost;
    out[key] = {
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      bills: Number(row.bills || 0),
      unitsSold: Number(row.units_sold || 0),
    };
  }
  return out;
}

export async function loadStockValuation(
  client: PoolClient,
  tenantId: string,
  branchIds: string[]
): Promise<StockValuationReport> {
  const res = await client.query<{
    product_id: string;
    model_code: string;
    product_name: string;
    category: string | null;
    uom: string;
    stock_qty: string;
    unit_cost: string;
    unit_retail: string;
    unit_wholesale: string;
    total_cost: string;
    total_retail_value: string;
    total_wholesale_value: string;
  }>(
    `SELECT
       p.id AS product_id,
       p.model_code,
       p.name AS product_name,
       COALESCE(NULLIF(TRIM(p.category), ''), 'Uncategorized') AS category,
       p.uom,
       COALESCE(SUM(bs.quantity), 0)::text AS stock_qty,
       COALESCE(AVG(CASE WHEN pv.avg_cost > 0 THEN pv.avg_cost ELSE pv.cost_price END), 0)::text AS unit_cost,
       COALESCE(AVG(pv.selling_price), 0)::text AS unit_retail,
       COALESCE(AVG(pv.wholesale_price), 0)::text AS unit_wholesale,
       COALESCE(SUM(COALESCE(bs.quantity, 0) * CASE WHEN pv.avg_cost > 0 THEN pv.avg_cost ELSE pv.cost_price END), 0)::text AS total_cost,
       COALESCE(SUM(COALESCE(bs.quantity, 0) * pv.selling_price), 0)::text AS total_retail_value,
       COALESCE(SUM(COALESCE(bs.quantity, 0) * pv.wholesale_price), 0)::text AS total_wholesale_value
     FROM public.products p
     JOIN public.product_variants pv ON pv.product_id = p.id AND pv.is_active = true
     LEFT JOIN public.branch_stock bs
       ON bs.variant_id = pv.id
      AND bs.tenant_id = p.tenant_id
      AND bs.branch_id = ANY($2::uuid[])
     WHERE p.tenant_id = $1 AND p.is_active = true
     GROUP BY p.id, p.model_code, p.name, p.category, p.uom
     ORDER BY COALESCE(SUM(COALESCE(bs.quantity, 0) * pv.selling_price), 0) DESC, p.name ASC`,
    [tenantId, branchIds]
  );

  const products: ProductValuationRow[] = res.rows.map((r) => {
    const totalCost = Number(r.total_cost || 0);
    const totalRetail = Number(r.total_retail_value || 0);
    const totalWholesale = Number(r.total_wholesale_value || 0);
    return {
      product_id: r.product_id,
      model_code: r.model_code,
      product_name: r.product_name,
      category: r.category || "Uncategorized",
      uom: r.uom || "Pair",
      stock_qty: Number(r.stock_qty || 0),
      unit_cost: Number(r.unit_cost || 0),
      unit_retail: Number(r.unit_retail || 0),
      unit_wholesale: Number(r.unit_wholesale || 0),
      total_cost: totalCost,
      total_retail_value: totalRetail,
      total_wholesale_value: totalWholesale,
      expected_retail_profit: totalRetail - totalCost,
      expected_wholesale_profit: totalWholesale - totalCost,
    };
  });

  const catMap = new Map<string, CategoryValuationBucket>();
  let totalUnits = 0;
  let totalStockCost = 0;
  let totalRetailValue = 0;
  let totalWholesaleValue = 0;

  for (const p of products) {
    totalUnits += p.stock_qty;
    totalStockCost += p.total_cost;
    totalRetailValue += p.total_retail_value;
    totalWholesaleValue += p.total_wholesale_value;

    const existing = catMap.get(p.category) ?? {
      category: p.category,
      stock_qty: 0,
      total_cost: 0,
      total_retail_value: 0,
      total_wholesale_value: 0,
      expected_retail_profit: 0,
      expected_wholesale_profit: 0,
    };
    existing.stock_qty += p.stock_qty;
    existing.total_cost += p.total_cost;
    existing.total_retail_value += p.total_retail_value;
    existing.total_wholesale_value += p.total_wholesale_value;
    existing.expected_retail_profit += p.expected_retail_profit;
    existing.expected_wholesale_profit += p.expected_wholesale_profit;
    catMap.set(p.category, existing);
  }

  const byCategory = Array.from(catMap.values()).sort(
    (a, b) => b.total_retail_value - a.total_retail_value
  );

  const expectedRetailProfit = totalRetailValue - totalStockCost;
  const expectedWholesaleProfit = totalWholesaleValue - totalStockCost;
  const retailMarginPct =
    totalRetailValue > 0 ? (expectedRetailProfit / totalRetailValue) * 100 : 0;
  const wholesaleMarginPct =
    totalWholesaleValue > 0 ? (expectedWholesaleProfit / totalWholesaleValue) * 100 : 0;

  return {
    products,
    byCategory,
    summary: {
      totalProducts: products.length,
      totalUnits,
      totalStockCost,
      totalRetailValue,
      totalWholesaleValue,
      expectedRetailProfit,
      expectedWholesaleProfit,
      retailMarginPct,
      wholesaleMarginPct,
    },
  };
}
