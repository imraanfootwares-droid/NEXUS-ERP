import type { PoolClient } from "pg";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";

export interface ProductValuationRow {
  product_id: string;
  model_code: string;
  product_name: string;
  category: string;
  brand?: string | null;
  hsn_code?: string | null;
  thumb_url?: string | null;
  variant_count?: number;
  sizes?: string[];
  colours?: string[];
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
  // Single-pass FILTER aggregation instead of 5 separate UNION ALL scans over the sales CTE
  const res = await client.query<{
    today_rev: string; today_cogs: string; today_bills: string; today_qty: string;
    week_rev: string; week_cogs: string; week_bills: string; week_qty: string;
    month_rev: string; month_cogs: string; month_bills: string; month_qty: string;
    year_rev: string; year_cogs: string; year_bills: string; year_qty: string;
    all_rev: string; all_cogs: string; all_bills: string; all_qty: string;
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
     SELECT
       COALESCE(SUM(rev) FILTER (WHERE sale_date = today), 0)::text AS today_rev,
       COALESCE(SUM(cogs) FILTER (WHERE sale_date = today), 0)::text AS today_cogs,
       COUNT(*) FILTER (WHERE sale_date = today)::text AS today_bills,
       COALESCE(SUM(qty) FILTER (WHERE sale_date = today), 0)::text AS today_qty,

       COALESCE(SUM(rev) FILTER (WHERE sale_date >= today - 6), 0)::text AS week_rev,
       COALESCE(SUM(cogs) FILTER (WHERE sale_date >= today - 6), 0)::text AS week_cogs,
       COUNT(*) FILTER (WHERE sale_date >= today - 6)::text AS week_bills,
       COALESCE(SUM(qty) FILTER (WHERE sale_date >= today - 6), 0)::text AS week_qty,

       COALESCE(SUM(rev) FILTER (WHERE sale_date >= date_trunc('month', today)::date), 0)::text AS month_rev,
       COALESCE(SUM(cogs) FILTER (WHERE sale_date >= date_trunc('month', today)::date), 0)::text AS month_cogs,
       COUNT(*) FILTER (WHERE sale_date >= date_trunc('month', today)::date)::text AS month_bills,
       COALESCE(SUM(qty) FILTER (WHERE sale_date >= date_trunc('month', today)::date), 0)::text AS month_qty,

       COALESCE(SUM(rev) FILTER (WHERE sale_date >= date_trunc('year', today)::date), 0)::text AS year_rev,
       COALESCE(SUM(cogs) FILTER (WHERE sale_date >= date_trunc('year', today)::date), 0)::text AS year_cogs,
       COUNT(*) FILTER (WHERE sale_date >= date_trunc('year', today)::date)::text AS year_bills,
       COALESCE(SUM(qty) FILTER (WHERE sale_date >= date_trunc('year', today)::date), 0)::text AS year_qty,

       COALESCE(SUM(rev), 0)::text AS all_rev,
       COALESCE(SUM(cogs), 0)::text AS all_cogs,
       COUNT(*)::text AS all_bills,
       COALESCE(SUM(qty), 0)::text AS all_qty
     FROM sales, now_ist`,
    [tenantId, branchIds]
  );

  const row = res.rows[0];
  const build = (revStr?: string, costStr?: string, billsStr?: string, qtyStr?: string): PeriodProfitMetric => {
    const revenue = Number(revStr || 0);
    const cost = Number(costStr || 0);
    const profit = revenue - cost;
    return {
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      bills: Number(billsStr || 0),
      unitsSold: Number(qtyStr || 0),
    };
  };

  return {
    Today: build(row?.today_rev, row?.today_cogs, row?.today_bills, row?.today_qty),
    "This Week": build(row?.week_rev, row?.week_cogs, row?.week_bills, row?.week_qty),
    "This Month": build(row?.month_rev, row?.month_cogs, row?.month_bills, row?.month_qty),
    "This Year": build(row?.year_rev, row?.year_cogs, row?.year_bills, row?.year_qty),
    "All Time": build(row?.all_rev, row?.all_cogs, row?.all_bills, row?.all_qty),
  };
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
    brand: string | null;
    hsn_code: string | null;
    primary_image_key: string | null;
    variant_count: string;
    sizes: string[] | null;
    colours: string[] | null;
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
       p.brand,
       p.hsn_code,
       p.primary_image_key,
       COUNT(DISTINCT pv.id)::text AS variant_count,
       COALESCE(
         ARRAY_AGG(DISTINCT NULLIF(TRIM(COALESCE(pv.attributes->>'size', pv.attributes->>'Size', '')), ''))
           FILTER (WHERE NULLIF(TRIM(COALESCE(pv.attributes->>'size', pv.attributes->>'Size', '')), '') IS NOT NULL),
         '{}'::text[]
       ) AS sizes,
       COALESCE(
         ARRAY_AGG(DISTINCT NULLIF(TRIM(COALESCE(pv.attributes->>'colour', pv.attributes->>'Colour', pv.attributes->>'color', pv.attributes->>'Color', '')), ''))
           FILTER (WHERE NULLIF(TRIM(COALESCE(pv.attributes->>'colour', pv.attributes->>'Colour', pv.attributes->>'color', pv.attributes->>'Color', '')), '') IS NOT NULL),
         '{}'::text[]
       ) AS colours,
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
     GROUP BY p.id, p.model_code, p.name, p.category, p.brand, p.hsn_code, p.primary_image_key, p.uom
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
      brand: r.brand || null,
      hsn_code: r.hsn_code || null,
      thumb_url: r.primary_image_key ? getPublicAssetUrl(deriveThumbKey(r.primary_image_key)) : null,
      variant_count: Number(r.variant_count || 0),
      sizes: Array.isArray(r.sizes) ? r.sizes : [],
      colours: Array.isArray(r.colours) ? r.colours : [],
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
