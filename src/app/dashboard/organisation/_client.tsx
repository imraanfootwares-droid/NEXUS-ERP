"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Check,
  Factory,
  KeyRound,
  Pencil,
  Plus,
  Store,
  Trash2,
  UserPlus,
  UserRound,
  UserX,
  Warehouse,
} from "lucide-react";
import { toast } from "sonner";
import {
  createBranchAction,
  createStaffAction,
  deleteBranchAction,
  resetStaffPasswordAction,
  toggleStaffActiveAction,
  updateBranchAction,
  updateStaffAction,
  updateTenantRolePermissionAction,
} from "@/actions/settings";
import { OrgTreeView } from "@/components/org/org-tree-view";
import type { OrgNode } from "@/components/org/org-tree-layout";
import { GstinInput } from "@/components/ui/dynamic-fields";
import { Paged } from "@/components/ui/pagination";
import { Badge, Button, Card, CardContent, CardHeader, Dialog, Form, Input, Label, Select, Tabs } from "@/components/ui/primitives";
import { Segmented, StatTray } from "@/components/ui/spark";
import { effectiveUserTier, isFeatureEnabled } from "@/lib/auth/access";
import { INDIAN_STATES, PERMISSION_DEFINITIONS, type PermissionKey, type TierKey } from "@/lib/constants/saas";
import type { BranchRow, TenantRow } from "@/types/database";

export interface OrgProfileSummary {
  id: string;
  tenant_id: string | null;
  role: "owner" | "branch_admin" | "worker";
  full_name: string;
  username: string | null;
  email: string | null;
  phone: string | null;
  is_active: boolean;
  tier_override?: TierKey | null;
}

const GROUP_OPTIONS = ["Branches", "People"] as const;

