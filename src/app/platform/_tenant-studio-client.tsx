"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Check,
  Copy,
  ExternalLink,
  Eye,
  Factory,
  FileSpreadsheet,
  GitBranch,
  Globe,
  KeyRound,
  Layers,
  Loader2,
  Receipt,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Users,
  Wand2,
  Zap,
} from "lucide-react";
import { Paged } from "@/components/ui/pagination";
import { toast } from "sonner";
import { StatTray, StatusPill } from "@/components/ui/spark";
import {
  adminSetUserPasswordAction,
  applyFeatureOverridesBatchAction,
  setFeatureOverrideAction,
  startImpersonationAction,
  updateTenantQuotasAndStatusAction,
  updateTenantTierAction,
} from "@/actions/platform";
import {
  getDependentFeatures,
  getRequiredPrerequisites,
  isFeatureEnabled,
} from "@/lib/auth/access";
import {
  FEATURE_DEPENDENCIES,
  FEATURE_KEYS,
  FEATURE_META,
  TIER_DEFAULT_FEATURES,
  TIER_META,
  type FeatureKey,
  type TenantStatus,
  type TierKey,
} from "@/lib/constants/saas";
import { Form,
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  Input,
  Label,
  Select,
} from "@/components/ui/primitives";
import type { TenantRow } from "@/types/database";

export interface TenantStudioUser {
  id: string;
  full_name: string;
  username: string | null;
  email: string | null;
  role: string;
  is_active: boolean;
}

export interface TenantStudioStats {
  branchCount: number;
  productCount: number;
  invoiceCount: number;
}

type StudioTab = "studio" | "plan" | "team";

const CATEGORY_STYLE: Record<
  string,
  { icon: React.ReactNode; bg: string; text: string; ring: string }
