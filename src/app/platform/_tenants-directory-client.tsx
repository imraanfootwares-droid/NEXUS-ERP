"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { FEATURE_KEYS, TIER_META, type FeatureKey, type TierKey } from "@/lib/constants/saas";
import { isFeatureEnabled } from "@/lib/auth/access";
import { ProvisionTenantModal } from "@/app/platform/_client";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Segmented, StatTray, StatusPill } from "@/components/ui/spark";

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

const STATUS_OPTIONS = ["All", "Active", "Suspended"] as const;
const TIER_OPTIONS = ["All Tiers", "T1", "T2", "T3", "T4"] as const;

function Meter({ used, max, unit }: { used: number; max: number; unit?: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <span className="block w-24">
      <span className="block font-mono text-[11.5px] tabular-nums text-[#27272a]">
        {used} <span className="text-[#a3a3a8]">/ {max}{unit ? ` ${unit}` : ""}</span>
      </span>
      <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-[#ececee]">
        <span
          className={`block h-full rounded-full ${pct >= 90 ? "bg-rose-500" : "bg-[#171717]"}`}
          style={{ width: `${pct}%` }}
        />
      </span>
    </span>
  );
}

export function TenantsDirectoryClient({ tenants }: { tenants: DirectoryTenantRow[] }) {
  const [status, setStatus] = useState<(typeof STATUS_OPTIONS)[number]>("All");
  const [tier, setTier] = useState<(typeof TIER_OPTIONS)[number]>("All Tiers");

  const stats = useMemo(
    () => ({
      active: tenants.filter((t) => t.status === "active").length,
      users: tenants.reduce((acc, t) => acc + Number(t.user_count || 0), 0),
      overrides: tenants.reduce((acc, t) => acc + Object.keys(t.feature_overrides ?? {}).length, 0),
      mb: tenants.reduce((acc, t) => acc + Number(t.storage_used_bytes || 0) / (1024 * 1024), 0),
    }),
    [tenants]
  );

  const filtered = tenants.filter(
    (t) =>
      (status === "All" || t.status === status.toLowerCase()) &&
      (tier === "All Tiers" || t.tier === tier.replace("T", "tier_"))
  );

  const moduleCount = (t: DirectoryTenantRow) =>
    FEATURE_KEYS.filter((k) => isFeatureEnabled({ tier: t.tier, feature_overrides: t.feature_overrides ?? {} }, k)).length;

  const columns: ColumnDef<DirectoryTenantRow>[] = [
    {
      key: "name",
      header: "Workspace",
      mobilePrimary: true,
      sortValue: (t) => t.name.toLowerCase(),
      render: (t) => (
        <Link href={`/platform/tenants/${t.id}`} className="group flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#171717] text-[10px] font-semibold text-white">
            {t.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("") || "NX"}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-medium text-[#171717] group-hover:underline">{t.name}</span>
            <span className="block truncate font-mono text-[10.5px] text-[#a3a3a8]">/{t.slug}</span>
          </span>
        </Link>
      ),
    },
    {
      key: "vertical",
      header: "Vertical",
      sortValue: (t) => t.vertical_key,
      render: (t) => <span className="capitalize text-[#55555b]">{t.vertical_key}</span>,
    },
    {
      key: "status",
      header: "Status",
      sortValue: (t) => t.status,
      render: (t) => <StatusPill tone={t.status === "active" ? "success" : "danger"}>{t.status}</StatusPill>,
    },
    {
      key: "tier",
      header: "Plan",
      sortValue: (t) => t.tier,
      render: (t) => (
        <span className="block leading-tight">
          <span className="block font-mono text-[11.5px] font-medium text-[#171717]">{t.tier.replace("tier_", "Tier ")}</span>
          <span className="block max-w-36 truncate text-[10.5px] text-[#77777d]">{TIER_META[t.tier].name.split("—")[1]?.trim()}</span>
        </span>
      ),
    },
    {
      key: "modules",
      header: "Modules",
      sortValue: moduleCount,
      render: (t) => (
        <span className="font-mono tabular-nums">
          {moduleCount(t)}
          <span className="text-[#a3a3a8]">/{FEATURE_KEYS.length}</span>
        </span>
      ),
    },
    {
      key: "seats",
      header: "Seats",
      sortValue: (t) => Number(t.user_count),
      render: (t) => <Meter used={Number(t.user_count || 0)} max={t.max_users} />,
    },
    {
      key: "branches",
      header: "Branches",
      sortValue: (t) => Number(t.branch_count),
      render: (t) => <Meter used={Number(t.branch_count || 0)} max={t.max_branches} />,
    },
    {
      key: "storage",
      header: "Storage",
      sortValue: (t) => Number(t.storage_used_bytes),
      render: (t) => (
        <Meter
          used={Number((Number(t.storage_used_bytes || 0) / (1024 * 1024)).toFixed(1))}
          max={t.max_storage_mb}
          unit="MB"
        />
      ),
    },
    {
      key: "actions",
      header: "Actions",
      hideOnMobile: true,
      className: "text-right",
      render: (t) => (
        <span className="inline-flex items-center gap-1">
          <Link
            href={`/s/${t.slug}`}
            target="_blank"
            title="Open storefront"
            aria-label={`Open ${t.name} storefront`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#55555b] shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#f4f4f5]"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
          <Link
            href={`/platform/tenants/${t.id}`}
            title="Manage workspace"
            aria-label={`Manage ${t.name}`}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[#55555b] shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#171717] hover:text-white"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3.5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <h1>Tenant Workspaces</h1>
        <ProvisionTenantModal />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTray label="Active Workspaces" value={stats.active} unit={`of ${tenants.length}`} footnote="Live on the platform" />
        <StatTray label="Provisioned Users" value={stats.users} unit="Users" footnote="Across all workspaces" />
        <StatTray label="Module Overrides" value={stats.overrides} unit="Flags" footnote="Custom plan changes" />
        <StatTray label="Cloud Storage" value={stats.mb.toFixed(1)} unit="MB" footnote="Total used" />
      </div>

      <DataTable
        data={filtered}
        columns={columns}
        rowKey={(t) => t.id}
        pageSize={12}
        searchPlaceholder="Search name, slug, vertical, domain..."
        searchFilter={(t, q) =>
          [t.name, t.slug, t.vertical_key, t.custom_domain ?? ""].some((v) => v.toLowerCase().includes(q))
        }
        emptyMessage={tenants.length === 0 ? "No workspaces yet. Add your first client." : "No workspaces match these filters."}
        actions={
          <>
            <Segmented label="Filter by status" options={STATUS_OPTIONS} value={status} onChange={setStatus} />
            <Segmented label="Filter by plan" options={TIER_OPTIONS} value={tier} onChange={setTier} />
          </>
        }
      />
    </div>
  );
}
