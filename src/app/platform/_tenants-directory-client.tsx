"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ExternalLink,
  GitBranch,
  HardDrive,
  Search,
  Sliders,
  Sparkles,
  Users,
} from "lucide-react";
import { FEATURE_KEYS, TIER_META, type TierKey } from "@/lib/constants/saas";
import { isFeatureEnabled } from "@/lib/auth/access";
import { ProvisionTenantModal } from "@/app/platform/_client";
import type { FeatureKey } from "@/lib/constants/saas";

export interface DirectoryTenantRow {
  id: string;
  name: string;
  slug: string;
  vertical_key: string;
  tier: TierKey;
  status: string;
  custom_domain: string | null;
  max_users: number;
  max_branches: number;
  storage_used_bytes: string;
  max_storage_mb: number;
  user_count: string;
  branch_count: string;
  feature_overrides: Partial<Record<FeatureKey, boolean>> | null;
}

const TIER_PILL_STYLES: Record<TierKey, string> = {
  tier_1: "bg-slate-100 text-slate-700 border-slate-200",
  tier_2: "bg-sky-50 text-sky-700 border-sky-200",
  tier_3: "bg-indigo-50 text-indigo-700 border-indigo-200",
  tier_4: "bg-gradient-to-r from-[#4B5A94] to-indigo-600 text-white border-transparent",
};

