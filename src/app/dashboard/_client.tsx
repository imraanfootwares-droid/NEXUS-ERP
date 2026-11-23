"use client";

import React from "react";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Boxes, IndianRupee, TrendingUp, Truck } from "lucide-react";
import { KpiGrid } from "@/components/ui/kpi-grid";
import { Alert, Card, CardContent, CardHeader } from "@/components/ui/primitives";

export function DashboardAnalyticsClient({
  tenantName,
  billingEnabled,
  stockEnabled,
  transferEnabled,
  profitAllowed,
  sales,
  branchCompare,
  trend,
  stock,
  inTransitCount,
  oversoldCount,
}: {
  tenantName: string;
  billingEnabled: boolean;
  stockEnabled: boolean;
  transferEnabled: boolean;
  profitAllowed: boolean;
  sales: { today_sales: string; month_sales: string; total_dues: string };
  branchCompare: Array<{ name: string; revenue: number; cogs: number }>;
  trend: Array<{ day: string; sales: number; profit: number }>;
  stock: { total_qty: string; stock_val: string };
  inTransitCount: number;
  oversoldCount: number;
}) {
  const kpis = [
    ...(billingEnabled
      ? [
          {
            label: "Today's Sales (IST)",
            value: `₹${Number(sales.today_sales).toLocaleString("en-IN")}`,
            subtext: `Month: ₹${Number(sales.month_sales).toLocaleString("en-IN")}`,
            tone: "info" as const,
            icon: <IndianRupee className="h-4 w-4" />,
          },
          {
            label: "Month Receivables",
            value: `₹${Number(sales.total_dues).toLocaleString("en-IN")}`,
            subtext: "Open customer dues",
            tone: Number(sales.total_dues) > 0 ? ("warning" as const) : ("default" as const),
            icon: <TrendingUp className="h-4 w-4" />,
          },
        ]
      : []),
    ...(stockEnabled
      ? [
          {
            label: "Inventory On Hand",
            value: `${Number(stock.total_qty).toLocaleString("en-IN")}`,
            subtext: profitAllowed ? `Value: ₹${Math.round(Number(stock.stock_val)).toLocaleString("en-IN")}` : "Active stock units",
            tone: "success" as const,
            icon: <Boxes className="h-4 w-4" />,
          },
        ]
      : []),
    ...(transferEnabled
      ? [
          {
            label: "In-Transit Transfers",
            value: inTransitCount,
            subtext: "Dispatched awaiting receive",
            tone: inTransitCount > 0 ? ("warning" as const) : ("default" as const),
            icon: <Truck className="h-4 w-4" />,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">{tenantName} — Overview</h1>
        <p className="text-sm text-slate-600">Live operational &amp; financial analytics.</p>
      </div>

      {oversoldCount > 0 && (
        <Alert variant="warning" title={`${oversoldCount} Offline Oversold Bill(s) Need Review`}>
          <div className="flex items-center justify-between gap-2">
            <span>Offline counter bills were accepted when stock was 0.</span>
            <Link href="/dashboard/billing" className="font-bold underline flex items-center gap-1">
              <AlertTriangle className="h-4 w-4" /> Review Bills
            </Link>
          </div>
        </Alert>
      )}

      {kpis.length > 0 && <KpiGrid items={kpis} />}

      {billingEnabled && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-900">
                14-Day Sales {profitAllowed ? "& Gross Profit" : ""} Trend
              </h3>
            </CardHeader>
            <CardContent className="h-72">
              {trend.length === 0 ? (
                <p className="text-xs text-slate-500 pt-12 text-center">No sales recorded in the last 14 days.</p>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="sales" stroke="#0284c7" strokeWidth={2} name="Sales ₹" />
                    {profitAllowed && (
                      <Line type="monotone" dataKey="profit" stroke="#16a34a" strokeWidth={2} name="Gross Profit ₹" />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {branchCompare.length > 0 && (
            <Card>
              <CardHeader>
                <h3 className="text-sm font-semibold text-slate-900">Branch Revenue Comparison</h3>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchCompare}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="revenue" fill="#0284c7" name="Revenue ₹" />
                    {profitAllowed && <Bar dataKey="cogs" fill="#94a3b8" name="Weighted COGS ₹" />}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