> = {
  Core: {
    icon: <ShieldCheck className="h-4 w-4" />,
    bg: "bg-slate-100",
    text: "text-slate-700",
    ring: "ring-slate-200",
  },
  Billing: {
    icon: <Receipt className="h-4 w-4" />,
    bg: "bg-indigo-50",
    text: "text-[#171717]",
    ring: "ring-indigo-200",
  },
  Inventory: {
    icon: <Boxes className="h-4 w-4" />,
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    ring: "ring-emerald-200",
  },
  "Multi-Branch": {
    icon: <GitBranch className="h-4 w-4" />,
    bg: "bg-sky-50",
    text: "text-sky-700",
    ring: "ring-sky-200",
  },
  CRM: {
    icon: <Users className="h-4 w-4" />,
    bg: "bg-violet-50",
    text: "text-violet-700",
    ring: "ring-violet-200",
  },
  Operations: {
    icon: <Factory className="h-4 w-4" />,
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
  Analytics: {
    icon: <BarChart3 className="h-4 w-4" />,
    bg: "bg-cyan-50",
    text: "text-cyan-700",
    ring: "ring-cyan-200",
  },
  Reports: {
    icon: <FileSpreadsheet className="h-4 w-4" />,
    bg: "bg-teal-50",
    text: "text-teal-700",
    ring: "ring-teal-200",
  },
  Storefront: {
    icon: <Globe className="h-4 w-4" />,
    bg: "bg-rose-50",
    text: "text-rose-700",
    ring: "ring-rose-200",
  },
};

const MIX_PRESETS: Array<{
  id: string;
  label: string;
  tagline: string;
  buildOverrides: (tier: TierKey) => Partial<Record<FeatureKey, boolean>>;
}> = [
  {
    id: "tier_baseline",
    label: "Tier Baseline",
    tagline: "Clear all custom overrides",
    buildOverrides: () => ({}),
  },
  {
    id: "pos_plus_web",
    label: "POS + Website",
    tagline: "Billing + Live Storefront & PDF",
    buildOverrides: () => ({
      public_website_cms: true,
      pdf_catalogue_export: true,
      customer_enquiries: true,
      dynamic_stock_matrix: true,
      customer_crm: true,
    }),
  },
  {
    id: "factory_pack",
    label: "Factory & Transfers",
    tagline: "Unlock Multi-Branch + Production",
    buildOverrides: () => ({
      dynamic_stock_matrix: true,
      auto_stock_and_alerts: true,
      multi_branch_ledgers: true,
      supplier_and_production: true,
      stock_transfers: true,
    }),
  },
  {
    id: "unlock_all",
    label: `Unlock All ${FEATURE_KEYS.length}`,
    tagline: "Force-enable every module",
    buildOverrides: (tier) => {
      const ov: Partial<Record<FeatureKey, boolean>> = {};
      for (const fk of FEATURE_KEYS) {
        if (!TIER_DEFAULT_FEATURES[tier].includes(fk)) ov[fk] = true;
      }
      return ov;
    },
  },
];

export function TenantStudioClient({
  tenant,
  users,
  stats,
}: {
  tenant: TenantRow;
  users: TenantStudioUser[];
  stats: TenantStudioStats;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<StudioTab>("studio");

  // Optimistic local state for instant zero-lag toggles
  const [localTier, setLocalTier] = useState<TierKey>(tenant.tier);
  const [localOverrides, setLocalOverrides] = useState<Partial<Record<FeatureKey, boolean>>>(
    tenant.feature_overrides ?? {}
  );
  const [savingFeature, setSavingFeature] = useState<FeatureKey | null>(null);
  const [savingPreset, setSavingPreset] = useState<string | null>(null);
  const [pendingDepModal, setPendingDepModal] = useState<{
    featureKey: FeatureKey;
    mode: "enable" | "disable";
    affected: FeatureKey[];
  } | null>(null);

  // Filters inside Mix & Match Studio
  const [featureSearch, setFeatureSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [onlyOverrides, setOnlyOverrides] = useState(false);

  // Plan & Quotas state
  const [selectedTier, setSelectedTier] = useState<TierKey>(tenant.tier);
  const [status, setStatus] = useState<TenantStatus>(tenant.status);
  const [maxUsers, setMaxUsers] = useState(tenant.max_users);
  const [maxBranches, setMaxBranches] = useState(tenant.max_branches);
  const [maxStorageMb, setMaxStorageMb] = useState(tenant.max_storage_mb);
  const [amcDate, setAmcDate] = useState(
    tenant.amc_renewal_date ? tenant.amc_renewal_date.slice(0, 10) : ""
  );
  const [customDomain, setCustomDomain] = useState(tenant.custom_domain ?? "");
  const [savingTier, setSavingTier] = useState(false);
  const [savingQuotas, setSavingQuotas] = useState(false);

  // Impersonation loading state
  const [impersonating, setImpersonating] = useState<"read" | "write" | null>(null);
  const [writeConfirmOpen, setWriteConfirmOpen] = useState(false);
  const [, startTransition] = useTransition();

  // Password reset modal
  const [pwTarget, setPwTarget] = useState<TenantStudioUser | null>(null);
  const [newPw, setNewPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);

  const effectiveTenant = useMemo(
    () => ({ tier: localTier, feature_overrides: localOverrides }),
    [localTier, localOverrides]
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const fk of FEATURE_KEYS) set.add(FEATURE_META[fk].category);
    return ["All", ...Array.from(set)];
  }, []);

  const activeCount = useMemo(
    () => FEATURE_KEYS.filter((fk) => isFeatureEnabled(effectiveTenant, fk)).length,
    [effectiveTenant]
  );
  const overrideCount = useMemo(() => Object.keys(localOverrides).length, [localOverrides]);

  const filteredFeatures = useMemo(() => {
    const q = featureSearch.trim().toLowerCase();
    return FEATURE_KEYS.filter((fk) => {
      const meta = FEATURE_META[fk];
      if (categoryFilter !== "All" && meta.category !== categoryFilter) return false;
      if (onlyOverrides && localOverrides[fk] === undefined) return false;
      if (
        q &&
        !meta.label.toLowerCase().includes(q) &&
        !meta.description.toLowerCase().includes(q) &&
        !meta.category.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [featureSearch, categoryFilter, onlyOverrides, localOverrides]);

  const commitFeatureMode = async (
    fk: FeatureKey,
    mode: "inherit" | "enable" | "disable"
  ) => {
    const prev = { ...localOverrides };
    const next = { ...localOverrides };
    if (mode === "inherit") {
      delete next[fk];
    } else if (mode === "enable") {
      next[fk] = true;
      for (const req of getRequiredPrerequisites(fk)) {
        if (!isFeatureEnabled({ tier: localTier, feature_overrides: next }, req)) {
          next[req] = true;
        }
      }
    } else {
      next[fk] = false;
      for (const dep of getDependentFeatures(fk)) {
        if (isFeatureEnabled({ tier: localTier, feature_overrides: next }, dep)) {
          next[dep] = false;
        }
      }
    }

    // Optimistic update immediately (0ms perceived delay)
    setLocalOverrides(next);
    setSavingFeature(fk);
    try {
      await setFeatureOverrideAction(tenant.id, fk, mode, true);
      toast.success(`${FEATURE_META[fk].label} updated`);
      startTransition(() => router.refresh());
    } catch (err) {
      setLocalOverrides(prev);
      toast.error(err instanceof Error ? err.message : "Failed to update feature");
    } finally {
      setSavingFeature(null);
    }
  };

  const handleFeatureClick = (fk: FeatureKey, mode: "inherit" | "enable" | "disable") => {
    const currentVal = localOverrides[fk];
    const currentMode = currentVal === true ? "enable" : currentVal === false ? "disable" : "inherit";
    if (currentMode === mode) return;

    if (mode === "enable") {
      const reqs = getRequiredPrerequisites(fk).filter(
        (r) => !isFeatureEnabled(effectiveTenant, r)
      );
      if (reqs.length > 0) {
        setPendingDepModal({ featureKey: fk, mode: "enable", affected: reqs });
        return;
      }
    }
    if (mode === "disable") {
      const deps = getDependentFeatures(fk).filter((d) =>
        isFeatureEnabled(effectiveTenant, d)
      );
      if (deps.length > 0) {
        setPendingDepModal({ featureKey: fk, mode: "disable", affected: deps });
        return;
      }
    }
    void commitFeatureMode(fk, mode);
  };

  const applyPreset = async (preset: (typeof MIX_PRESETS)[number]) => {
    const prev = { ...localOverrides };
    const next = preset.buildOverrides(localTier);
    setLocalOverrides(next);
    setSavingPreset(preset.id);
    try {
      await applyFeatureOverridesBatchAction(tenant.id, next, preset.label);
      toast.success(`Applied "${preset.label}" mix-and-match preset`);
      startTransition(() => router.refresh());
    } catch (err) {
      setLocalOverrides(prev);
      toast.error(err instanceof Error ? err.message : "Failed to apply preset");
    } finally {
      setSavingPreset(null);
    }
  };

  const saveTier = async () => {
    setSavingTier(true);
    try {
      await updateTenantTierAction(tenant.id, selectedTier);
      setLocalTier(selectedTier);
      toast.success(`Tier updated to ${TIER_META[selectedTier].name}`);
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update tier");
    } finally {
      setSavingTier(false);
    }
  };

  const saveQuotas = async () => {
    setSavingQuotas(true);
    try {
      await updateTenantQuotasAndStatusAction(tenant.id, {
        status,
        maxUsers,
        maxBranches,
        maxStorageMb,
        amcRenewalDate: amcDate || null,
        customDomain: customDomain || null,
      });
      toast.success("Tenant quotas & status saved.");
      startTransition(() => router.refresh());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save quotas");
    } finally {
      setSavingQuotas(false);
    }
  };

  const initials = tenant.name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  const mbUsed = (Number(tenant.storage_used_bytes || 0) / (1024 * 1024)).toFixed(1);

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/platform/tenants"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-[#77777d] transition-colors hover:text-[#171717]"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All Workspaces
        </Link>
        <div className="flex flex-wrap items-center gap-1.5">
          <Link
            href={`/s/${tenant.slug}`}
            target="_blank"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-medium text-[#27272a] shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#fafafa]"
          >
            <Globe className="h-3.5 w-3.5" />
            Storefront
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
          <button
            type="button"
            disabled={impersonating !== null}
            onClick={() => {
              setImpersonating("read");
              void startImpersonationAction(tenant.id, "read");
            }}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-[#171717] px-2.5 text-xs font-medium text-white transition-colors hover:bg-[#2a2a2a] disabled:opacity-60"
          >
            {impersonating === "read" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
            Inspect (Read-Only)
          </button>
          <button
            type="button"
            disabled={impersonating !== null}
            onClick={() => setWriteConfirmOpen(true)}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-rose-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-60"
          >
            {impersonating === "write" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert className="h-3.5 w-3.5" />}
            Write Mode
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[#171717] text-sm font-semibold text-white">
          {initials || "NX"}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1>{tenant.name}</h1>
            <StatusPill tone={status === "active" ? "success" : "danger"}>{status}</StatusPill>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#77777d]">
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard?.writeText(tenant.slug);
                toast.success("Copied tenant slug");
              }}
              className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-[#f1f1f2] px-1.5 py-0.5 font-mono text-[11px] text-[#3f3f46] hover:bg-[#e7e7e9]"
            >
              /{tenant.slug}
              <Copy className="h-3 w-3 opacity-60" />
            </button>
            <span className="capitalize">{tenant.vertical_key}</span>
            <span aria-hidden="true">·</span>
            <span>{TIER_META[localTier].name}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTray
          label="Active Modules"
          value={`${activeCount}/${FEATURE_KEYS.length}`}
          footnote={overrideCount > 0 ? `${overrideCount} custom override${overrideCount === 1 ? "" : "s"}` : "Plan defaults"}
        />
        <StatTray label="Team Seats" value={`${users.length}/${maxUsers}`} footnote="Staff accounts" />
        <StatTray label="Branches" value={`${stats.branchCount}/${maxBranches}`} footnote={`${mbUsed} MB stored`} />
        <StatTray label="Activity" value={stats.invoiceCount} unit="Bills" footnote={`${stats.productCount} product models`} />
      </div>

      {/* Studio Navigation Segmented Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex max-w-full overflow-x-auto no-scrollbar rounded-full bg-[#f1f1f2] p-[3px]">
          {(
            [
              {
                id: "studio",
                label: "Mix & Match Feature Studio",
                icon: <Sliders className="h-3.5 w-3.5" />,
                badge: `${activeCount}/${FEATURE_KEYS.length}`,
              },
              {
                id: "plan",
                label: "Plan, Quotas & Domain",
                icon: <Layers className="h-3.5 w-3.5" />,
                badge: localTier.replace("tier_", "T"),
              },
              {
                id: "team",
                label: "Team & Passwords",
                icon: <Users className="h-3.5 w-3.5" />,
                badge: String(users.length),
              },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-all duration-200 cursor-pointer ${
                activeTab === t.id
                  ? "bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_rgba(0,0,0,.03)]"
                  : "text-[#77777d] hover:text-[#171717]"
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
              <span
                className={`rounded-full px-1.5 py-px font-mono text-[10px] font-medium ${
                  activeTab === t.id
                    ? "bg-[#171717] text-white"
                    : "bg-[#e4e4e7] text-[#55555b]"
                }`}
              >
                {t.badge}
              </span>
            </button>
          ))}
        </div>

        {activeTab === "studio" && overrideCount > 0 && (
          <button
            type="button"
            disabled={savingPreset !== null}
            onClick={() => void applyPreset(MIX_PRESETS[0])}
            className="inline-flex items-center gap-1.5 rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer"
          >
            {savingPreset === "tier_baseline" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RotateCcw className="h-3.5 w-3.5" />
            )}
            Reset {overrideCount} Override{overrideCount === 1 ? "" : "s"}
          </button>
        )}
      </div>

      {/* TAB 1: CREATIVE MIX & MATCH FEATURE STUDIO */}
      {activeTab === "studio" && (
        <div className="space-y-5">
          {/* 1-Click Mix & Match Recipes */}
          <div className="rounded-[14px] border border-slate-200/80 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 text-[#171717]">
                  <Wand2 className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    1-Click Mix &amp; Match Recipes
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Instantly combine features from any tier — or fine-tune individual modules below.
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
              {MIX_PRESETS.map((preset) => {
                const isBusy = savingPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    disabled={savingPreset !== null}
                    onClick={() => void applyPreset(preset)}
                    className="group flex items-center justify-between gap-2 rounded-[10px] border border-slate-200 bg-slate-50/70 p-3 text-left transition-all hover:border-[#171717]/50 hover:bg-indigo-50/40 cursor-pointer disabled:opacity-60"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-900">
                        <Zap className="h-3.5 w-3.5 text-[#171717] shrink-0" />
                        <span className="truncate">{preset.label}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">
                        {preset.tagline}
                      </p>
                    </div>
                    {isBusy ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#171717]" />
                    ) : (
                      <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 border border-slate-200 group-hover:border-[#171717] group-hover:text-[#171717]">
                        Apply
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Search & Category Filter Bar */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative w-full lg:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={featureSearch}
                onChange={(e) => setFeatureSearch(e.target.value)}
                placeholder="Filter 18 ERP modules..."
                className="w-full rounded-[10px] border border-slate-200 bg-white pl-9 pr-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-[#171717] focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                    categoryFilter === cat
                      ? "bg-slate-900 text-white shadow-xs"
                      : "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {cat}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setOnlyOverrides((v) => !v)}
                className={`inline-flex items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[11px] font-semibold transition-all cursor-pointer ${
                  onlyOverrides
                    ? "bg-amber-500 text-white shadow-xs"
                    : "bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100"
                }`}
              >
                <Sliders className="h-3 w-3" />
                Overrides ({overrideCount})
              </button>
            </div>
          </div>

          {/* Interactive Feature Module Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            <Paged items={filteredFeatures} size={9}>{(pagedRows) => pagedRows.map((fk) => {
              const meta = FEATURE_META[fk];
              const active = isFeatureEnabled(effectiveTenant, fk);
              const overrideVal = localOverrides[fk];
              const mode: "inherit" | "enable" | "disable" =
                overrideVal === true ? "enable" : overrideVal === false ? "disable" : "inherit";
              const isSaving = savingFeature === fk;
              const style = CATEGORY_STYLE[meta.category] ?? CATEGORY_STYLE.Core;
              const reqs = FEATURE_DEPENDENCIES[fk] ?? [];
              const inBaseTier = TIER_DEFAULT_FEATURES[localTier].includes(fk);

              const borderClass =
                mode === "enable"
                  ? "border-amber-300 ring-1 ring-amber-200/70"
                  : mode === "disable"
                    ? "border-rose-200 bg-rose-50/20"
                    : active
                      ? "border-slate-200/90 hover:border-emerald-300"
                      : "border-slate-200/80 bg-slate-50/50 opacity-90";

              return (
                <div
                  key={fk}
                  className={`relative flex flex-col justify-between rounded-[14px] border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-150 ${borderClass}`}
                >
                  <div className="space-y-3">
                    {/* Card Header */}
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ring-1 ${style.bg} ${style.text} ${style.ring}`}
                        >
                          {style.icon}
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-xs font-semibold text-slate-900 leading-snug">
                            {meta.label}
                          </h3>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                            <span className="font-semibold uppercase text-slate-600">
                              {meta.minTier.replace("tier_", "Tier ")}
                            </span>
                            <span>•</span>
                            <span>{meta.category}</span>
                          </div>
                        </div>
                      </div>

                      {/* Live Status Pill */}
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          mode === "enable"
                            ? "bg-amber-100 text-amber-800"
                            : mode === "disable"
                              ? "bg-rose-100 text-rose-700"
                              : active
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {isSaving ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin" />
                        ) : (
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              mode === "enable"
                                ? "bg-amber-500"
                                : mode === "disable"
                                  ? "bg-rose-500"
                                  : active
                                    ? "bg-emerald-500"
                                    : "bg-slate-400"
                            }`}
                          />
                        )}
                        {mode === "enable"
                          ? "Forced ON"
                          : mode === "disable"
                            ? "Forced OFF"
                            : active
                              ? "Included"
                              : "Locked"}
                      </span>
                    </div>

                    {/* Description */}
                    <p className="text-[11px] leading-relaxed text-slate-600">
                      {meta.description}
                    </p>

                    {/* Dependency Chips */}
                    {reqs.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        <span className="text-[10px] font-medium text-slate-400">Requires:</span>
                        {reqs.map((r) => (
                          <span
                            key={r}
                            className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                          >
                            {FEATURE_META[r].label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 3-State Segmented Switch (Zero Dropdowns!) */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] text-slate-400">
                      {inBaseTier ? "Default in plan" : "Add-on module"}
                    </span>

                    <div className="inline-flex rounded-[10px] bg-slate-100 p-0.5 text-[11px] font-semibold">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleFeatureClick(fk, "inherit")}
                        className={`rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                          mode === "inherit"
                            ? "bg-white text-slate-900 shadow-xs"
                            : "text-slate-500 hover:text-slate-900"
                        }`}
                      >
                        Tier
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleFeatureClick(fk, "enable")}
                        className={`rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                          mode === "enable"
                            ? "bg-emerald-600 text-white shadow-xs"
                            : "text-slate-500 hover:text-emerald-700"
                        }`}
                      >
                        ON
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleFeatureClick(fk, "disable")}
                        className={`rounded-lg px-2.5 py-1 transition-all cursor-pointer ${
                          mode === "disable"
                            ? "bg-rose-500 text-white shadow-xs"
                            : "text-slate-500 hover:text-rose-600"
                        }`}
                      >
                        OFF
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}</Paged>
          </div>
        </div>
      )}

      {/* TAB 2: PLAN, QUOTAS & DOMAIN */}
      {activeTab === "plan" && (
        <div className="space-y-6">
          {/* Interactive 4-Tier Visual Cards */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Subscription Tier</h3>
                <p className="text-xs text-slate-500">
                  Pick a base tier for this workspace — custom Mix &amp; Match overrides remain preserved.
                </p>
              </div>
              <Button
                onClick={saveTier}
                disabled={savingTier || selectedTier === localTier}
              >
                {savingTier ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {savingTier ? "Applying..." : "Apply Selected Tier"}
              </Button>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {(Object.keys(TIER_META) as TierKey[]).map((tk) => {
                const tm = TIER_META[tk];
                const isSelected = selectedTier === tk;
                const isCurrent = localTier === tk;
                const modCount = TIER_DEFAULT_FEATURES[tk].length;
                return (
                  <button
                    key={tk}
                    type="button"
                    onClick={() => setSelectedTier(tk)}
                    className={`relative flex flex-col justify-between rounded-[14px] border p-4 text-left transition-all cursor-pointer ${
                      isSelected
                        ? "border-[#171717] bg-indigo-50/40 ring-2 ring-[#171717]/20"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold uppercase tracking-wide text-[#171717]">
                          {tk.replace("tier_", "Tier ")}
                        </span>
                        {isCurrent ? (
                          <Badge variant="success">Current</Badge>
                        ) : isSelected ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#171717] text-white">
                            <Check className="h-3 w-3" />
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        {tm.name.split("—")[1]?.trim() ?? tm.name}
                      </p>
                      <p className="mt-1.5 text-[11px] leading-relaxed text-slate-500">
                        {tm.summary}
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-900">
                        ₹{tm.priceInr.toLocaleString("en-IN")}
                      </span>
                      <span className="text-[11px] text-slate-500">{modCount} modules</span>
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {/* Quotas, Status, AMC & Custom Domain */}
          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold text-slate-900">
                Quotas, Status, AMC &amp; Custom Domain
              </h3>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <Label>Workspace Status</Label>
                  <Select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TenantStatus)}
                  >
                    <option value="active">Active (Live)</option>
                    <option value="suspended">Suspended (Locked Out)</option>
                  </Select>
                </div>
                <div>
                  <Label>Max Staff Seats</Label>
                  <Input
                    type="number"
                    min={1}
                    value={maxUsers}
                    onChange={(e) => setMaxUsers(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Max Branches</Label>
                  <Input
                    type="number"
                    min={1}
                    value={maxBranches}
                    onChange={(e) => setMaxBranches(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>Max R2 Storage (MB)</Label>
                  <Input
                    type="number"
                    min={50}
                    value={maxStorageMb}
                    onChange={(e) => setMaxStorageMb(Number(e.target.value))}
                  />
                </div>
                <div>
                  <Label>AMC Renewal Date</Label>
                  <Input
                    type="date"
                    value={amcDate}
                    onChange={(e) => setAmcDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Custom Storefront Domain</Label>
                  <Input
                    value={customDomain}
                    onChange={(e) => setCustomDomain(e.target.value)}
                    placeholder="shop.client.in"
                  />
                </div>
              </div>

              {customDomain && (
                <Alert variant="info" title="Client DNS Instructions">
                  Ask client to point <code>{customDomain}</code> via{" "}
                  <strong>CNAME → cname.vercel-dns.com</strong> (and add the domain in Vercel
                  Project Settings).
                </Alert>
              )}

              <Button onClick={saveQuotas} disabled={savingQuotas}>
                {savingQuotas && <Loader2 className="h-4 w-4 animate-spin" />}
                {savingQuotas ? "Saving..." : "Save Quotas & Status"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 3: TEAM & DIRECT PASSWORD MANAGEMENT */}
      {activeTab === "team" && (
        <Card>
          <CardHeader>
            <h3 className="text-sm font-semibold text-slate-900">
              Tenant Users &amp; Direct Password Management ({users.length})
            </h3>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Paged items={users} size={8}>{(pagedRows) => pagedRows.map((u) => (
              <div
                key={u.id}
                className="flex items-center justify-between gap-3 rounded-[14px] border border-slate-200/80 bg-slate-50/50 p-3.5"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{u.full_name}</p>
                    <Badge
                      variant={
                        u.role === "owner"
                          ? "info"
                          : u.role === "branch_admin"
                            ? "warning"
                            : "default"
                      }
                    >
                      {u.role.replace("_", " ")}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    <code>{u.username ?? "—"}</code> • {u.email ?? "No email"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setPwTarget(u)}>
                  <KeyRound className="h-3.5 w-3.5" />
                  Password
                </Button>
              </div>
            ))}</Paged>
          </CardContent>
        </Card>
      )}

      {/* Dependency Resolution Dialog (replaces window.confirm) */}
      <Dialog
        open={Boolean(pendingDepModal)}
        onClose={() => setPendingDepModal(null)}
        title={
          pendingDepModal?.mode === "enable"
            ? "Enable Prerequisite Modules?"
            : "Disable Dependent Modules?"
        }
        subtitle={
          pendingDepModal
            ? `${FEATURE_META[pendingDepModal.featureKey].label} has linked module dependencies.`
            : ""
        }
      >
        {pendingDepModal && (
          <div className="space-y-4">
            <p className="text-xs text-slate-600">
              {pendingDepModal.mode === "enable"
                ? `Turning ON "${FEATURE_META[pendingDepModal.featureKey].label}" will also automatically enable:`
                : `Turning OFF "${FEATURE_META[pendingDepModal.featureKey].label}" will also deactivate:`}
            </p>
            <div className="flex flex-wrap gap-2">
              {pendingDepModal.affected.map((fk) => (
                <span
                  key={fk}
                  className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${
                    pendingDepModal.mode === "enable"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-rose-50 text-rose-700 border border-rose-200"
                  }`}
                >
                  {FEATURE_META[fk].label}
                </span>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setPendingDepModal(null)}>
                Cancel
              </Button>
              <Button
                variant={pendingDepModal.mode === "disable" ? "danger" : "primary"}
                onClick={() => {
                  const target = pendingDepModal;
                  setPendingDepModal(null);
                  void commitFeatureMode(target.featureKey, target.mode);
                }}
              >
                {pendingDepModal.mode === "enable" ? "Enable All & Save" : "Disable All & Save"}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      {/* Audited Write-Mode Impersonation Confirmation Dialog */}
      <Dialog
        open={writeConfirmOpen}
        onClose={() => setWriteConfirmOpen(false)}
        title="Enter Audited Write-Mode Session?"
        subtitle={`Target workspace: ${tenant.name}`}
      >
        <div className="space-y-4">
          <Alert variant="warning" title="All Mutations Are Logged">
            You are entering an audited write-mode support session as the workspace owner. Every
            change you make will be recorded in <code>audit_logs</code> under your Platform Admin
            identity.
          </Alert>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setWriteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setWriteConfirmOpen(false);
                setImpersonating("write");
                void startImpersonationAction(tenant.id, "write");
              }}
            >
              <ShieldAlert className="h-4 w-4" />
              Confirm Write Mode
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Direct Password Set Dialog */}
      <Dialog
        open={Boolean(pwTarget)}
        onClose={() => setPwTarget(null)}
        title="Set / Replace User Password"
        subtitle={pwTarget ? `${pwTarget.full_name} (${pwTarget.role})` : ""}
      >
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pwTarget) return;
            setSavingPw(true);
            try {
              await adminSetUserPasswordAction(pwTarget.id, newPw, true);
              toast.success("Password updated & active sessions revoked.");
              setPwTarget(null);
              setNewPw("");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Failed to update password");
            } finally {
              setSavingPw(false);
            }
          }}
          className="space-y-3"
        >
          <div>
            <Label>New Temporary Password (min 8 chars)</Label>
            <Input
              type="text"
              minLength={8}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Enter strong temporary password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={savingPw}>
            {savingPw && <Loader2 className="h-4 w-4 animate-spin" />}
            {savingPw ? "Saving..." : "Save Password & Revoke Sessions"}
          </Button>
        </Form>
      </Dialog>
    </div>
  );
}
