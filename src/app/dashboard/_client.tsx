"use client";

import React, { useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, BarChart3, Download, Package, Plus } from "lucide-react";
import { formatCompactInr, percentChange, type TrendPoint, type TrendSeries } from "@/lib/analytics/trend";
import type { StockValuationReport } from "@/lib/analytics/stock-valuation";
import { Alert } from "@/components/ui/primitives";
import {
  NeedleChart,
  PixelTrendChart,
  Segmented,
  StatTray,
  StatusPill,
  TrayCard,
  type NeedleItem,
} from "@/components/ui/spark";

export interface RecentInvoiceRow {
  id: string;
  invoice_number: string | null;
  customer_name: string | null;
  branch_name: string | null;
  grand_total: string;
  due_amount: string;
  status: string;
  created_at: string;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const billed = (p?: TrendPoint) => (p ? p.collected + p.outstanding : 0);
const STATUS_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  paid: "success",
  partial: "warning",
  unpaid: "danger",
  cancelled: "neutral",
};

function downloadTrendCsv(points: TrendPoint[]) {
  const rows = [
    ["Week", "Bills", "Collected", "Outstanding"],
    ...points.map((p) => [p.label, String(p.bills), p.collected.toFixed(2), p.outstanding.toFixed(2)]),
  ];
  const csv = rows.map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "sales-trend.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function DashboardAnalyticsClient({
  userName,
  todayLabel,
  billingEnabled,
  stockEnabled,
  transferEnabled,
  profitAllowed,
  canCreateBill,
  sales,
  branchCompare,
  trend,
  recentInvoices,
  stock,
  stockValuation,
  inTransitCount,
  oversoldCount,
}: {
  userName: string;
  todayLabel: string;
  billingEnabled: boolean;
  stockEnabled: boolean;
  transferEnabled: boolean;
  profitAllowed: boolean;
  canCreateBill: boolean;
  sales: { today_sales: string; month_sales: string; total_dues: string };
  branchCompare: Array<{ name: string; revenue: number; cogs?: number }>;
  trend: TrendSeries;
  recentInvoices: RecentInvoiceRow[];
  stock: { total_qty: string; stock_val: string };
  stockValuation?: StockValuationReport | null;
  inTransitCount: number;
  oversoldCount: number;
}) {
  const [stockAlertFilter, setStockAlertFilter] = useState<"All" | "Out of Stock" | "Low Stock" | "In Stock">("All");
  const days = trend.Weekly;
  const months = trend.Yearly;
  const today = days[days.length - 1];
  const yesterday = days[days.length - 2];
  const thisMonth = months[months.length - 1];
  const lastMonth = months[months.length - 2];

  const breakdown: NeedleItem[] =
    branchCompare.length > 1
      ? branchCompare.map((b) => ({ label: b.name, value: b.revenue }))
      : days.slice(-14).map((d) => ({ label: d.label, value: d.collected, extra: d.outstanding }));
  const breakdownTotal = breakdown.reduce((sum, b) => sum + b.value + (b.extra ?? 0), 0);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h1>Welcome back, {userName.split(" ")[0]}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex h-8 items-center rounded-lg bg-white px-2.5 font-mono text-[11.5px] text-[#55555b] shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.08)]">
            {todayLabel}
          </span>
          {billingEnabled && (
            <button
              type="button"
              onClick={() => downloadTrendCsv(trend.Monthly)}
              className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[#171717] px-2.5 text-xs font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,.25),inset_0_1px_0_rgba(255,255,255,.12)] transition-colors hover:bg-[#2a2a2a]"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {oversoldCount > 0 && (
        <Alert variant="warning" title={`${oversoldCount} offline oversold bill${oversoldCount === 1 ? " needs" : "s need"} review`}>
          <div className="flex items-center justify-between gap-2">
            <span>Offline counter bills were accepted when stock was 0.</span>
            <Link href="/dashboard/billing" className="flex shrink-0 items-center gap-1 font-semibold underline">
              <AlertTriangle className="h-3.5 w-3.5" /> Review Bills
            </Link>
          </div>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {billingEnabled && (
          <>
            <StatTray
              label="Today's Sales"
              value={inr(Number(sales.today_sales))}
              needles={days.slice(-9).map(billed)}
              change={percentChange(billed(today), billed(yesterday))}
              changeSuffix="yesterday"
            />
            <StatTray
              label="Month Revenue"
              value={inr(Number(sales.month_sales))}
              needles={months.slice(-9).map(billed)}
              change={percentChange(billed(thisMonth), billed(lastMonth))}
            />
            <StatTray
              label="Receivables"
              value={inr(Number(sales.total_dues))}
              needles={months.slice(-9).map((m) => m.outstanding)}
              footnote="Open dues this month"
            />
          </>
        )}
        {stockEnabled && (
          <StatTray
            label="Inventory On Hand"
            value={Number(stock.total_qty).toLocaleString("en-IN")}
            unit="Units"
            footnote={profitAllowed ? `Value ${formatCompactInr(Number(stock.stock_val))}` : "Active stock units"}
          />
        )}
        {transferEnabled && !billingEnabled && (
          <StatTray label="In-Transit" value={inTransitCount} unit="Transfers" footnote="Dispatched, awaiting receipt" />
        )}
      </div>

      {billingEnabled && (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
            <TrayCard title="Sales Trend" hint="Sale invoices by IST date, excluding drafts and cancelled bills">
              <PixelTrendChart series={trend} format={formatCompactInr} />
            </TrayCard>

            <TrayCard title="Revenue Breakdown" hint={branchCompare.length > 1 ? "All-time revenue by branch" : "Daily sales, last 14 days"}>
              <div className="p-4">
                <p className="text-[11.5px] text-[#77777d]">
                  {branchCompare.length > 1 ? "Revenue by Branch" : "Last 14 Days"}
                </p>
                <p className="mt-0.5 font-mono text-[20px] font-semibold tracking-[-0.03em] text-[#171717]">
                  {inr(breakdownTotal)}
                </p>
                {transferEnabled && (
                  <Link
                    href="/dashboard/operations"
                    className="mt-3 flex items-center justify-between gap-2 rounded-lg bg-[#f4f4f5] px-2.5 py-2 text-xs text-[#3f3f46] transition-colors hover:bg-[#ececee]"
                  >
                    <span>{inTransitCount} transfer{inTransitCount === 1 ? "" : "s"} in transit</span>
                    <ArrowRight className="h-3.5 w-3.5 text-[#77777d]" />
                  </Link>
                )}
                <div className="mt-3">
                  <NeedleChart
                    items={breakdown}
                    format={inr}
                    height={transferEnabled ? 132 : 178}
                    emptyMessage="No sales yet"
                    valueLabel={branchCompare.length > 1 ? "Revenue" : "Collected"}
                    extraLabel={branchCompare.length > 1 ? undefined : "Outstanding"}
                  />
                </div>
              </div>
            </TrayCard>
          </div>

          <TrayCard
            title="Recent Transactions"
            action={
              <div className="flex items-center gap-1.5">
                <Link
                  href="/dashboard/billing"
                  className="inline-flex h-[30px] items-center rounded-lg px-2.5 text-xs font-medium text-[#55555b] hover:bg-white"
                >
                  View all
                </Link>
                {canCreateBill && (
                  <Link
                    href="/dashboard/billing/new"
                    className="inline-flex h-[30px] items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-medium text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.07)] hover:bg-[#fafafa]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add Transaction
                  </Link>
                )}
              </div>
            }
            bodyClassName="overflow-x-auto"
          >
            <table className="w-full text-left">
              <thead className="border-b border-[#ececee]">
                <tr>
                  <th className="px-4 py-2.5">ID</th>
                  <th className="px-4 py-2.5">Customer</th>
                  <th className="px-4 py-2.5">Branch</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Due</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f1f2]">
                {recentInvoices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-[#77777d]">No transactions yet.</td>
                  </tr>
                ) : (
                  recentInvoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="px-4 py-2.5 font-mono text-[#a3a3a8]">{inv.invoice_number ?? "Pending"}</td>
                      <td className="px-4 py-2.5 font-medium text-[#171717]">{inv.customer_name || "Walk-in"}</td>
                      <td className="px-4 py-2.5 text-[#55555b]">{inv.branch_name}</td>
                      <td className="px-4 py-2.5">
                        <StatusPill tone={STATUS_TONE[inv.status] ?? "neutral"}>{inv.status}</StatusPill>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#55555b]">{inr(Number(inv.due_amount))}</td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium tabular-nums text-[#171717]">{inr(Number(inv.grand_total))}</td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/dashboard/billing/${inv.id}/print`}
                          aria-label={`Open invoice ${inv.invoice_number ?? ""}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#55555b] shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#171717] hover:text-white"
                        >
                          <ArrowRight className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </TrayCard>
        </>
      )}

      {stockValuation && (() => {
        const LOW_LIMIT = 15;
        const ranked = [...stockValuation.products].sort((a, b) => a.stock_qty - b.stock_qty);
        const redItems = ranked.filter((p) => p.stock_qty <= 0);
        const yellowItems = ranked.filter((p) => p.stock_qty > 0 && p.stock_qty <= LOW_LIMIT);
        const greenItems = ranked.filter((p) => p.stock_qty > LOW_LIMIT);
        const shown =
          stockAlertFilter === "Out of Stock"
            ? redItems
            : stockAlertFilter === "Low Stock"
            ? yellowItems
            : stockAlertFilter === "In Stock"
            ? greenItems
            : ranked;

        return (
          <TrayCard
            title="Stock Status & Reorder Alerts"
            action={
              <div className="flex flex-wrap items-center gap-2">
                <Segmented
                  label="Filter stock status"
                  options={["All", "Out of Stock", "Low Stock", "In Stock"] as const}
                  value={stockAlertFilter}
                  onChange={setStockAlertFilter}
                />
                <Link
                  href="/dashboard/valuation"
                  className="inline-flex h-[30px] items-center gap-1.5 rounded-lg bg-[#171717] px-2.5 text-xs font-medium text-white transition-colors hover:bg-[#2a2a2a]"
                >
                  <BarChart3 className="h-3.5 w-3.5" /> Stock Value &amp; Graph →
                </Link>
              </div>
            }
          >
            <div className="space-y-4 p-3.5 sm:p-4">
              {/* Clean 3-Card Status Summary */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setStockAlertFilter(stockAlertFilter === "Out of Stock" ? "All" : "Out of Stock")}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border bg-white p-3.5 text-left transition-all ${
                    stockAlertFilter === "Out of Stock"
                      ? "border-rose-500 ring-2 ring-rose-500/15"
                      : "border-[#ececee] hover:border-rose-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-9 w-1.5 rounded-full bg-rose-500" />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Out of Stock</p>
                      <p className="text-[11px] text-[#77777d]">Order or add stock now</p>
                    </div>
                  </div>
                  <span className="font-mono text-xl font-bold text-rose-600">{redItems.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStockAlertFilter(stockAlertFilter === "Low Stock" ? "All" : "Low Stock")}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border bg-white p-3.5 text-left transition-all ${
                    stockAlertFilter === "Low Stock"
                      ? "border-amber-500 ring-2 ring-amber-500/15"
                      : "border-[#ececee] hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-9 w-1.5 rounded-full bg-amber-500" />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Running Low</p>
                      <p className="text-[11px] text-[#77777d]">1 to {LOW_LIMIT} units left</p>
                    </div>
                  </div>
                  <span className="font-mono text-xl font-bold text-amber-600">{yellowItems.length}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setStockAlertFilter(stockAlertFilter === "In Stock" ? "All" : "In Stock")}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border bg-white p-3.5 text-left transition-all ${
                    stockAlertFilter === "In Stock"
                      ? "border-emerald-500 ring-2 ring-emerald-500/15"
                      : "border-[#ececee] hover:border-emerald-300"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-9 w-1.5 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Good Stock</p>
                      <p className="text-[11px] text-[#77777d]">Ready for billing</p>
                    </div>
                  </div>
                  <span className="font-mono text-xl font-bold text-emerald-600">{greenItems.length}</span>
                </button>
              </div>

              {/* Product Cards with Photo & Details */}
              {shown.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#e4e4e7] bg-[#fafafa] py-8 text-center text-xs text-[#77777d]">
                  No products in this stock status.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {shown.slice(0, 12).map((p) => {
                    const status = p.stock_qty <= 0 ? "red" : p.stock_qty <= LOW_LIMIT ? "yellow" : "green";
                    const metaLine = [p.model_code, p.category, p.brand, p.hsn_code ? `HSN ${p.hsn_code}` : null]
                      .filter(Boolean)
                      .join(" · ");
                    const sizesText = p.sizes && p.sizes.length > 0 ? p.sizes.slice(0, 6).join(", ") : null;
                    const coloursText = p.colours && p.colours.length > 0 ? p.colours.slice(0, 4).join(", ") : null;

                    return (
                      <div
                        key={p.product_id}
                        className={`flex flex-col justify-between gap-3 rounded-xl border bg-white p-3.5 transition-all hover:shadow-xs ${
                          status === "red"
                            ? "border-rose-200/90 bg-rose-50/20"
                            : status === "yellow"
                            ? "border-amber-200/90 bg-amber-50/20"
                            : "border-[#ececee]"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Product Photo */}
                          <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-[#ececee] bg-[#fafafa] flex items-center justify-center">
                            {p.thumb_url ? (
                              <img
                                src={p.thumb_url}
                                alt={p.product_name}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <Package className="h-6 w-6 text-[#a3a3a8]" />
                            )}
                          </div>

                          {/* Product Name & Details */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-[13.5px] font-semibold text-[#171717]" title={p.product_name}>
                                {p.product_name}
                              </p>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                                  status === "red"
                                    ? "bg-rose-100 text-rose-800"
                                    : status === "yellow"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-emerald-100 text-emerald-800"
                                }`}
                              >
                                {status === "red"
                                  ? "Out of Stock"
                                  : status === "yellow"
                                  ? "Low Stock"
                                  : "In Stock"}
                              </span>
                            </div>

                            <p className="truncate text-[11px] text-[#77777d]">{metaLine}</p>

                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10.5px]">
                              {sizesText && (
                                <span className="rounded-md bg-[#f4f4f5] px-1.5 py-0.5 text-[#3f3f46]">
                                  Sizes: {sizesText}
                                </span>
                              )}
                              {coloursText && (
                                <span className="rounded-md bg-[#f4f4f5] px-1.5 py-0.5 text-[#3f3f46]">
                                  {coloursText}
                                </span>
                              )}
                              {!sizesText && !coloursText && p.variant_count ? (
                                <span className="rounded-md bg-[#f4f4f5] px-1.5 py-0.5 text-[#3f3f46]">
                                  {p.variant_count} {p.variant_count === 1 ? "option" : "options"}
                                </span>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Price, Stock Count & Action Footer */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#f1f1f2] pt-2.5 text-xs">
                          <div className="flex flex-wrap items-center gap-3">
                            <div>
                              <span className="block text-[10px] text-[#77777d]">Stock Left</span>
                              <span
                                className={`font-mono text-[12.5px] font-bold ${
                                  status === "red"
                                    ? "text-rose-700"
                                    : status === "yellow"
                                    ? "text-amber-700"
                                    : "text-[#171717]"
                                }`}
                              >
                                {p.stock_qty <= 0 ? `0 ${p.uom}` : `${p.stock_qty.toLocaleString("en-IN")} ${p.uom}`}
                              </span>
                            </div>
                            {p.unit_retail > 0 && (
                              <div className="border-l border-[#ececee] pl-3">
                                <span className="block text-[10px] text-[#77777d]">Retail Price</span>
                                <span className="font-mono text-[12.5px] font-semibold text-[#171717]">
                                  {inr(p.unit_retail)}
                                </span>
                              </div>
                            )}
                            {p.unit_wholesale > 0 && (
                              <div className="border-l border-[#ececee] pl-3">
                                <span className="block text-[10px] text-[#77777d]">Wholesale</span>
                                <span className="font-mono text-[12.5px] font-semibold text-[#55555b]">
                                  {inr(p.unit_wholesale)}
                                </span>
                              </div>
                            )}
                          </div>

                          <Link
                            href="/dashboard/stock"
                            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
                              status === "red"
                                ? "bg-rose-600 text-white hover:bg-rose-700"
                                : "bg-[#f4f4f5] text-[#171717] hover:bg-[#e4e4e7]"
                            }`}
                          >
                            {status === "red" ? "Order / Add Stock →" : "Add Stock →"}
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TrayCard>
        );
      })()}
    </div>
  );
}
