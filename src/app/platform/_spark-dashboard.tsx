"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Download, Network, Plus, Search } from "lucide-react";
import { Paged } from "@/components/ui/pagination";
import { formatCompactInr, percentChange, type TrendSeries } from "@/lib/analytics/trend";
import type { TierKey } from "@/lib/constants/saas";
import {
  NeedleChart,
  PixelTrendChart,
  Segmented,
  StatTray,
  StatusPill,
  TrayCard,
} from "@/components/ui/spark";

export interface SparkTenantRow {
  id: string;
  name: string;
  slug: string;
  vertical_key: string;
  tier: TierKey;
  status: string;
  max_users: number;
  active_users: number;
  storage_mb: string;
  created_at: string;
}

export interface SparkAuditRow {
  id: string;
  action: string;
  entity_type: string | null;
  created_at: string;
}

export interface SparkFeatureRow {
  label: string;
  category: string;
  tierCount: number;
  overrideCount: number;
}

const TABLE_TABS = ["Workspaces", "Audit Log"] as const;

const CATEGORY_SHORT: Array<[string, string]> = [
  ["Core", "CORE"],
  ["Billing", "BILL"],
  ["Analytics", "STAT"],
  ["Reports", "GST"],
  ["CRM", "CRM"],
  ["Inventory", "STCK"],
  ["Multi-Branch", "BRCH"],
  ["Operations", "OPS"],
  ["Storefront", "WEB"],
];

