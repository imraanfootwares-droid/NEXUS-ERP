"use client";

import React, { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, FileSpreadsheet, FileText } from "lucide-react";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/primitives";
import { Segmented, StatTray, TrayCard } from "@/components/ui/spark";
import type {
  PeriodProfitSummary,
  ProductValuationRow,
  ProfitPeriodKey,
  StockValuationReport,
} from "@/lib/analytics/stock-valuation";

const inr = (n: number) =>
  `₹${Math.round(n).toLocaleString("en-IN")}`;

const CHART_MODES = ["Top Products", "By Category"] as const;
const PERIOD_OPTIONS: readonly ProfitPeriodKey[] = [
  "Today",
  "This Week",
  "This Month",
  "This Year",
  "All Time",
];

export function StockValuationPanel({
  report,
  periodProfit,
  showCostAndProfit,
}: {
  report: StockValuationReport;
  periodProfit?: PeriodProfitSummary | null;
  showCostAndProfit: boolean;
}) {
  const [chartMode, setChartMode] = useState<(typeof CHART_MODES)[number]>("Top Products");
  const [period, setPeriod] = useState<ProfitPeriodKey>("This Month");
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const { summary, products, byCategory } = report;
  const activePeriod = periodProfit?.[period] ?? null;

  const chartData =
    chartMode === "Top Products"
      ? products.slice(0, 10).map((p) => ({
          name: p.product_name.length > 14 ? `${p.product_name.slice(0, 14)}…` : p.product_name,
          fullName: `${p.product_name} (${p.model_code})`,
          Cost: Math.round(p.total_cost),
          Wholesale: Math.round(p.total_wholesale_value),
          Retail: Math.round(p.total_retail_value),
        }))
      : byCategory.slice(0, 10).map((c) => ({
          name: c.category.length > 14 ? `${c.category.slice(0, 14)}…` : c.category,
          fullName: c.category,
          Cost: Math.round(c.total_cost),
          Wholesale: Math.round(c.total_wholesale_value),
          Retail: Math.round(c.total_retail_value),
        }));

  const columns: ColumnDef<ProductValuationRow>[] = [
    {
      key: "product",
      header: "Product",
      mobilePrimary: true,
      sortValue: (p) => p.product_name.toLowerCase(),
      render: (p) => (
        <div>
          <div className="font-semibold text-slate-900">{p.product_name}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <span className="font-mono">{p.model_code}</span>
            <Badge variant="default">{p.category}</Badge>
          </div>
        </div>
      ),
    },
    {
      key: "qty",
      header: "Stock Qty",
      sortValue: (p) => p.stock_qty,
      render: (p) => (
        <span className="font-mono font-semibold text-slate-900">
          {p.stock_qty.toLocaleString("en-IN")} <span className="text-[11px] font-normal text-slate-500">{p.uom}</span>
        </span>
      ),
    },
    ...(showCostAndProfit
      ? [
          {
            key: "unit_cost",
            header: "Unit Cost",
            sortValue: (p: ProductValuationRow) => p.unit_cost,
            render: (p: ProductValuationRow) => (
              <span className="font-mono text-slate-700">{inr(p.unit_cost)}</span>
            ),
          } satisfies ColumnDef<ProductValuationRow>,
        ]
      : []),
    {
      key: "unit_prices",
      header: "Retail / Wholesale",
      sortValue: (p) => p.unit_retail,
      render: (p) => (
        <div className="font-mono text-xs">
          <div className="text-slate-900">R: {inr(p.unit_retail)}</div>
          <div className="text-[11px] text-slate-500">W: {inr(p.unit_wholesale)}</div>
        </div>
      ),
    },
    ...(showCostAndProfit
      ? [
          {
            key: "total_cost",
            header: "Total Stock Cost",
            sortValue: (p: ProductValuationRow) => p.total_cost,
            render: (p: ProductValuationRow) => (
              <span className="font-mono font-semibold text-slate-900">{inr(p.total_cost)}</span>
            ),
          } satisfies ColumnDef<ProductValuationRow>,
        ]
      : []),
    {
      key: "retail_outcome",
      header: "If Sold Retail",
      sortValue: (p) => p.total_retail_value,
      render: (p) => (
        <div className="font-mono">
          <div className="font-semibold text-slate-900">{inr(p.total_retail_value)}</div>
          {showCostAndProfit && (
            <div className={`text-[10.5px] font-medium ${p.expected_retail_profit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
              Profit: {p.expected_retail_profit >= 0 ? "+" : ""}
              {inr(p.expected_retail_profit)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "wholesale_outcome",
      header: "If Sold Wholesale",
      sortValue: (p) => p.total_wholesale_value,
      render: (p) => (
        <div className="font-mono">
          <div className="font-semibold text-slate-900">{inr(p.total_wholesale_value)}</div>
          {showCostAndProfit && (
            <div className={`text-[10.5px] font-medium ${p.expected_wholesale_profit >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
              Profit: {p.expected_wholesale_profit >= 0 ? "+" : ""}
              {inr(p.expected_wholesale_profit)}
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 pt-2">
      {/* Sales & Profit Margin by Period (Today / Week / Month / Year / All Time) */}
      {activePeriod && showCostAndProfit && (
        <div className="space-y-3 rounded-2xl border border-[#ececee] bg-white p-4 shadow-[0_1px_2px_rgba(0,0,0,.04)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-[15px] font-semibold text-[#171717]">
                Sales, Cost &amp; Profit Margin
              </h2>
              <p className="text-[12px] text-[#77777d]">
                Filter by day, week, month, or year to see your actual sales revenue, cost, and net profit.
              </p>
            </div>
            <Segmented
              label="Filter profit by period"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTray
              label={`Sales (${period})`}
              value={inr(activePeriod.revenue)}
              unit={`${activePeriod.bills} bills`}
              footnote={`${activePeriod.unitsSold.toLocaleString("en-IN")} pairs/pcs sold`}
            />
            <StatTray
              label="Cost of Sold Stock"
              value={inr(activePeriod.cost)}
              unit="Cost"
              footnote="Purchase / making cost of items sold"
            />
            <StatTray
              label="Net Profit"
              value={inr(activePeriod.profit)}
              unit={activePeriod.profit >= 0 ? "Profit" : "Loss"}
              footnote="Sales minus cost of sold items"
            />
            <StatTray
              label="Profit Margin"
              value={`${activePeriod.marginPct.toFixed(1)}%`}
              unit="Margin"
              footnote={`Profit percentage for ${period.toLowerCase()}`}
            />
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-[16px] font-semibold text-[#171717]">
            Stock Valuation &amp; Expected Outcome
          </h2>
          <p className="text-[12px] text-[#77777d]">
            Total stock on hand, investment cost, expected retail &amp; wholesale return across all products.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href="/api/exports/stock-valuation?format=pdf"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#171717] px-2.5 text-xs font-medium text-white hover:bg-[#2a2a2a]"
          >
            <FileText className="h-3.5 w-3.5" /> Export PDF
          </a>
          <a
            href="/api/exports/stock-valuation?format=xlsx"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </a>
          <a
            href="/api/exports/stock-valuation?format=csv"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </a>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatTray
          label="Total Stock"
          value={summary.totalUnits.toLocaleString("en-IN")}
          unit="Units"
          footnote={`Across ${summary.totalProducts} products`}
        />
        {showCostAndProfit && (
          <StatTray
            label="Total Stock Cost"
            value={inr(summary.totalStockCost)}
            unit="Cost"
            footnote="Total investment in hand"
          />
        )}
        <StatTray
          label="Retail Sale Value"
          value={inr(summary.totalRetailValue)}
          unit="Retail"
          footnote="If entire stock sells at retail"
        />
        {showCostAndProfit && (
          <StatTray
            label="Expected Retail Profit"
            value={inr(summary.expectedRetailProfit)}
            unit={`${summary.retailMarginPct.toFixed(1)}%`}
            footnote="Retail value minus stock cost"
          />
        )}
        <StatTray
          label="Wholesale Sale Value"
          value={inr(summary.totalWholesaleValue)}
          unit="Wholesale"
          footnote="If entire stock sells wholesale"
        />
        {showCostAndProfit && (
          <StatTray
            label="Expected Wholesale Profit"
            value={inr(summary.expectedWholesaleProfit)}
            unit={`${summary.wholesaleMarginPct.toFixed(1)}%`}
            footnote="Wholesale value minus cost"
          />
        )}
      </div>

      {/* Valuation Comparison Bar Chart */}
      {chartData.length > 0 && (
        <TrayCard
          title="Stock Cost vs Expected Retail & Wholesale Value"
          action={
            <Segmented
              label="Chart grouping"
              options={CHART_MODES}
              value={chartMode}
              onChange={setChartMode}
            />
          }
        >
          <div className="w-full pt-2" style={{ width: "100%", height: 300 }}>
            {mounted ? (
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 4, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#55555b" }}
                    axisLine={{ stroke: "#e4e4e7" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#55555b" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) =>
                      v >= 100000
                        ? `₹${(v / 100000).toFixed(1)}L`
                        : v >= 1000
                        ? `₹${(v / 1000).toFixed(0)}k`
                        : `₹${v}`
                    }
                  />
                  <Tooltip
                    formatter={(value) => inr(Number(value ?? 0))}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.fullName ?? ""}
                    contentStyle={{
                      borderRadius: 10,
                      border: "1px solid #e4e4e7",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {showCostAndProfit && (
                    <Bar dataKey="Cost" name="Stock Cost" fill="#64748b" radius={[4, 4, 0, 0]} />
                  )}
                  <Bar dataKey="Wholesale" name="Wholesale Value" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Retail" name="Retail Value" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[290px] w-full rounded-xl bg-slate-50" />
            )}
          </div>
        </TrayCard>
      )}

      {/* All Products Valuation Table */}
      <DataTable
        data={products}
        columns={columns}
        rowKey={(p) => p.product_id}
        pageSize={15}
        searchPlaceholder="Search product name, model code, or category..."
        searchFilter={(p, q) =>
          p.product_name.toLowerCase().includes(q) ||
          p.model_code.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        }
        emptyMessage="No active products in stock yet."
      />
    </div>
  );
}
