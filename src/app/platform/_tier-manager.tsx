"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp } from "lucide-react";
import { toast } from "sonner";
import { setPersonTierAction } from "@/actions/platform-org";
import {
  TIER_ORDER,
  effectiveUserTier,
  resolveUserFeatures,
  tierRank,
} from "@/lib/auth/access";
import {
  FEATURE_KEYS,
  FEATURE_META,
  TIER_META,
  type FeatureKey,
  type TenantRole,
  type TierKey,
} from "@/lib/constants/saas";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Button, Dialog, Select } from "@/components/ui/primitives";
import { StatTray, StatusPill } from "@/components/ui/spark";

export interface TierPerson {
  id: string;
  tenant_id: string | null;
  role: TenantRole;
  full_name: string;
  username: string | null;
  is_active: boolean;
  tier_override: TierKey | null;
}

export interface TierTenant {
  id: string;
  name: string;
  tier: TierKey;
  feature_overrides: Partial<Record<FeatureKey, boolean>> | null;
}

interface Row extends TierPerson {
  tenant: TierTenant;
  current: TierKey;
  modules: number;
}

const ROLE_LABEL: Record<TenantRole, string> = {
  owner: "Owner",
  branch_admin: "Branch Admin",
  worker: "Staff",
};

const shortTier = (t: TierKey) => t.replace("tier_", "Tier ");
const tierName = (t: TierKey) => TIER_META[t].name.split("—")[1]?.trim() ?? shortTier(t);

function enabledKeys(tenant: TierTenant, tier: TierKey | null) {
  const features = resolveUserFeatures(tenant, tier);
  return FEATURE_KEYS.filter((k) => features[k]);
}