export function TenantsDirectoryClient({ tenants }: { tenants: DirectoryTenantRow[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "suspended">("all");
  const [tierFilter, setTierFilter] = useState<"all" | TierKey>("all");
  const [openingId, setOpeningId] = useState<string | null>(null);

  const stats = useMemo(() => {
    const active = tenants.filter((t) => t.status === "active").length;
    const totalUsers = tenants.reduce((acc, t) => acc + Number(t.user_count || 0), 0);
    const totalOverrides = tenants.reduce(
      (acc, t) => acc + Object.keys(t.feature_overrides ?? {}).length,
      0
    );
    const totalMb = tenants.reduce(
      (acc, t) => acc + Number(t.storage_used_bytes || 0) / (1024 * 1024),
      0
    );
    return { active, totalUsers, totalOverrides, totalMb };
  }, [tenants]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (tierFilter !== "all" && t.tier !== tierFilter) return false;
      if (
        q &&
        !t.name.toLowerCase().includes(q) &&
        !t.slug.toLowerCase().includes(q) &&
        !t.vertical_key.toLowerCase().includes(q) &&
        !(t.custom_domain ?? "").toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [tenants, search, statusFilter, tierFilter]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-[#4B5A94] mb-1.5">
            <Sparkles className="h-3 w-3" />
            Super Admin Control Plane
          </div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900">
            Tenant Workspaces
          </h1>
          <p className="text-sm text-slate-500">
            Launch clients, mix &amp; match cross-tier modules, and inspect live workspace capacity.
          </p>
        </div>
        <ProvisionTenantModal />
      </div>

      {/* Live Fleet KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Active Workspaces</span>
            <Building2 className="h-4 w-4 text-[#4B5A94]" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-slate-900">{stats.active}</span>
            <span className="text-xs text-slate-400">/ {tenants.length} total</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Provisioned Seats</span>
            <Users className="h-4 w-4 text-sky-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-slate-900">{stats.totalUsers}</span>
            <span className="text-xs text-slate-400">across fleet</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Mix &amp; Match Overrides</span>
            <Sliders className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-slate-900">
              {stats.totalOverrides}
            </span>
            <span className="text-xs text-slate-400">custom flags</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>R2 Cloud Media</span>
            <HardDrive className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-display text-2xl font-bold text-slate-900">
              {stats.totalMb.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400">MB used</span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border border-slate-200/80 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="relative flex-1 max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search client name, slug, vertical, domain..."
            className="w-full rounded-xl border border-slate-200 bg-slate-50/70 pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#4B5A94] focus:bg-white focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
            {(["all", "active", "suspended"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`rounded-lg px-3 py-1 font-medium capitalize transition-all cursor-pointer ${
                  statusFilter === s
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs">
            {(["all", "tier_1", "tier_2", "tier_3", "tier_4"] as const).map((tk) => (
              <button
                key={tk}
                type="button"
                onClick={() => setTierFilter(tk)}
                className={`rounded-lg px-2.5 py-1 font-medium transition-all cursor-pointer ${
                  tierFilter === tk
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-500 hover:text-slate-900"
                }`}
              >
                {tk === "all" ? "All Tiers" : tk.replace("tier_", "T")}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Workspace Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
          <p className="text-sm font-semibold text-slate-700">No workspaces match your filter</p>
          <p className="mt-1 text-xs text-slate-500">
            Try clearing your search or provision a new client above.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map((t) => {
            const seatsUsed = Number(t.user_count || 0);
            const seatPct = Math.min(100, Math.round((seatsUsed / Math.max(1, t.max_users)) * 100));
            const branchUsed = Number(t.branch_count || 0);
            const branchPct = Math.min(
              100,
              Math.round((branchUsed / Math.max(1, t.max_branches)) * 100)
            );
            const mbUsed = Number(t.storage_used_bytes || 0) / (1024 * 1024);
            const overrideCount = Object.keys(t.feature_overrides ?? {}).length;
            const activeFeaturesCount = FEATURE_KEYS.filter((fk) =>
              isFeatureEnabled(
                { tier: t.tier, feature_overrides: t.feature_overrides ?? {} },
                fk
              )
            ).length;
            const initials = t.name
              .split(/\s+/)
              .slice(0, 2)
              .map((w) => w[0]?.toUpperCase() ?? "")
              .join("");

            return (
              <div
                key={t.id}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-200/85 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#4B5A94]/40 hover:shadow-[0_12px_28px_-12px_rgba(75,90,148,0.22)]"
              >
                <div className="space-y-4">
                  {/* Top Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#0B1120] to-[#4B5A94] font-display text-sm font-bold text-white shadow-xs">
                        {initials || "NX"}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate font-display text-base font-bold text-slate-900">
                          {t.name}
                        </h3>
                        <p className="truncate text-xs text-slate-500">
                          /{t.slug} • <span className="capitalize">{t.vertical_key}</span>
                        </p>
                      </div>
                    </div>

                    <span
                      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                        t.status === "active"
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-rose-50 text-rose-700"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          t.status === "active" ? "bg-emerald-500" : "bg-rose-500"
                        }`}
                      />
                      {t.status === "active" ? "Active" : "Suspended"}
                    </span>
                  </div>

                  {/* Tier + Feature Mix Pill Row */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`inline-flex items-center rounded-lg border px-2.5 py-0.5 text-[11px] font-semibold ${TIER_PILL_STYLES[t.tier]}`}
                    >
                      {TIER_META[t.tier].name.split("—")[0].trim()}
                    </span>
                    <span className="inline-flex items-center rounded-lg bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-700">
                      {activeFeaturesCount}/{FEATURE_KEYS.length} modules
                    </span>
                    {overrideCount > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        <Sliders className="h-3 w-3" />
                        {overrideCount} custom
                      </span>
                    )}
                  </div>

                  {/* Capacity Bars */}
                  <div className="rounded-xl bg-slate-50/90 border border-slate-100 p-3 space-y-2.5 text-xs">
                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <Users className="h-3 w-3 text-slate-400" /> Staff Seats
                        </span>
                        <span className="font-semibold text-slate-900">
                          {seatsUsed} / {t.max_users}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                        <div
                          className="h-full rounded-full bg-[#4B5A94] transition-all"
                          style={{ width: `${seatPct}%` }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                        <span className="inline-flex items-center gap-1 font-medium">
                          <GitBranch className="h-3 w-3 text-slate-400" /> Branches
                        </span>
                        <span className="font-semibold text-slate-900">
                          {branchUsed} / {t.max_branches}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${branchPct}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                      <span>R2 Storage</span>
                      <span className="font-medium text-slate-700">
                        {mbUsed.toFixed(1)} / {t.max_storage_mb} MB
                      </span>
                    </div>
                  </div>
                </div>

                {/* Footer Actions */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <Link
                    href={`/s/${t.slug}`}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-[#4B5A94] transition-colors"
                  >
                    Storefront
                    <ExternalLink className="h-3 w-3" />
                  </Link>

                  <Link
                    href={`/platform/tenants/${t.id}`}
                    onClick={() => setOpeningId(t.id)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-[#4B5A94] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition-all hover:bg-[#3f4d82]"
                  >
                    {openingId === t.id ? (
                      <>
                        <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Opening...
                      </>
                    ) : (
                      <>
                        Open Studio
                        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
