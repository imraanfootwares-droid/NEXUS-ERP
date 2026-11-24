"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";
import {
  Check,
  Copy,
  Eye,
  KeyRound,
  LogOut,
  Plus,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { Paged } from "@/components/ui/pagination";
import { toast } from "sonner";
import {
  adminSetUserPasswordAction,
  provisionTenantAction,
  setFeatureOverrideAction,
  startImpersonationAction,
  updatePermissionMatrixAction,
  updateTenantQuotasAndStatusAction,
  updateTenantTierAction,
  upsertMasterHsnAction,
} from "@/actions/platform";
import { getDependentFeatures, getRequiredPrerequisites, isFeatureEnabled } from "@/lib/auth/access";
import { VERTICAL_PRESETS } from "@/lib/catalog/verticals";
import {
  FEATURE_KEYS,
  FEATURE_META,
  INDIAN_STATES,
  PERMISSION_DEFINITIONS,
  TIER_META,
  type FeatureKey,
  type TenantRole,
  type TenantStatus,
  type TierKey,
} from "@/lib/constants/saas";
import {
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
  Tabs,
} from "@/components/ui/primitives";
import { TierManager, type TierPerson, type TierTenant } from "@/app/platform/_tier-manager";
import type { HsnCodeRow, TenantRow, VerticalKey } from "@/types/database";

export function PlatformLogoutButton({ fullWidth = false }: { fullWidth?: boolean }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth?scope=platform", { method: "DELETE" });
        router.push("/login?portal=super");
        router.refresh();
      }}
      className={`inline-flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-[#55555b] hover:bg-rose-50 hover:text-rose-700 transition-colors cursor-pointer ${
        fullWidth ? "w-full" : ""
      }`}
    >
      <LogOut className="h-3.5 w-3.5" />
      <span className="hidden sm:inline">Sign Out</span>
    </button>
  );
}