export function DashboardOrganisationClient({
  tenant,
  userRole = "owner",
  initialTab = "visual",
  permissions,
  branches,
  profiles,
  profileBranches,
  resets = [],
  rolePermRows = [],
  canCreateBranch = false,
  canCreateStaff = false,
}: {
  tenant: TenantRow;
  userRole?: string;
  initialTab?: string;
  permissions: Record<PermissionKey, boolean>;
  branches: BranchRow[];
  profiles: OrgProfileSummary[];
  profileBranches: Array<{ user_id: string; branch_id: string }>;
  resets?: Array<{
    id: string;
    user_id: string;
    identifier_submitted: string;
    note: string | null;
    created_at: string;
    full_name: string | null;
    role: string | null;
  }>;
  rolePermRows?: Array<{ role: "branch_admin" | "worker"; permission_key: string; allowed: boolean }>;
  canCreateBranch?: boolean;
  canCreateStaff?: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [groupBy, setGroupBy] = useState<(typeof GROUP_OPTIONS)[number]>("Branches");
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);

  // Branch create / edit state
  const [addBranchOpen, setAddBranchOpen] = useState(false);
  const [editBranchId, setEditBranchId] = useState<string | null>(null);
  const [bName, setBName] = useState("");
  const [bCode, setBCode] = useState("");
  const [bType, setBType] = useState<"retail" | "factory" | "warehouse">("retail");
  const [bState, setBState] = useState(tenant.tax_config?.default_state_code ?? "33");
  const [bGstin, setBGstin] = useState("");
  const [bAddress, setBAddress] = useState("");
  const [bPhone, setBPhone] = useState("");
  const [savingBranch, setSavingBranch] = useState(false);

  // Staff create / edit / reset password state
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [sName, setSName] = useState("");
  const [sUsername, setSUsername] = useState("");
  const [sPassword, setSPassword] = useState("");
  const [sRole, setSRole] = useState<"branch_admin" | "worker">("worker");
  const [sPhone, setSPhone] = useState("");
  const [sEmail, setSEmail] = useState("");
  const [sBranchIds, setSBranchIds] = useState<string[]>(() => (branches[0] ? [branches[0].id] : []));
  const [savingStaff, setSavingStaff] = useState(false);
  const [editStaffTarget, setEditStaffTarget] = useState<{
    id: string;
    full_name: string;
    email: string;
    role: "branch_admin" | "worker";
  } | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
  const [resetPw, setResetPw] = useState("");

  const retailCount = branches.filter((b) => b.type === "retail").length;
  const factoryCount = branches.filter((b) => b.type === "factory").length;
  const warehouseCount = branches.filter((b) => b.type === "warehouse").length;
  const activePeople = profiles.filter((p) => p.is_active).length;
  const adminCount = profiles.filter((p) => p.role !== "worker").length;
  const workerCount = profiles.filter((p) => p.role === "worker").length;
  const remainingBranches = Math.max(0, tenant.max_branches - branches.length);
  const remainingUsers = Math.max(0, tenant.max_users - activePeople);
  const branchLimitReached = remainingBranches === 0;
  const staffLimitReached = remainingUsers === 0;

  const permLookup = useMemo(() => {
    const m = new Map<string, boolean>();
    for (const r of rolePermRows) m.set(`${r.role}:${r.permission_key}`, r.allowed);
    return m;
  }, [rolePermRows]);

  const branchById = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);
  const staffBranchNames = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const pb of profileBranches) {
      const b = branchById.get(pb.branch_id);
      if (!b) continue;
      const list = m.get(pb.user_id) ?? [];
      list.push(b.name);
      m.set(pb.user_id, list);
    }
    return m;
  }, [profileBranches, branchById]);

  const { root } = useMemo(() => {
    const branchMap = new Map<string, string>();
    for (const pb of profileBranches) {
      if (!branchMap.has(pb.user_id)) branchMap.set(pb.user_id, pb.branch_id);
    }

    const personNode = (p: OrgProfileSummary): OrgNode => {
      const warnings: string[] = [];
      if (!p.is_active) warnings.push("Account disabled");
      return {
        id: `person:${p.id}`,
        kind: "person",
        label: p.full_name,
        sublabel: p.role.replace("_", " "),
        role: p.role,
        tenantId: tenant.id,
        branchId: branchMap.get(p.id) ?? branches[0]?.id,
        personId: p.id,
        isActive: p.is_active,
        meta: {
          email: p.email,
          username: p.username,
          tier: effectiveUserTier(tenant.tier, p.tier_override),
        },
        counts: {
          branches: 0,
          retail: 0,
          factory: 0,
          warehouse: 0,
          people: 1,
          admins: p.role === "worker" ? 0 : 1,
          workers: p.role === "worker" ? 1 : 0,
          pendingResets: 0,
        },
        warnings,
        managers: [],
        children: [],
      };
    };

    let children: OrgNode[] = [];
    if (groupBy === "Branches") {
      children = branches.map((b) => {
        const assigned = profiles.filter((p) => (branchMap.get(p.id) ?? branches[0]?.id) === b.id);
        const warnings: string[] = [];
        if (assigned.length === 0) warnings.push("No staff assigned");
        return {
          id: `branch:${b.id}`,
          kind: "branch",
          label: b.name,
          sublabel: `${b.type} · ${b.code}`,
          branchType: b.type,
          tenantId: tenant.id,
          branchId: b.id,
          isDefault: b.is_default,
          meta: { code: b.code, stateCode: b.state_code, gstin: b.gstin },
          counts: {
            branches: 1,
            retail: b.type === "retail" ? 1 : 0,
            factory: b.type === "factory" ? 1 : 0,
            warehouse: b.type === "warehouse" ? 1 : 0,
            people: assigned.length,
            admins: assigned.filter((p) => p.role !== "worker").length,
            workers: assigned.filter((p) => p.role === "worker").length,
            pendingResets: 0,
          },
          warnings,
          managers: assigned.map((p) => ({ id: p.id, name: p.full_name, role: p.role.replace("_", " ") })),
          children: assigned.map(personNode),
        };
      });
    } else {
      children = profiles.map(personNode);
    }

    const tenantRoot: OrgNode = {
      id: `tenant:${tenant.id}`,
      kind: "tenant",
      label: tenant.name,
      sublabel: `${branches.length} ${branches.length === 1 ? "branch" : "branches"} · ${profiles.length} ${
        profiles.length === 1 ? "person" : "people"
      }`,
      tenantId: tenant.id,
      meta: { tier: tenant.tier, status: tenant.status },
      counts: {
        branches: branches.length,
        retail: retailCount,
        factory: factoryCount,
        warehouse: warehouseCount,
        people: profiles.length,
        admins: adminCount,
        workers: workerCount,
        pendingResets: resets.length,
      },
      warnings: [],
      managers: profiles.filter((p) => p.role === "owner").map((p) => ({ id: p.id, name: p.full_name, role: "owner" })),
      children,
    };

    return { root: tenantRoot };
  }, [tenant, branches, profiles, profileBranches, groupBy, retailCount, factoryCount, warehouseCount, adminCount, workerCount, resets.length]);

  const inspectedBranch =
    selectedNode?.kind === "branch" ? branches.find((b) => b.id === selectedNode.branchId) ?? null : null;
  const inspectedPerson =
    selectedNode?.kind === "person" ? profiles.find((p) => p.id === selectedNode.personId) ?? null : null;

  const branchSummaryParts = [
    retailCount > 0 ? `${retailCount} retail` : null,
    factoryCount > 0 ? `${factoryCount} factory` : null,
    warehouseCount > 0 ? `${warehouseCount} warehouse` : null,
  ].filter(Boolean);

  const openCreateBranch = () => {
    setEditBranchId(null);
    setBName("");
    setBCode("");
    setBType("retail");
    setBState(tenant.tax_config?.default_state_code ?? "33");
    setBGstin("");
    setBAddress("");
    setBPhone("");
    setAddBranchOpen(true);
  };

  const openEditBranch = (b: BranchRow) => {
    setEditBranchId(b.id);
    setBName(b.name);
    setBCode(b.code);
    setBType(b.type);
    setBState(b.state_code);
    setBGstin(b.gstin ?? "");
    setBAddress(b.address ?? "");
    setBPhone(b.phone ?? "");
    setAddBranchOpen(true);
  };

  const openCreateStaff = () => {
    setSName("");
    setSUsername("");
    setSPassword("");
    setSRole("worker");
    setSPhone("");
    setSEmail("");
    setSBranchIds(branches[0] ? [branches[0].id] : []);
    setAddStaffOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Header + Quick Create Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1>Shops &amp; Team</h1>
          <p className="mt-0.5 text-[12.5px] text-[#77777d]">
            Manage all your shops, staff logins, visual map, and staff permissions in one place.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canCreateBranch && (
            <Button
              size="sm"
              disabled={branchLimitReached}
              title={branchLimitReached ? `Branch limit reached (${branches.length}/${tenant.max_branches})` : undefined}
              onClick={openCreateBranch}
            >
              <Plus className="h-4 w-4" /> Add Branch / Shop
            </Button>
          )}
          {canCreateStaff && (
            <Button
              size="sm"
              variant="outline"
              disabled={staffLimitReached}
              title={staffLimitReached ? `Staff limit reached (${activePeople}/${tenant.max_users})` : undefined}
              onClick={openCreateStaff}
            >
              <UserPlus className="h-4 w-4" /> Add Staff
            </Button>
          )}
        </div>
      </div>

      {/* Responsive KPI Summary Strip */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTray
          label="Branches / Shops"
          value={branches.length}
          unit={`of ${tenant.max_branches}`}
          footnote={
            remainingBranches > 0
              ? `${branchSummaryParts.join(" · ") || "None"} · ${remainingBranches} more available`
              : `${branchSummaryParts.join(" · ")} · Limit reached`
          }
        />
        <StatTray
          label="Team Members"
          value={profiles.length}
          unit={`${activePeople} active`}
          footnote={`${remainingUsers} of ${tenant.max_users} seats available`}
        />
        <StatTray
          label="Owners & Managers"
          value={adminCount}
          unit="Managers"
          footnote="Owner & branch admin roles"
        />
        <StatTray
          label="Counter Staff"
          value={workerCount}
          unit="Staff"
          footnote={resets.length > 0 ? `${resets.length} password reset pending` : "Counter & operations staff"}
        />
      </div>

      {/* Unified 4-Tab Hub */}
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "visual", label: "Visual Map" },
          { id: "branches", label: `Shops (${branches.length}/${tenant.max_branches})` },
          { id: "staff", label: `Staff (${profiles.length}/${tenant.max_users})`, badge: resets.length || undefined },
          { id: "permissions", label: "Staff Access" },
        ]}
      />

      {/* TAB 1: VISUAL MAP */}
      {tab === "visual" && (
        <OrgTreeView
          root={root}
          flows={[]}
          onSelect={(node) => setSelectedNode(node)}
          selectedId={selectedNode?.id ?? null}
          resetKey={`${tenant.id}:${groupBy}:${branches.length}:${profiles.length}`}
          startOpen
          toolbarExtra={
            <Segmented
              label="Group organisation by"
              options={GROUP_OPTIONS}
              value={groupBy}
              onChange={setGroupBy}
            />
          }
        />
      )}

      {/* TAB 2: SHOPS / BRANCHES */}
      {tab === "branches" && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold">
                Your Shops &amp; Branches ({branches.length} of {tenant.max_branches} used · {remainingBranches} remaining)
              </h3>
              <p className="text-xs text-[#77777d]">
                See each branch&apos;s type (Retail, Factory, Warehouse), State, GSTIN, and assigned team.
              </p>
            </div>
            {canCreateBranch && (
              <Button size="sm" disabled={branchLimitReached} onClick={openCreateBranch}>
                <Plus className="h-3.5 w-3.5" /> Add Branch / Shop
              </Button>
            )}
          </CardHeader>
          <CardContent className="space-y-2.5">
            <Paged items={branches} size={10}>
              {(pagedRows) =>
                pagedRows.map((b) => {
                  const stateLabel = INDIAN_STATES[b.state_code]
                    ? `${b.state_code} — ${INDIAN_STATES[b.state_code]}`
                    : `State ${b.state_code}`;
                  const typeLabel =
                    b.type === "factory" ? "Factory" : b.type === "warehouse" ? "Warehouse / Godown" : "Retail Shop";
                  return (
                    <div
                      key={b.id}
                      className="rounded-xl border border-[#e5e5e7] bg-[#fafafa] p-3.5 text-xs flex flex-wrap items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {b.type === "factory" ? (
                            <Factory className="h-4 w-4 text-amber-600" />
                          ) : b.type === "warehouse" ? (
                            <Warehouse className="h-4 w-4 text-sky-600" />
                          ) : (
                            <Store className="h-4 w-4 text-emerald-600" />
                          )}
                          <p className="font-semibold text-[#171717]">
                            {b.name} <span className="font-mono text-[#77777d]">({b.code})</span>
                          </p>
                          <Badge variant="default">{typeLabel}</Badge>
                          {b.is_default && <Badge variant="info">Default</Badge>}
                          {b.is_read_only && <Badge variant="warning">Read-Only</Badge>}
                        </div>
                        <p className="text-[#52525b]">
                          <strong>State:</strong> {stateLabel} · <strong>GSTIN:</strong> {b.gstin || "Not set"}
                          {b.phone ? ` · Phone: ${b.phone}` : ""}
                        </p>
                        {b.address && <p className="text-[#77777d]">{b.address}</p>}
                      </div>
                      {permissions["settings.tax_and_hsn"] && (
                        <div className="flex items-center gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => openEditBranch(b)}>
                            <Pencil className="h-3.5 w-3.5" /> Edit
                          </Button>
                          {!b.is_default && (
                            <button
                              type="button"
                              title="Delete Branch"
                              onClick={async () => {
                                if (!confirm(`Delete branch "${b.name}"?`)) return;
                                try {
                                  await deleteBranchAction(b.id);
                                  toast.success("Branch deleted.");
                                  router.refresh();
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : "Cannot delete branch with existing transactions."
                                  );
                                }
                              }}
                              className="rounded-lg bg-white p-2 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50 cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              }
            </Paged>
          </CardContent>
        </Card>
      )}

      {/* TAB 3: STAFF */}
      {tab === "staff" && (
        <div className="space-y-4">
          {resets.length > 0 && permissions["staff.reset_password"] && (
            <Card className="border-amber-300 bg-amber-50/40">
              <CardHeader>
                <h3 className="text-sm font-semibold">Pending Staff Password Reset Requests ({resets.length})</h3>
              </CardHeader>
              <CardContent className="space-y-2">
                {resets.map((r) => (
                  <div
                    key={r.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white border border-amber-200 p-2.5 text-xs"
                  >
                    <div>
                      <p className="font-bold">
                        {r.full_name} ({r.role})
                      </p>
                      <p className="text-slate-500">
                        Submitted: {r.identifier_submitted} {r.note ? `• "${r.note}"` : ""}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => setResetTarget({ id: r.user_id, name: r.full_name ?? r.identifier_submitted })}
                    >
                      <KeyRound className="h-3.5 w-3.5" /> Reset Password
                    </Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">
                  Team Members ({profiles.length} / {tenant.max_users} seats)
                </h3>
                <p className="text-xs text-[#77777d]">
                  Create logins, assign staff to shops, reset passwords, or disable old accounts.
                </p>
              </div>
              {canCreateStaff && (
                <Button size="sm" disabled={staffLimitReached} onClick={openCreateStaff}>
                  <UserPlus className="h-3.5 w-3.5" /> Add Staff
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-2.5">
              <Paged items={profiles} size={12}>
                {(pagedRows) =>
                  pagedRows.map((u) => {
                    const assignedNames = staffBranchNames.get(u.id) ?? [];
                    return (
                      <div
                        key={u.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#e5e5e7] bg-[#fafafa] p-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-semibold text-[#171717]">
                            {u.full_name}{" "}
                            <Badge className="ml-1">{u.role.replace("_", " ")}</Badge>
                            {!u.is_active && (
                              <Badge variant="danger" className="ml-1">
                                Disabled
                              </Badge>
                            )}
                          </p>
                          <p className="text-[#52525b]">
                            Login: <code>{u.username ?? "—"}</code>
                            {u.email ? ` · ${u.email}` : ""}
                            {assignedNames.length > 0 ? ` · Shops: ${assignedNames.join(", ")}` : ""}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {permissions["staff.reset_password"] &&
                            u.role !== "owner" &&
                            (userRole === "owner" || u.role === "worker") && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setResetTarget({ id: u.id, name: u.full_name })}
                              >
                                <KeyRound className="h-3.5 w-3.5" /> Reset PW
                              </Button>
                            )}
                          {permissions["settings.staff_and_roles"] && u.role !== "owner" && (
                            <>
                              <button
                                type="button"
                                title="Edit Staff"
                                onClick={() =>
                                  setEditStaffTarget({
                                    id: u.id,
                                    full_name: u.full_name,
                                    email: u.email ?? "",
                                    role: u.role === "branch_admin" ? "branch_admin" : "worker",
                                  })
                                }
                                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                title={u.is_active ? "Deactivate Staff" : "Reactivate Staff"}
                                onClick={async () => {
                                  if (
                                    !confirm(
                                      `${u.is_active ? "Deactivate" : "Reactivate"} staff account "${u.full_name}"?`
                                    )
                                  )
                                    return;
                                  await toggleStaffActiveAction(u.id, !u.is_active);
                                  toast.success(u.is_active ? "Staff deactivated." : "Staff reactivated.");
                                  router.refresh();
                                }}
                                className={`rounded-lg p-1.5 text-white cursor-pointer ${
                                  u.is_active ? "bg-rose-500 hover:bg-rose-600" : "bg-emerald-600 hover:bg-emerald-700"
                                }`}
                              >
                                <UserX className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                }
              </Paged>
            </CardContent>
          </Card>
        </div>
      )}

      {/* TAB 4: STAFF ACCESS (PERMISSIONS) */}
      {tab === "permissions" &&
        (() => {
          const activePerms = PERMISSION_DEFINITIONS.filter((p) => isFeatureEnabled(tenant, p.feature));
          const grouped = new Map<string, typeof activePerms>();
          for (const p of activePerms) {
            const list = grouped.get(p.module) ?? [];
            list.push(p);
            grouped.set(p.module, list);
          }
          const modules = Array.from(grouped.entries());

          return (
            <div className="space-y-3">
              <div className="ui-tray">
                <div className="ui-surface flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                  <div>
                    <h3 className="text-[13px] font-semibold text-[#171717]">
                      Staff Access &amp; Permissions ({activePerms.length} permissions)
                    </h3>
                    <p className="text-[11.5px] text-[#77777d]">
                      Tap any box to allow or block what Branch Admins and Counter Staff can do. Saves automatically.
                    </p>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-[#77777d]">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] bg-[#171717] text-white">
                        <Check className="h-2.5 w-2.5" strokeWidth={3} />
                      </span>
                      Allowed
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="inline-flex h-4 w-4 items-center justify-center rounded-[4px] bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)]" />
                      Blocked
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                {modules.map(([modName, perms]) => (
                  <div key={modName} className="ui-tray">
                    <div className="ui-surface overflow-hidden">
                      <div className="grid grid-cols-[1fr_64px_64px] items-center border-b border-[#ececee] bg-[#fafafa] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-[#77777d]">
                        <span className="text-[#171717]">
                          {modName} <span className="font-normal text-[#a3a3a8]">({perms.length})</span>
                        </span>
                        <span className="text-center">Admin</span>
                        <span className="text-center">Staff</span>
                      </div>
                      <div className="divide-y divide-[#f1f1f2]">
                        {perms.map((p) => (
                          <div
                            key={p.key}
                            className="grid grid-cols-[1fr_64px_64px] items-center px-3 py-1.5 text-xs hover:bg-[#fafafa]"
                          >
                            <span className="pr-2 font-medium text-[#171717]">{p.label}</span>
                            {(["branch_admin", "worker"] as const).map((role) => {
                              const val = permLookup.get(`${role}:${p.key}`) ?? p[role];
                              return (
                                <div key={role} className="flex justify-center">
                                  <button
                                    type="button"
                                    disabled={!permissions["settings.staff_and_roles"]}
                                    role="checkbox"
                                    aria-checked={val}
                                    aria-label={`${p.label} for ${role === "branch_admin" ? "Branch Admin" : "Worker"}`}
                                    onClick={async () => {
                                      await updateTenantRolePermissionAction(role, p.key, !val);
                                      toast.success("Permission updated.");
                                      router.refresh();
                                    }}
                                    className={`inline-flex h-[18px] w-[18px] items-center justify-center rounded-[5px] cursor-pointer transition-all active:scale-90 disabled:opacity-50 ${
                                      val
                                        ? "bg-[#171717] text-white shadow-2xs"
                                        : "bg-white text-transparent shadow-[inset_0_0_0_1px_rgba(0,0,0,.18)] hover:bg-[#f4f4f5]"
                                    }`}
                                  >
                                    <Check className="h-3 w-3" strokeWidth={3} />
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      {/* Node Inspector Modal (from Visual Map) */}
      <Dialog
        open={Boolean(selectedNode)}
        onClose={() => setSelectedNode(null)}
        title={selectedNode?.label ?? "Details"}
      >
        {selectedNode?.kind === "tenant" && (
          <div className="space-y-3 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-slate-500" />
              <span className="font-semibold text-slate-900">{tenant.name}</span>
              <Badge variant="info">{tenant.tier.replace("_", " ").toUpperCase()}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
              <div>
                <p className="text-[11px] text-slate-500">Total Branches</p>
                <p className="font-semibold text-slate-900">
                  {branches.length} / {tenant.max_branches}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Team Members</p>
                <p className="font-semibold text-slate-900">
                  {profiles.length} / {tenant.max_users}
                </p>
              </div>
            </div>
          </div>
        )}

        {inspectedBranch && (
          <div className="space-y-3 text-xs text-slate-700">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {inspectedBranch.type === "factory" ? (
                  <Factory className="h-4 w-4 text-amber-600" />
                ) : inspectedBranch.type === "warehouse" ? (
                  <Warehouse className="h-4 w-4 text-sky-600" />
                ) : (
                  <Store className="h-4 w-4 text-emerald-600" />
                )}
                <span className="font-semibold text-slate-900">{inspectedBranch.name}</span>
                <Badge>{inspectedBranch.code}</Badge>
              </div>
              {permissions["settings.tax_and_hsn"] && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedNode(null);
                    openEditBranch(inspectedBranch);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
              <div>
                <p className="text-[11px] text-slate-500">Type</p>
                <p className="capitalize text-slate-900">{inspectedBranch.type}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">State</p>
                <p className="text-slate-900">
                  {INDIAN_STATES[inspectedBranch.state_code]
                    ? `${inspectedBranch.state_code} — ${INDIAN_STATES[inspectedBranch.state_code]}`
                    : inspectedBranch.state_code}
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">GSTIN</p>
                <p className="font-mono text-slate-900">{inspectedBranch.gstin || "Not set"}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Phone</p>
                <p className="text-slate-900">{inspectedBranch.phone || "Not set"}</p>
              </div>
              {inspectedBranch.address && (
                <div className="col-span-2">
                  <p className="text-[11px] text-slate-500">Address</p>
                  <p className="text-slate-900">{inspectedBranch.address}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {inspectedPerson && (
          <div className="space-y-3 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              <UserRound className="h-4 w-4 text-slate-500" />
              <span className="font-semibold text-slate-900">{inspectedPerson.full_name}</span>
              <Badge variant={inspectedPerson.is_active ? "success" : "danger"}>
                {inspectedPerson.is_active ? "Active" : "Disabled"}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
              <div>
                <p className="text-[11px] text-slate-500">Role</p>
                <p className="capitalize text-slate-900">{inspectedPerson.role.replace("_", " ")}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Username</p>
                <p className="font-mono text-slate-900">{inspectedPerson.username || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Email</p>
                <p className="text-slate-900">{inspectedPerson.email || "—"}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Phone</p>
                <p className="text-slate-900">{inspectedPerson.phone || "—"}</p>
              </div>
            </div>
          </div>
        )}
      </Dialog>

      {/* Add / Edit Branch Modal */}
      <Dialog
        open={addBranchOpen}
        onClose={() => setAddBranchOpen(false)}
        title={editBranchId ? "Edit Branch / Shop" : "Add New Branch / Shop"}
        maxWidth="max-w-lg"
      >
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            setSavingBranch(true);
            try {
              if (editBranchId) {
                await updateBranchAction({
                  id: editBranchId,
                  name: bName,
                  code: bCode,
                  type: bType,
                  stateCode: bState,
                  gstin: bGstin || undefined,
                });
                toast.success(`Branch "${bName.trim()}" updated!`);
              } else {
                await createBranchAction({
                  name: bName,
                  code: bCode,
                  type: bType,
                  stateCode: bState,
                  gstin: bGstin || undefined,
                  address: bAddress || undefined,
                  phone: bPhone || undefined,
                });
                toast.success(`Branch "${bName.trim()}" created!`);
              }
              setAddBranchOpen(false);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not save branch.");
            } finally {
              setSavingBranch(false);
            }
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>Shop / Branch Name *</Label>
              <Input
                value={bName}
                onChange={(e) => {
                  const val = e.target.value;
                  setBName(val);
                  if (!editBranchId && !bCode) {
                    const auto = val.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 3);
                    if (auto.length >= 2) setBCode(auto);
                  }
                }}
                placeholder="e.g. Madurai Retail Shop"
                required
              />
            </div>
            <div>
              <Label>Short Code *</Label>
              <Input
                value={bCode}
                onChange={(e) => setBCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4))}
                placeholder="e.g. MDU"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Branch Type</Label>
              <Select value={bType} onChange={(e) => setBType(e.target.value as typeof bType)}>
                <option value="retail">Retail Shop</option>
                <option value="factory">Factory</option>
                <option value="warehouse">Warehouse / Godown</option>
              </Select>
            </div>
            <div>
              <Label>State</Label>
              <Select value={bState} onChange={(e) => setBState(e.target.value)}>
                {Object.entries(INDIAN_STATES).map(([code, stateName]) => (
                  <option key={code} value={code}>
                    {code} — {stateName}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Phone (Optional)</Label>
              <Input value={bPhone} onChange={(e) => setBPhone(e.target.value)} placeholder="e.g. 9876543210" />
            </div>
            <div>
              <Label>GSTIN (Optional)</Label>
              <GstinInput value={bGstin} onChange={setBGstin} onStateDetected={(code) => setBState(code)} />
            </div>
          </div>

          {!editBranchId && (
            <div>
              <Label>Address (Optional)</Label>
              <Input value={bAddress} onChange={(e) => setBAddress(e.target.value)} placeholder="Shop street address" />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 border-t border-[#ececee] pt-3">
            <Button type="button" size="sm" variant="outline" onClick={() => setAddBranchOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={savingBranch}>
              <Plus className="h-3.5 w-3.5" />{" "}
              {savingBranch ? "Saving..." : editBranchId ? "Save Changes" : "Create Branch"}
            </Button>
          </div>
        </Form>
      </Dialog>

      {/* Add Staff Modal */}
      <Dialog
        open={addStaffOpen}
        onClose={() => setAddStaffOpen(false)}
        title="Add New Staff Member"
        maxWidth="max-w-lg"
      >
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            if (sBranchIds.length === 0) {
              toast.error("Assign at least one branch to this staff member.");
              return;
            }
            setSavingStaff(true);
            try {
              await createStaffAction({
                fullName: sName,
                username: sUsername,
                password: sPassword,
                role: sRole,
                phone: sPhone || undefined,
                email: sEmail || undefined,
                branchIds: sBranchIds,
              });
              toast.success(`Staff account "${sName.trim()}" created!`);
              setAddStaffOpen(false);
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not create staff member.");
            } finally {
              setSavingStaff(false);
            }
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Full Name *</Label>
              <Input value={sName} onChange={(e) => setSName(e.target.value)} placeholder="e.g. Karthik Kumar" required />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={sRole} onChange={(e) => setSRole(e.target.value as typeof sRole)}>
                <option value="worker">Counter Staff / Cashier</option>
                <option value="branch_admin">Branch Manager</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Login Username *</Label>
              <Input
                value={sUsername}
                onChange={(e) => setSUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                placeholder="e.g. karthik"
                required
              />
            </div>
            <div>
              <Label>Temporary Password * (min 8 chars)</Label>
              <Input
                type="password"
                value={sPassword}
                onChange={(e) => setSPassword(e.target.value)}
                placeholder="At least 8 characters"
                minLength={8}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Phone (Optional)</Label>
              <Input value={sPhone} onChange={(e) => setSPhone(e.target.value)} placeholder="Mobile number" />
            </div>
            <div>
              <Label>Email (Optional)</Label>
              <Input type="email" value={sEmail} onChange={(e) => setSEmail(e.target.value)} placeholder="staff@shop.in" />
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
            <Label className="mb-0">Assign to Branch(es) *</Label>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {branches.map((b) => {
                const selected = sBranchIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() =>
                      setSBranchIds((prev) =>
                        selected ? prev.filter((id) => id !== b.id) : [...prev, b.id]
                      )
                    }
                    className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                      selected
                        ? "border-[#171717] bg-[#171717] text-white"
                        : "border-[#e5e5e7] bg-white text-[#52525b] hover:border-[#171717]"
                    }`}
                  >
                    {selected ? "✓ " : "+ "}
                    {b.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#ececee] pt-3">
            <Button type="button" size="sm" variant="outline" onClick={() => setAddStaffOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={savingStaff}>
              <UserPlus className="h-3.5 w-3.5" /> {savingStaff ? "Creating..." : "Create Staff"}
            </Button>
          </div>
        </Form>
      </Dialog>

      {/* Edit Staff Modal */}
      <Dialog
        open={Boolean(editStaffTarget)}
        onClose={() => setEditStaffTarget(null)}
        title="Edit Staff Account"
        maxWidth="max-w-md"
      >
        {editStaffTarget && (
          <Form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await updateStaffAction({
                  id: editStaffTarget.id,
                  fullName: editStaffTarget.full_name,
                  email: editStaffTarget.email || undefined,
                  role: editStaffTarget.role,
                });
                toast.success("Staff updated.");
                setEditStaffTarget(null);
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not update staff.");
              }
            }}
            className="space-y-3"
          >
            <div>
              <Label>Full Name</Label>
              <Input
                value={editStaffTarget.full_name}
                onChange={(e) => setEditStaffTarget({ ...editStaffTarget, full_name: e.target.value })}
                required
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={editStaffTarget.email}
                onChange={(e) => setEditStaffTarget({ ...editStaffTarget, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={editStaffTarget.role}
                onChange={(e) =>
                  setEditStaffTarget({ ...editStaffTarget, role: e.target.value as "branch_admin" | "worker" })
                }
              >
                <option value="worker">Counter Staff / Cashier</option>
                <option value="branch_admin">Branch Manager</option>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditStaffTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Save Changes
              </Button>
            </div>
          </Form>
        )}
      </Dialog>

      {/* Reset Staff Password Modal */}
      <Dialog
        open={Boolean(resetTarget)}
        onClose={() => setResetTarget(null)}
        title={`Reset Password — ${resetTarget?.name ?? ""}`}
        maxWidth="max-w-md"
      >
        {resetTarget && (
          <Form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await resetStaffPasswordAction(resetTarget.id, resetPw);
                toast.success("Password reset! Staff will be asked to choose a new password on next login.");
                setResetTarget(null);
                setResetPw("");
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not reset password.");
              }
            }}
            className="space-y-3"
          >
            <div>
              <Label>New Temporary Password (min 8 chars)</Label>
              <Input
                type="text"
                minLength={8}
                value={resetPw}
                onChange={(e) => setResetPw(e.target.value)}
                required
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setResetTarget(null)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Reset Password
              </Button>
            </div>
          </Form>
        )}
      </Dialog>
    </div>
  );
}