export function TierManager({ people, tenants }: { people: TierPerson[]; tenants: TierTenant[] }) {
  const router = useRouter();
  const [business, setBusiness] = useState("all");
  const [role, setRole] = useState<"all" | TenantRole>("all");
  const [pending, setPending] = useState<{ row: Row; next: TierKey } | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(tenants.map((t) => [t.id, t]));
    return people.flatMap((p) => {
      const tenant = p.tenant_id ? byId.get(p.tenant_id) : undefined;
      if (!tenant) return [];
      return [
        {
          ...p,
          tenant,
          current: effectiveUserTier(tenant.tier, p.tier_override),
          modules: enabledKeys(tenant, p.tier_override).length,
        },
      ];
    });
  }, [people, tenants]);

  const visible = rows.filter(
    (r) => (business === "all" || r.tenant.id === business) && (role === "all" || r.role === role)
  );
  const limited = rows.filter((r) => r.current !== r.tenant.tier).length;

  const change = useMemo(() => {
    if (!pending) return null;
    const before = new Set(enabledKeys(pending.row.tenant, pending.row.tier_override));
    const after = new Set(enabledKeys(pending.row.tenant, pending.next));
    return {
      promoted: tierRank(pending.next) > tierRank(pending.row.current),
      gained: [...after].filter((k) => !before.has(k)),
      lost: [...before].filter((k) => !after.has(k)),
    };
  }, [pending]);

  const confirm = async () => {
    if (!pending || !change) return;
    setBusy(true);
    try {
      await setPersonTierAction(pending.row.id, pending.next);
      toast.success(
        `${pending.row.full_name} ${change.promoted ? "promoted" : "demoted"} to ${shortTier(pending.next)}.`
      );
      setPending(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change the tier.");
    } finally {
      setBusy(false);
    }
  };

  const columns: ColumnDef<Row>[] = [
    {
      key: "person",
      header: "Person",
      mobilePrimary: true,
      sortValue: (r) => r.full_name.toLowerCase(),
      render: (r) => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#f1f1f2] text-[10px] font-semibold text-[#3f3f46]">
            {r.full_name.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
          </span>
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-medium text-[#171717]">{r.full_name}</span>
            <span className="block truncate font-mono text-[10.5px] text-[#a3a3a8]">{r.username ?? "no username"}</span>
          </span>
        </span>
      ),
    },
    { key: "business", header: "Business", sortValue: (r) => r.tenant.name, render: (r) => r.tenant.name },
    { key: "role", header: "Role", sortValue: (r) => r.role, render: (r) => ROLE_LABEL[r.role] },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill tone={r.is_active ? "success" : "neutral"}>{r.is_active ? "Active" : "Disabled"}</StatusPill>,
    },
    {
      key: "plan",
      header: "Business Plan",
      sortValue: (r) => tierRank(r.tenant.tier),
      render: (r) => <span className="font-mono text-[#55555b]">{shortTier(r.tenant.tier)}</span>,
    },
    {
      key: "modules",
      header: "Modules",
      sortValue: (r) => r.modules,
      render: (r) => (
        <span className="font-mono tabular-nums">
          {r.modules}
          <span className="text-[#a3a3a8]">/{FEATURE_KEYS.length}</span>
        </span>
      ),
    },
    {
      key: "tier",
      header: "Access Tier",
      sortValue: (r) => tierRank(r.current),
      render: (r) => (
        <span role="radiogroup" aria-label={`Access tier for ${r.full_name}`} className="inline-flex gap-0.5 rounded-full bg-[#f1f1f2] p-[3px]">
          {TIER_ORDER.map((t) => {
            const isCurrent = t === r.current;
            const abovePlan = tierRank(t) > tierRank(r.tenant.tier);
            return (
              <button
                key={t}
                type="button"
                role="radio"
                aria-checked={isCurrent}
                aria-label={shortTier(t)}
                disabled={abovePlan}
                title={
                  abovePlan
                    ? `Above the ${shortTier(r.tenant.tier)} business plan. Upgrade the plan first.`
                    : isCurrent
                    ? `Currently ${shortTier(t)}`
                    : `${tierRank(t) > tierRank(r.current) ? "Promote" : "Demote"} to ${shortTier(t)}`
                }
                onClick={() => !isCurrent && setPending({ row: r, next: t })}
                className={`ui-tier-option h-6 min-w-8 cursor-pointer rounded-full px-2 font-mono text-[10.5px] font-medium disabled:cursor-not-allowed disabled:opacity-30 ${
                  isCurrent ? "bg-[#171717] text-white shadow-[0_1px_2px_rgba(0,0,0,.25)]" : "text-[#77777d]"
                }`}
              >
                {t.replace("tier_", "T")}
              </button>
            );
          })}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTray label="People" value={rows.length} unit="Users" footnote={`Across ${tenants.length} business${tenants.length === 1 ? "" : "es"}`} />
        <StatTray label="Full Plan Access" value={rows.length - limited} unit="Users" footnote="Following business plan" />
        <StatTray label="Limited Access" value={limited} unit="Users" footnote="Below their business plan" />
        <StatTray label="Modules" value={FEATURE_KEYS.length} unit="Total" footnote="Across 4 tiers" />
      </div>

      <DataTable
        data={visible}
        columns={columns}
        rowKey={(r) => r.id}
        pageSize={12}
        searchPlaceholder="Search people..."
        searchFilter={(r, q) =>
          [r.full_name, r.username ?? "", r.tenant.name].some((v) => v.toLowerCase().includes(q))
        }
        emptyMessage="No people match these filters."
        actions={
          <>
            <Select aria-label="Filter by business" value={business} onChange={(e) => setBusiness(e.target.value)} className="!w-44">
              <option value="all">All businesses</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </Select>
            <Select aria-label="Filter by role" value={role} onChange={(e) => setRole(e.target.value as typeof role)} className="!w-36">
              <option value="all">All roles</option>
              <option value="owner">Owner</option>
              <option value="branch_admin">Branch Admin</option>
              <option value="worker">Staff</option>
            </Select>
          </>
        }
      />

      <Dialog
        open={Boolean(pending)}
        onClose={() => !busy && setPending(null)}
        title={change?.promoted ? "Promote this person?" : "Demote this person?"}
        subtitle={pending ? `${pending.row.full_name} · ${pending.row.tenant.name}` : ""}
      >
        {pending && change ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-lg bg-[#f7f7f8] px-3 py-2.5">
              <div>
                <p className="ui-eyebrow">From</p>
                <p className="mt-0.5 text-[13px] font-medium text-[#171717]">{shortTier(pending.row.current)}</p>
                <p className="text-[11px] text-[#77777d]">{tierName(pending.row.current)}</p>
              </div>
              <span className={`flex h-7 w-7 items-center justify-center rounded-full text-white ${change.promoted ? "bg-emerald-600" : "bg-rose-600"}`}>
                {change.promoted ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              </span>
              <div className="text-right">
                <p className="ui-eyebrow">To</p>
                <p className="mt-0.5 text-[13px] font-medium text-[#171717]">{shortTier(pending.next)}</p>
                <p className="text-[11px] text-[#77777d]">{tierName(pending.next)}</p>
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-xs font-medium text-[#171717]">
                {change.promoted
                  ? `Gains ${change.gained.length} module${change.gained.length === 1 ? "" : "s"}`
                  : `Loses ${change.lost.length} module${change.lost.length === 1 ? "" : "s"}`}
              </p>
              <ul className="max-h-44 space-y-1 overflow-y-auto">
                {(change.promoted ? change.gained : change.lost).map((k) => (
                  <li key={k} className="flex items-center gap-2 text-xs text-[#55555b]">
                    <span className={`h-1.5 w-1.5 rounded-full ${change.promoted ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {FEATURE_META[k].label}
                  </li>
                ))}
                {(change.promoted ? change.gained : change.lost).length === 0 ? (
                  <li className="text-xs text-[#77777d]">No module changes at this tier.</li>
                ) : null}
              </ul>
            </div>

            <p className="text-[11.5px] text-[#77777d]">Applies on their next page load. No sign-out needed.</p>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setPending(null)}>
                Cancel
              </Button>
              <Button variant={change.promoted ? "primary" : "danger"} className="flex-1" disabled={busy} onClick={confirm}>
                {busy ? "Saving..." : change.promoted ? "Promote" : "Demote"}
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}