export function PlatformAnalyticsCharts({
  usersByTenant,
  featureCoverage,
}: {
  usersByTenant: Array<{
    name: string;
    owners: number;
    branch_admins: number;
    workers: number;
    max_users: number;
  }>;
  featureCoverage: Array<{ label: string; tierCount: number; overrideCount: number }>;
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">
            Active Users &amp; Seat Utilization by Tenant
          </h3>
        </CardHeader>
        <CardContent className="h-72">
          {usersByTenant.length === 0 ? (
            <p className="text-xs text-slate-500 pt-10 text-center">No tenants provisioned yet.</p>
          ) : !mounted ? (
            <div className="h-full w-full rounded-[10px] bg-slate-50 animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={usersByTenant}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="owners" stackId="a" fill="#0f172a" name="Owners" />
                <Bar dataKey="branch_admins" stackId="a" fill="#0284c7" name="Branch Admins" />
                <Bar dataKey="workers" stackId="a" fill="#38bdf8" name="Workers" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">
            Feature Adoption &amp; Cross-Tier Overrides
          </h3>
        </CardHeader>
        <CardContent className="h-72" style={{ height: 288 }}>
          {!mounted ? (
            <div className="h-full w-full rounded-[10px] bg-slate-50 animate-pulse" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={featureCoverage.slice(0, 7)} layout="vertical" margin={{ left: 12, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="tierCount" stackId="b" fill="#0284c7" name="Via Tier" />
                <Bar dataKey="overrideCount" stackId="b" fill="#f59e0b" name="Cross-Tier Override" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function PasswordResetQueueCard({
  requests,
}: {
  requests: Array<{
    id: string;
    user_id: string;
    identifier_submitted: string;
    note: string | null;
    created_at: string;
    tenant_name: string | null;
    full_name: string | null;
    role: string | null;
  }>;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<(typeof requests)[0] | null>(null);
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    setBusy(true);
    try {
      await adminSetUserPasswordAction(selected.user_id, newPw, true);
      toast.success("Password updated & reset request resolved.");
      setSelected(null);
      setNewPw("");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">
            Pending Password Reset Requests ({requests.length})
          </h3>
          {requests.length > 0 && <Badge variant="warning">Action Required</Badge>}
        </CardHeader>
        <CardContent>
          {requests.length === 0 ? (
            <p className="text-xs text-slate-500">No pending password reset requests.</p>
          ) : (
            <div className="space-y-2">
              <Paged items={requests} size={5}>{(pagedRows) => pagedRows.map((r) => (
                <div
                  key={r.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-900">
                      {r.full_name ?? r.identifier_submitted}{" "}
                      <span className="text-slate-500">({r.role})</span>
                    </p>
                    <p className="text-slate-600">
                      {r.tenant_name ?? "Platform"} • Submitted: {r.identifier_submitted}
                      {r.note ? ` • "${r.note}"` : ""}
                    </p>
                  </div>
                  <Button size="sm" onClick={() => setSelected(r)}>
                    <KeyRound className="h-3.5 w-3.5" />
                    Set New Password
                  </Button>
                </div>
              ))}</Paged>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Set New Password"
        subtitle={selected ? `User: ${selected.full_name ?? selected.identifier_submitted}` : ""}
      >
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>New Temporary Password (min 8 chars)</Label>
            <Input
              type="text"
              minLength={8}
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              placeholder="Enter new password"
              required
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            Save Password &amp; Revoke Old Sessions
          </Button>
        </form>
      </Dialog>
    </>
  );
}

export function ProvisionTenantModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultPw, setResultPw] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [customDomain, setCustomDomain] = useState("");
  const [verticalKey, setVerticalKey] = useState<VerticalKey>("footwear");
  const [tier, setTier] = useState<TierKey>("tier_4");
  const [ownerName, setOwnerName] = useState("");
  const [ownerEmail, setOwnerEmail] = useState("");
  const [ownerUsername, setOwnerUsername] = useState("");
  const [branch1Name, setBranch1Name] = useState("New Delhi Factory");
  const [branch1Code, setBranch1Code] = useState("DEL");
  const [branch1State, setBranch1State] = useState("07");
  const [branch1Gstin, setBranch1Gstin] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await provisionTenantAction({
        name,
        slug: slug || name,
        customDomain,
        verticalKey,
        tier,
        ownerName,
        ownerEmail,
        ownerUsername,
        branches: [
          {
            name: branch1Name,
            code: branch1Code,
            type: "retail",
            gstin: branch1Gstin,
            stateCode: branch1State,
          },
        ],
      });
      setResultPw(res.tempPassword);
      toast.success("Tenant provisioned!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Provisioning failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button onClick={() => { setResultPw(null); setOpen(true); }}>
        <Plus className="h-4 w-4" />
        Provision New Client
      </Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Provision New Business Client"
        subtitle="Seeds all 30×3 permissions, vertical preset, default bill template & owner login."
        maxWidth="max-w-2xl"
      >
        {resultPw ? (
          <div className="space-y-4">
            <Alert variant="success" title="Tenant Created Successfully">
              Share these temporary credentials with the Shop Owner (they will be prompted to change password on login):
              <div className="mt-2 rounded-lg bg-white p-3 font-mono text-xs border border-emerald-200">
                <div>Username: <strong>{ownerUsername}</strong></div>
                <div>Email: <strong>{ownerEmail || "N/A"}</strong></div>
                <div>Temp Password: <strong>{resultPw}</strong></div>
              </div>
            </Alert>
            <Button className="w-full" onClick={() => setOpen(false)}>Done</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Business Name *</Label>
                <Input value={name} onChange={(e) => { setName(e.target.value); if (!slug) setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-")); }} required />
              </div>
              <div>
                <Label>URL Slug *</Label>
                <Input value={slug} onChange={(e) => setSlug(e.target.value)} required />
              </div>
              <div>
                <Label>Industry Vertical Preset</Label>
                <Select value={verticalKey} onChange={(e) => setVerticalKey(e.target.value as VerticalKey)}>
                  {Object.values(VERTICAL_PRESETS).map((v) => (
                    <option key={v.key} value={v.key}>{v.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Starting Tier</Label>
                <Select value={tier} onChange={(e) => setTier(e.target.value as TierKey)}>
                  {(Object.keys(TIER_META) as TierKey[]).map((tk) => (
                    <option key={tk} value={tk}>{TIER_META[tk].name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>Owner Full Name *</Label>
                <Input value={ownerName} onChange={(e) => setOwnerName(e.target.value)} required />
              </div>
              <div>
                <Label>Owner Username *</Label>
                <Input value={ownerUsername} onChange={(e) => setOwnerUsername(e.target.value)} required />
              </div>
              <div>
                <Label>Owner Email (optional)</Label>
                <Input type="email" value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} />
              </div>
              <div>
                <Label>Custom Domain (optional)</Label>
                <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="shop.client.in" />
              </div>
            </div>

            <div className="border-t border-slate-200 pt-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">Initial Branch</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="col-span-2">
                  <Label>Branch Name</Label>
                  <Input value={branch1Name} onChange={(e) => setBranch1Name(e.target.value)} required />
                </div>
                <div>
                  <Label>Code (≤4)</Label>
                  <Input maxLength={4} value={branch1Code} onChange={(e) => setBranch1Code(e.target.value.toUpperCase())} required />
                </div>
                <div>
                  <Label>State</Label>
                  <Select value={branch1State} onChange={(e) => setBranch1State(e.target.value)}>
                    {Object.entries(INDIAN_STATES).map(([code, nm]) => (
                      <option key={code} value={code}>{code} — {nm}</option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <Label>Branch GSTIN (optional)</Label>
                  <Input maxLength={15} value={branch1Gstin} onChange={(e) => setBranch1Gstin(e.target.value.toUpperCase())} />
                </div>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Provisioning..." : "Create Tenant & Seed Workspace"}
            </Button>
          </form>
        )}
      </Dialog>
    </>
  );
}

export function TenantDetailControls({
  tenant,
  users,
}: {
  tenant: TenantRow;
  users: Array<{
    id: string;
    full_name: string;
    username: string | null;
    email: string | null;
    role: string;
    is_active: boolean;
  }>;
}) {
  const router = useRouter();
  const [tier, setTier] = useState<TierKey>(tenant.tier);
  const [status, setStatus] = useState<TenantStatus>(tenant.status);
  const [maxUsers, setMaxUsers] = useState(tenant.max_users);
  const [maxBranches, setMaxBranches] = useState(tenant.max_branches);
  const [maxStorageMb, setMaxStorageMb] = useState(tenant.max_storage_mb);
  const [amcDate, setAmcDate] = useState(tenant.amc_renewal_date ? tenant.amc_renewal_date.slice(0, 10) : "");
  const [customDomain, setCustomDomain] = useState(tenant.custom_domain ?? "");
  const [pwTarget, setPwTarget] = useState<(typeof users)[0] | null>(null);
  const [newPw, setNewPw] = useState("");
  const [busy, setBusy] = useState(false);

  const saveTier = async () => {
    setBusy(true);
    try {
      await updateTenantTierAction(tenant.id, tier);
      toast.success(`Tier updated to ${TIER_META[tier].name}`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const toggleOverride = async (fk: FeatureKey, mode: "inherit" | "enable" | "disable") => {
    if (mode === "enable") {
      const reqs = getRequiredPrerequisites(fk).filter((r) => !isFeatureEnabled(tenant, r));
      if (reqs.length > 0) {
        const labels = reqs.map((r) => FEATURE_META[r].label).join(", ");
        if (!confirm(`Enabling ${FEATURE_META[fk].label} also requires: ${labels}. Enable them automatically?`)) {
          return;
        }
      }
    }
    if (mode === "disable") {
      const deps = getDependentFeatures(fk).filter((d) => isFeatureEnabled(tenant, d));
      if (deps.length > 0) {
        const labels = deps.map((d) => FEATURE_META[d].label).join(", ");
        if (!confirm(`Disabling ${FEATURE_META[fk].label} will also deactivate: ${labels}. Continue?`)) {
          return;
        }
      }
    }
    try {
      await setFeatureOverrideAction(tenant.id, fk, mode, true);
      toast.success("Feature override saved.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  const saveQuotas = async () => {
    setBusy(true);
    try {
      await updateTenantQuotasAndStatusAction(tenant.id, {
        status,
        maxUsers,
        maxBranches,
        maxStorageMb,
        amcRenewalDate: amcDate || null,
        customDomain: customDomain || null,
      });
      toast.success("Tenant settings saved.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Impersonation & Tier Promotion Bar */}
      <Card>
        <CardContent className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[240px]">
              <Label>Subscription Tier</Label>
              <Select value={tier} onChange={(e) => setTier(e.target.value as TierKey)}>
                {(Object.keys(TIER_META) as TierKey[]).map((tk) => (
                  <option key={tk} value={tk}>{TIER_META[tk].name}</option>
                ))}
              </Select>
            </div>
            <Button onClick={saveTier} disabled={busy || tier === tenant.tier}>
              <Sparkles className="h-4 w-4" />
              Promote / Apply Tier
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => startImpersonationAction(tenant.id, "read")}>
              <Eye className="h-4 w-4" />
              Inspect as Tenant (Read-Only)
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm(`Enter AUDITED WRITE-MODE support session for "${tenant.name}"? All mutations will be logged in audit_logs.`)) {
                  startImpersonationAction(tenant.id, "write");
                }
              }}
            >
              <ShieldAlert className="h-4 w-4" />
              Write Mode (Audited)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Cross-Tier Feature Overrides */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">
            Cross-Tier Feature Overrides (Mix &amp; Match Any Feature)
          </h3>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {FEATURE_KEYS.map((fk) => {
            const meta = FEATURE_META[fk];
            const active = isFeatureEnabled(tenant, fk);
            const overrideVal = tenant.feature_overrides?.[fk];
            const mode = overrideVal === true ? "enable" : overrideVal === false ? "disable" : "inherit";
            return (
              <div key={fk} className="rounded-[10px] border border-slate-200 p-3 flex flex-col justify-between gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{meta.label}</p>
                    <p className="text-[11px] text-slate-500">{meta.minTier.toUpperCase()} • {meta.category}</p>
                  </div>
                  <Badge variant={active ? "success" : "default"}>{active ? "Active" : "Locked"}</Badge>
                </div>
                <Select
                  value={mode}
                  onChange={(e) => toggleOverride(fk, e.target.value as "inherit" | "enable" | "disable")}
                  className="text-xs min-h-[36px]"
                >
                  <option value="inherit">Inherit from Tier</option>
                  <option value="enable">Force Enable</option>
                  <option value="disable">Force Disable</option>
                </Select>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Quotas, Status, AMC & Custom Domain */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Quotas, Status, AMC &amp; Custom Domain</h3>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <Label>Status</Label>
              <Select value={status} onChange={(e) => setStatus(e.target.value as TenantStatus)}>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </Select>
            </div>
            <div>
              <Label>Max Users</Label>
              <Input type="number" min={1} value={maxUsers} onChange={(e) => setMaxUsers(Number(e.target.value))} />
            </div>
            <div>
              <Label>Max Branches</Label>
              <Input type="number" min={1} value={maxBranches} onChange={(e) => setMaxBranches(Number(e.target.value))} />
            </div>
            <div>
              <Label>Max R2 Storage (MB)</Label>
              <Input type="number" min={50} value={maxStorageMb} onChange={(e) => setMaxStorageMb(Number(e.target.value))} />
            </div>
            <div>
              <Label>AMC Renewal Date</Label>
              <Input type="date" value={amcDate} onChange={(e) => setAmcDate(e.target.value)} />
            </div>
            <div>
              <Label>Custom Domain</Label>
              <Input value={customDomain} onChange={(e) => setCustomDomain(e.target.value)} placeholder="store.client.in" />
            </div>
          </div>
          {customDomain && (
            <Alert variant="info" title="Client DNS Instructions">
              Ask client to point <code>{customDomain}</code> via <strong>CNAME → cname.vercel-dns.com</strong> (and add the domain in Vercel Project Settings).
            </Alert>
          )}
          <Button onClick={saveQuotas} disabled={busy}>Save Quotas &amp; Status</Button>
        </CardContent>
      </Card>

      {/* Tenant Users & Direct Password Set */}
      <Card>
        <CardHeader>
          <h3 className="text-sm font-semibold text-slate-900">Tenant Users &amp; Direct Password Management</h3>
        </CardHeader>
        <CardContent className="space-y-2">
          <Paged items={users} size={8}>{(pagedRows) => pagedRows.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs">
              <div>
                <p className="font-semibold text-slate-900">{u.full_name}</p>
                <p className="text-slate-500">
                  Role: <strong>{u.role}</strong> • Username: <code>{u.username ?? "—"}</code> • Email: {u.email ?? "—"}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setPwTarget(u)}>
                <KeyRound className="h-3.5 w-3.5" />
                Set / Replace Password
              </Button>
            </div>
          ))}</Paged>
        </CardContent>
      </Card>

      <Dialog
        open={Boolean(pwTarget)}
        onClose={() => setPwTarget(null)}
        title="Set / Replace User Password"
        subtitle={pwTarget ? `${pwTarget.full_name} (${pwTarget.role})` : ""}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!pwTarget) return;
            await adminSetUserPasswordAction(pwTarget.id, newPw, true);
            toast.success("Password updated & active sessions revoked.");
            setPwTarget(null);
            setNewPw("");
          }}
          className="space-y-3"
        >
          <div>
            <Label>New Password (min 8 chars)</Label>
            <Input type="text" minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full">Save Password</Button>
        </form>
      </Dialog>
    </div>
  );
}

export function PlatformPermissionsAndHsnClient({
  tenants,
  globalDefaults,
  tenantOverrides,
  hsnCodes,
  people,
}: {
  tenants: TierTenant[];
  people: TierPerson[];
  globalDefaults: Record<string, { owner: boolean; branch_admin: boolean; worker: boolean }>;
  tenantOverrides: Record<string, Record<string, { owner: boolean; branch_admin: boolean; worker: boolean }>>;
  hsnCodes: HsnCodeRow[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState("tiers");
  const [scope, setScope] = useState<string>("global");
  const [hsnOpen, setHsnOpen] = useState(false);
  const [hCode, setHCode] = useState("");
  const [hDesc, setHDesc] = useState("");
  const [hCat, setHCat] = useState("Footwear");
  const [hRule, setHRule] = useState<"flat" | "price_threshold">("flat");
  const [hRate, setHRate] = useState(18);
  const [hThresh, setHThresh] = useState(2500);
  const [hBelow, setHBelow] = useState(5);
  const [hAbove, setHAbove] = useState(18);

  const activeMap = scope === "global" ? globalDefaults : (tenantOverrides[scope] ?? globalDefaults);

  const togglePerm = async (permKey: string, role: TenantRole, current: boolean) => {
    try {
      await updatePermissionMatrixAction(scope === "global" ? "global" : scope, role, permKey, !current);
      toast.success("Permission updated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  };

  return (
    <div className="space-y-4">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "tiers", label: "People & Tiers", badge: people.length },
          { id: "matrix", label: "Role Permissions", badge: PERMISSION_DEFINITIONS.length },
          { id: "hsn", label: "HSN / SAC Codes", badge: hsnCodes.length },
        ]}
      />

      {tab === "tiers" ? (
        <TierManager people={people} tenants={tenants} />
      ) : tab === "matrix" ? (() => {
        const grouped = new Map<string, Array<(typeof PERMISSION_DEFINITIONS)[number]>>();
        for (const p of PERMISSION_DEFINITIONS) {
          const list = grouped.get(p.module) ?? [];
          list.push(p);
          grouped.set(p.module, list);
        }
        const modules = Array.from(grouped.entries());

        return (
          <div className="space-y-3">
            <div className="ui-tray">
              <div className="ui-surface flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3">
                <div>
                  <h3 className="text-[13px] font-semibold text-[#171717]">
                    Permission Matrix ({PERMISSION_DEFINITIONS.length} permissions · Single Page)
                  </h3>
                  <p className="text-[11.5px] text-[#77777d]">
                    Click any box to allow or block a permission for Owner, Branch Admin, or Worker.
                  </p>
                </div>
                <div className="w-full sm:w-64">
                  <Select value={scope} onChange={(e) => setScope(e.target.value)}>
                    <option value="global">All businesses (default)</option>
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </Select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {modules.map(([modName, perms]) => (
                <div key={modName} className="ui-tray">
                  <div className="ui-surface overflow-hidden">
                    <div className="grid grid-cols-[1fr_52px_52px_52px] items-center border-b border-[#ececee] bg-[#fafafa] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-[#77777d]">
                      <span className="text-[#171717]">
                        {modName} <span className="font-normal text-[#a3a3a8]">({perms.length})</span>
                      </span>
                      <span className="text-center">Owner</span>
                      <span className="text-center">Admin</span>
                      <span className="text-center">Worker</span>
                    </div>
                    <div className="divide-y divide-[#f1f1f2]">
                      {perms.map((p) => {
                        const row = activeMap[p.key] ?? {
                          owner: p.owner,
                          branch_admin: p.branch_admin,
                          worker: p.worker,
                        };
                        const tierBadge = FEATURE_META[p.feature].minTier.replace("tier_", "T");
                        return (
                          <div
                            key={p.key}
                            className="grid grid-cols-[1fr_52px_52px_52px] items-center px-3 py-1.5 text-xs hover:bg-[#fafafa]"
                          >
                            <div className="flex min-w-0 items-center gap-1.5 pr-2">
                              <span className="truncate font-medium text-[#171717]">{p.label}</span>
                              <span className="shrink-0 rounded bg-[#f1f1f2] px-1 py-px font-mono text-[9.5px] font-medium text-[#77777d]">
                                {tierBadge}
                              </span>
                            </div>
                            {(["owner", "branch_admin", "worker"] as TenantRole[]).map((role) => (
                              <div key={role} className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => togglePerm(p.key, role, row[role])}
                                  role="checkbox"
                                  aria-checked={row[role]}
                                  aria-label={`${p.label} for ${role.replace("_", " ")}`}
                                  className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] cursor-pointer transition-all active:scale-90 ${
                                    row[role]
                                      ? "bg-[#171717] text-white shadow-2xs"
                                      : "bg-white text-transparent shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)] hover:bg-[#f4f4f5]"
                                  }`}
                                >
                                  <Check className="h-3 w-3" strokeWidth={3} />
                                </button>
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })() : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Master HSN / SAC Directory</h3>
            <Button size="sm" onClick={() => setHsnOpen(true)}>
              <Plus className="h-4 w-4" /> Add HSN Code
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="p-2.5">HSN/SAC</th>
                  <th className="p-2.5">Category</th>
                  <th className="p-2.5">Description</th>
                  <th className="p-2.5">GST Rule</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <Paged items={hsnCodes} size={12} asRow>{(pagedRows) => pagedRows.map((h) => (
                  <tr key={h.id}>
                    <td className="p-2.5 font-bold">{h.code}</td>
                    <td className="p-2.5">{h.category}</td>
                    <td className="p-2.5 text-slate-600">{h.description}</td>
                    <td className="p-2.5">
                      {h.rate_rule_type === "price_threshold"
                        ? `<= ₹${h.threshold_amount}: ${h.rate_below_threshold}% | > ₹${h.threshold_amount}: ${h.rate_above_threshold}%`
                        : `Flat ${h.default_gst_rate}%`}
                    </td>
                  </tr>
                ))}</Paged>
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      <Dialog open={hsnOpen} onClose={() => setHsnOpen(false)} title="Add Master HSN / SAC Code">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            await upsertMasterHsnAction({
              code: hCode,
              description: hDesc,
              category: hCat,
              rateRuleType: hRule,
              thresholdAmount: hRule === "price_threshold" ? hThresh : null,
              rateBelow: hRule === "price_threshold" ? hBelow : null,
              rateAbove: hRule === "price_threshold" ? hAbove : null,
              defaultGstRate: hRate,
            });
            toast.success("HSN saved.");
            setHsnOpen(false);
            router.refresh();
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <div><Label>HSN Code</Label><Input value={hCode} onChange={(e) => setHCode(e.target.value)} required /></div>
            <div><Label>Category</Label><Input value={hCat} onChange={(e) => setHCat(e.target.value)} required /></div>
          </div>
          <div><Label>Description</Label><Input value={hDesc} onChange={(e) => setHDesc(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rule Type</Label>
              <Select value={hRule} onChange={(e) => setHRule(e.target.value as "flat" | "price_threshold")}>
                <option value="flat">Flat GST %</option>
                <option value="price_threshold">Price Threshold Slab</option>
              </Select>
            </div>
            <div>
              <Label>Default GST %</Label>
              <Input type="number" value={hRate} onChange={(e) => setHRate(Number(e.target.value))} />
            </div>
          </div>
          {hRule === "price_threshold" && (
            <div className="grid grid-cols-3 gap-2">
              <div><Label>Threshold ₹</Label><Input type="number" value={hThresh} onChange={(e) => setHThresh(Number(e.target.value))} /></div>
              <div><Label>Below %</Label><Input type="number" value={hBelow} onChange={(e) => setHBelow(Number(e.target.value))} /></div>
              <div><Label>Above %</Label><Input type="number" value={hAbove} onChange={(e) => setHAbove(Number(e.target.value))} /></div>
            </div>
          )}
          <Button type="submit" className="w-full">Save Master HSN</Button>
        </form>
      </Dialog>
    </div>
  );
}

export function CopySnippetButton({ text, label = "Copy" }: { text: string; label?: string }) {
  return (
    <Button
      size="sm"
      variant="outline"
      onClick={() => {
        navigator.clipboard.writeText(text);
        toast.success("Copied to clipboard");
      }}
    >
      <Copy className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