function downloadCsv(tenants: SparkTenantRow[]) {
  const rows = [
    ["Slug", "Business Name", "Vertical", "Tier", "Status", "Active Users", "Max Users", "Storage MB"],
    ...tenants.map((t) => [
      t.slug,
      t.name,
      t.vertical_key,
      t.tier,
      t.status,
      String(t.active_users),
      String(t.max_users),
      t.storage_mb,
    ]),
  ];
  // Prefix formula-like cells so spreadsheet apps treat tenant text as data.
  const safe = (v: string) => (/^[=+\-@]/.test(v) ? `'${v}` : v);
  const csv = rows.map((r) => r.map((v) => `"${safe(v).replace(/"/g, '""')}"`).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "nexus-erp-tenants.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function SparkPlatformDashboard({
  ownerName,
  todayLabel,
  tenants,
  activeStaff,
  totalStaff,
  pendingResetsCount,
  totalStorageMb,
  storageCapacityMb,
  featureCoverage,
  audits,
  trend,
  newTenantsByMonth,
  newUsersByMonth,
  resetQueueSlot,
}: {
  ownerName: string;
  todayLabel: string;
  tenants: SparkTenantRow[];
  activeStaff: number;
  totalStaff: number;
  pendingResetsCount: number;
  totalStorageMb: string;
  storageCapacityMb: number;
  featureCoverage: SparkFeatureRow[];
  audits: SparkAuditRow[];
  trend: TrendSeries;
  newTenantsByMonth: number[];
  newUsersByMonth: number[];
  resetQueueSlot?: React.ReactNode;
}) {
  const [tableSearch, setTableSearch] = useState("");
  const [tableTab, setTableTab] = useState<(typeof TABLE_TABS)[number]>("Workspaces");

  const activeTenants = tenants.filter((t) => t.status === "active").length;
  const totalSeats = tenants.reduce((s, t) => s + t.max_users, 0);
  const enabledModules = featureCoverage.filter((f) => f.tierCount + f.overrideCount > 0).length;
  const adoption = CATEGORY_SHORT.flatMap(([category, short]) => {
    const group = featureCoverage.filter((f) => f.category === category);
    if (group.length === 0 || tenants.length === 0) return [];
    const possible = group.length * tenants.length;
    const pct = (n: number) => (n / possible) * 100;
    return [
      {
        label: category,
        short,
        value: pct(group.reduce((s, f) => s + f.tierCount, 0)),
        extra: pct(group.reduce((s, f) => s + f.overrideCount, 0)),
      },
    ];
  });
  const overallAdoption = adoption.length
    ? adoption.reduce((s, a) => s + a.value + a.extra, 0) / adoption.length
    : 0;
  const storagePct = storageCapacityMb > 0 ? (Number(totalStorageMb) / storageCapacityMb) * 100 : 0;

  const months = trend.Yearly;
  const thisMonth = months[months.length - 1];
  const lastMonth = months[months.length - 2];
  const billed = (p?: { collected: number; outstanding: number }) => (p ? p.collected + p.outstanding : 0);

  const filteredTenants = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return tenants;
    return tenants.filter((t) =>
      [t.name, t.slug, t.vertical_key, t.status].some((v) => v.toLowerCase().includes(q))
    );
  }, [tenants, tableSearch]);

  const filteredAudits = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return audits;
    return audits.filter((a) => a.action.toLowerCase().includes(q) || (a.entity_type ?? "").toLowerCase().includes(q));
  }, [audits, tableSearch]);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h1>Welcome back, {ownerName.split(" ")[0] || "Admin"}</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex h-8 items-center rounded-lg bg-white px-2.5 font-mono text-[11.5px] text-[#55555b] shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.08)]">
            {todayLabel}
          </span>
          <Link
            href="/platform/organisation"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-[#27272a] shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#fafafa]"
          >
            <Network className="h-3.5 w-3.5" />
            Organisation
          </Link>
          <button
            type="button"
            onClick={() => downloadCsv(tenants)}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[#171717] px-2.5 text-xs font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,.25),inset_0_1px_0_rgba(255,255,255,.12)] transition-colors hover:bg-[#2a2a2a]"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTray
          label="Active Tenants"
          value={activeTenants}
          unit={`of ${tenants.length}`}
          needles={newTenantsByMonth}
          footnote="New workspaces by month"
        />
        <StatTray
          label="Active Staff"
          value={activeStaff}
          unit={`of ${totalStaff} users`}
          needles={newUsersByMonth}
          footnote={`${totalSeats} seats provisioned`}
        />
        <StatTray
          label="Billed This Month"
          value={formatCompactInr(billed(thisMonth))}
          needles={months.slice(-9).map(billed)}
          change={percentChange(billed(thisMonth), billed(lastMonth))}
        />
        <StatTray
          label="Cloud Storage"
          value={totalStorageMb}
          unit="MB"
          meter={storagePct}
          footnote={`${storagePct.toFixed(1)}% of ${storageCapacityMb.toLocaleString("en-IN")} MB quota`}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
        <TrayCard title="Billing Trend" hint="Real invoices across all workspaces, in IST">
          <PixelTrendChart series={trend} format={formatCompactInr} />
        </TrayCard>

        <TrayCard title="Module Adoption" hint="Share of workspaces using each module group">
          <div className="p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11.5px] text-[#77777d]">Average adoption</p>
                <p className="mt-0.5 font-mono text-[20px] font-semibold tracking-[-0.03em] text-[#171717]">
                  {Math.round(overallAdoption)}%
                </p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[10.5px] text-[#55555b] shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
                {enabledModules}/{featureCoverage.length} modules
              </span>
            </div>
            <div className="mt-3">
              <NeedleChart
                height={190}
                max={100}
                format={(n) => `${Math.round(n)}%`}
                emptyMessage="No workspaces yet"
                items={adoption}
                valueLabel="Plan"
                extraLabel="Custom"
              />
            </div>
          </div>
        </TrayCard>
      </div>

      {pendingResetsCount > 0 && resetQueueSlot}

      <TrayCard
        title="Recent Activity"
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <Segmented label="Table view" options={TABLE_TABS} value={tableTab} onChange={setTableTab} />
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#a3a3a8]" />
              <input
                type="search"
                aria-label={`Search ${tableTab.toLowerCase()}`}
                value={tableSearch}
                onChange={(e) => setTableSearch(e.target.value)}
                placeholder={`Search ${tableTab.toLowerCase()}...`}
                className="h-[30px] w-40 rounded-lg bg-white pl-8 pr-2 text-xs text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.07)] placeholder:text-[#a3a3a8] focus:shadow-[0_0_0_1px_#171717] focus:outline-none sm:w-52"
              />
            </div>
            <Link
              href="/platform/tenants"
              className="inline-flex h-[30px] items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-medium text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.07)] hover:bg-[#fafafa]"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Tenant
            </Link>
          </div>
        }
        bodyClassName="overflow-x-auto"
      >
        {tableTab === "Workspaces" ? (
          <table className="w-full text-left">
            <thead className="border-b border-[#ececee]">
              <tr>
                {["Slug", "Workspace", "Vertical", "Status", "Seats", "Tier", "Storage"].map((h) => (
                  <th key={h} className="px-4 py-2.5">{h}</th>
                ))}
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f1f2]">
              {filteredTenants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-[#77777d]">
                    {tenants.length === 0 ? "No workspaces yet." : "No workspaces match your search."}
                  </td>
                </tr>
              ) : (
                <Paged items={filteredTenants} size={8} asRow>{(pagedRows) => pagedRows.map((t) => (
                  <tr key={t.id}>
                    <td className="px-4 py-2.5 font-mono text-[#a3a3a8]">/{t.slug}</td>
                    <td className="px-4 py-2.5 font-medium text-[#171717]">{t.name}</td>
                    <td className="px-4 py-2.5 capitalize text-[#55555b]">{t.vertical_key}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill tone={t.status === "active" ? "success" : "warning"}>{t.status}</StatusPill>
                    </td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">{t.active_users} / {t.max_users}</td>
                    <td className="px-4 py-2.5 font-mono uppercase text-[#55555b]">{t.tier.replace("tier_", "T")}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-[#55555b]">{t.storage_mb} MB</td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/platform/tenants/${t.id}`}
                        aria-label={`Open ${t.name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#55555b] shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#171717] hover:text-white"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </td>
                  </tr>
                ))}</Paged>
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-left">
            <thead className="border-b border-[#ececee]">
              <tr>
                <th className="px-4 py-2.5">Event</th>
                <th className="px-4 py-2.5">Entity</th>
                <th className="px-4 py-2.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f1f2]">
              {filteredAudits.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-10 text-center text-[#77777d]">No audit events found.</td>
                </tr>
              ) : (
                <Paged items={filteredAudits} size={8} asRow>{(pagedRows) => pagedRows.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2.5 font-medium text-[#171717]">{a.action}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill tone="neutral">{a.entity_type || "platform"}</StatusPill>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] text-[#77777d]" suppressHydrationWarning>
                      {new Date(a.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </td>
                  </tr>
                ))}</Paged>
              )}
            </tbody>
          </table>
        )}
      </TrayCard>
    </div>
  );
}
