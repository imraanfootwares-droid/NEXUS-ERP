"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check } from "lucide-react";
import { toast } from "sonner";
import {
  platformCreateBranchAction,
  platformCreatePersonAction,
  platformDeleteBranchAction,
  platformResetPersonPasswordAction,
  platformTogglePersonActiveAction,
  platformUpdateBranchAction,
  platformUpdatePersonAction,
  setPersonTierAction,
} from "@/actions/platform-org";
import { Select } from "@/components/ui/primitives";
import { OrgTreeView } from "@/components/org/org-tree-view";
import type { ActivityItem, OrgFlow, OrgNode } from "@/components/org/org-tree-layout";
import { TIER_ORDER, effectiveUserTier, tierRank } from "@/lib/auth/access";
import { INDIAN_STATES, type TierKey } from "@/lib/constants/saas";
import type { BranchRow, TenantRow } from "@/types/database";

interface ProfileSummary {
  id: string;
  tenant_id: string | null;
  role: "owner" | "branch_admin" | "worker";
  full_name: string;
  username: string | null;
  email: string | null;
  is_active: boolean;
  tier_override?: TierKey | null;
}

interface ResetSummary {
  id: string;
  tenant_id: string | null;
  user_id: string;
  identifier_submitted: string;
  note: string | null;
  created_at: string;
  full_name: string | null;
}

interface AuditSummary {
  id: string;
  tenant_id: string | null;
  action: string;
  entity_type: string | null;
  created_at: string;
}

type SheetMode =
  | { kind: "inspect"; node: OrgNode }
  | { kind: "add-branch"; tenantId: string; tenantName: string }
  | { kind: "add-person"; tenantId: string; tenantName: string; defaultBranchId?: string }
  | null;

export function OrganisationVisualEditorClient({
  tenants,
  branches,
  profiles,
  profileBranches,
  resets,
  audits,
  embedded = false,
}: {
  tenants: TenantRow[];
  branches: BranchRow[];
  profiles: ProfileSummary[];
  profileBranches: Array<{ user_id: string; branch_id: string }>;
  resets: ResetSummary[];
  audits: AuditSummary[];
  embedded?: boolean;
}) {
  const router = useRouter();
  const [groupBy, setGroupBy] = useState<"branches" | "people">("branches");
  const [sheet, setSheet] = useState<SheetMode>(null);
  const [busy, setBusy] = useState(false);

  // Branch form state
  const [bName, setBName] = useState("");
  const [bCode, setBCode] = useState("");
  const [bType, setBType] = useState<"retail" | "factory" | "warehouse">("retail");
  const [bState, setBState] = useState("27");
  const [bGstin, setBGstin] = useState("");

  // Person form state
  const [pName, setPName] = useState("");
  const [pUsername, setPUsername] = useState("");
  const [pEmail, setPEmail] = useState("");
  const [pRole, setPRole] = useState<"branch_admin" | "worker">("worker");
  const [pBranchId, setPBranchId] = useState("");
  const [pPassword, setPPassword] = useState("");
  const [pBranchIds, setPBranchIds] = useState<string[]>([]);

  const { root, flows, activity } = useMemo(() => {
    const branchMap = new Map<string, string>();
    for (const pb of profileBranches) {
      if (!branchMap.has(pb.user_id)) {
        branchMap.set(pb.user_id, pb.branch_id);
      }
    }

    const resetUserIds = new Set(resets.map((r) => r.user_id));

    const tenantNodes: OrgNode[] = tenants.map((t) => {
      const tBranches = branches.filter((b) => b.tenant_id === t.id);
      const tPeople = profiles.filter((p) => p.tenant_id === t.id);
      const tResets = resets.filter((r) => r.tenant_id === t.id);

      const personNode = (p: ProfileSummary): OrgNode => {
        const warnings: string[] = [];
        if (!p.is_active) warnings.push("Account disabled");
        if (resetUserIds.has(p.id)) warnings.push("Password reset requested");
        return {
          id: `person:${p.id}`,
          kind: "person",
          label: p.full_name,
          sublabel: p.role.replace("_", " "),
          role: p.role,
          tenantId: t.id,
          branchId: branchMap.get(p.id) ?? tBranches[0]?.id,
          personId: p.id,
          isActive: p.is_active,
          meta: {
            email: p.email,
            username: p.username,
            tier: effectiveUserTier(t.tier, p.tier_override),
          },
          counts: {
            branches: 0,
            retail: 0,
            factory: 0,
            warehouse: 0,
            people: 1,
            admins: p.role === "worker" ? 0 : 1,
            workers: p.role === "worker" ? 1 : 0,
            pendingResets: resetUserIds.has(p.id) ? 1 : 0,
          },
          warnings,
          managers: [],
          children: [],
        };
      };

      let children: OrgNode[] = [];
      if (groupBy === "branches") {
        const branchNodes: OrgNode[] = tBranches.map((b) => {
          const assigned = tPeople.filter(
            (p) => (branchMap.get(p.id) ?? tBranches[0]?.id) === b.id
          );
          const bResets = assigned.filter((p) => resetUserIds.has(p.id)).length;
          const warnings: string[] = [];
          if (bResets > 0) warnings.push(`${bResets} pending password reset`);
          if (assigned.length === 0) warnings.push("No staff assigned");
          return {
            id: `branch:${b.id}`,
            kind: "branch",
            label: b.name,
            sublabel: `${b.type} · ${b.code}`,
            branchType: b.type,
            tenantId: t.id,
            branchId: b.id,
            isDefault: b.is_default,
            meta: {
              code: b.code,
              stateCode: b.state_code,
              gstin: b.gstin,
            },
            counts: {
              branches: 1,
              retail: b.type === "retail" ? 1 : 0,
              factory: b.type === "factory" ? 1 : 0,
              warehouse: b.type === "warehouse" ? 1 : 0,
              people: assigned.length,
              admins: assigned.filter((p) => p.role !== "worker").length,
              workers: assigned.filter((p) => p.role === "worker").length,
              pendingResets: bResets,
            },
            warnings,
            managers: assigned.map((p) => ({
              id: p.id,
              name: p.full_name,
              role: p.role.replace("_", " "),
            })),
            children: assigned.map(personNode),
          };
        });
        children = branchNodes;
      } else {
        children = tPeople.map(personNode);
      }

      const tWarnings: string[] = [];
      if (t.status === "suspended") tWarnings.push("Workspace suspended");
      if (tResets.length > 0) tWarnings.push(`${tResets.length} password reset(s)`);

      return {
        id: `tenant:${t.id}`,
        kind: "tenant",
        label: t.name,
        sublabel: `${t.tier.replace("_", " ").toUpperCase()} · ${t.slug}`,
        tenantId: t.id,
        meta: {
          tier: t.tier,
          status: t.status,
        },
        counts: {
          branches: tBranches.length,
          retail: tBranches.filter((b) => b.type === "retail").length,
          factory: tBranches.filter((b) => b.type === "factory").length,
          warehouse: tBranches.filter((b) => b.type === "warehouse").length,
          people: tPeople.length,
          admins: tPeople.filter((p) => p.role !== "worker").length,
          workers: tPeople.filter((p) => p.role === "worker").length,
          pendingResets: tResets.length,
        },
        warnings: tWarnings,
        managers: tPeople
          .filter((p) => p.role !== "worker")
          .map((p) => ({ id: p.id, name: p.full_name, role: p.role.replace("_", " ") })),
        children,
      };
    });

    const rootNode: OrgNode = {
      id: "root",
      kind: "root",
      label: "Nexus ERP Platform",
      sublabel: "Superadmin Control",
      counts: {
        branches: branches.length,
        retail: branches.filter((b) => b.type === "retail").length,
        factory: branches.filter((b) => b.type === "factory").length,
        warehouse: branches.filter((b) => b.type === "warehouse").length,
        people: profiles.length,
        admins: profiles.filter((p) => p.role !== "worker").length,
        workers: profiles.filter((p) => p.role === "worker").length,
        pendingResets: resets.length,
      },
      warnings: resets.length ? [`${resets.length} pending reset(s)`] : [],
      managers: tenants.map((t) => ({ id: t.id, name: t.name, role: t.tier })),
      children: tenantNodes,
    };

    const flowList: OrgFlow[] = resets.map((r) => {
      const bid = branchMap.get(r.user_id);
      const fromPath = [
        `person:${r.user_id}`,
        ...(bid ? [`branch:${bid}`] : []),
        ...(r.tenant_id ? [`tenant:${r.tenant_id}`] : []),
        "root",
      ];
      return {
        id: `reset:${r.id}`,
        kind: "password_reset",
        label: r.note || `Identifier: ${r.identifier_submitted}`,
        targetName: r.full_name || r.identifier_submitted,
        at: r.created_at,
        fromPath,
        toPath: ["root"],
        direction: "up",
      };
    });

    const activityList: ActivityItem[] = audits.map((a) => ({
      id: a.id,
      at: a.created_at,
      who: a.entity_type || "platform",
      text: a.action.replace(/\./g, " "),
      tone: a.action.includes("suspend") ? "bad" : a.action.includes("create") ? "good" : "info",
      nodePath: a.tenant_id ? [`tenant:${a.tenant_id}`, "root"] : ["root"],
    }));

    return { root: rootNode, flows: flowList, activity: activityList };
  }, [tenants, branches, profiles, profileBranches, resets, audits, groupBy]);

  const openInspector = (node: OrgNode) => {
    if (node.kind === "branch") {
      setBName(node.label);
      setBCode(node.meta?.code ?? "");
      setBType(node.branchType ?? "retail");
      setBState(node.meta?.stateCode ?? "27");
      setBGstin(node.meta?.gstin ?? "");
    } else if (node.kind === "person") {
      setPName(node.label);
      setPUsername(node.meta?.username ?? "");
      setPEmail(node.meta?.email ?? "");
      setPRole(node.role === "branch_admin" ? "branch_admin" : "worker");
      setPBranchId(node.branchId ?? "");
      const assigned = profileBranches.filter((x) => x.user_id === node.personId).map((x) => x.branch_id);
      setPBranchIds(assigned.length > 0 ? assigned : node.branchId ? [node.branchId] : []);
      setPPassword("");
    }
    setSheet({ kind: "inspect", node });
  };

  const openAddBranch = (tenantId: string, tenantName: string) => {
    setBName("");
    setBCode("");
    setBType("retail");
    setBState("27");
    setBGstin("");
    setSheet({ kind: "add-branch", tenantId, tenantName });
  };

  const openAddPerson = (tenantId: string, tenantName: string, defaultBranchId?: string) => {
    const tBranches = branches.filter((b) => b.tenant_id === tenantId);
    setPName("");
    setPUsername("");
    setPEmail("");
    setPRole("worker");
    setPBranchId(defaultBranchId || tBranches[0]?.id || "");
    setPPassword("");
    setSheet({ kind: "add-person", tenantId, tenantName, defaultBranchId });
  };

  const selectedId = sheet?.kind === "inspect" ? sheet.node.id : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          {embedded ? <h2 className="text-[15px] font-semibold text-[#171717]">Organisation</h2> : <h1>Organisation</h1>}
          <p className="mt-0.5 text-[12.5px] text-[#77777d]">
            Click any card to edit it. Use the + button to see what is inside.
          </p>
        </div>
        {tenants[0] ? (
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => openAddBranch(tenants[0].id, tenants[0].name)}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-white px-2.5 text-xs font-medium text-[#27272a] shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.08)] hover:bg-[#fafafa] transition-colors cursor-pointer"
            >
              + Add Branch
            </button>
            <button
              type="button"
              onClick={() => openAddPerson(tenants[0].id, tenants[0].name)}
              className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#171717] px-2.5 text-xs font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,.25),inset_0_1px_0_rgba(255,255,255,.12)] hover:bg-[#2a2a2a] transition-colors cursor-pointer"
            >
              + Add Person
            </button>
          </div>
        ) : null}
      </div>

      <div className="ui-tray">
        <OrgTreeView
          root={root}
          flows={flows}
          activity={activity}
          onSelect={openInspector}
          selectedId={selectedId}
          resetKey={groupBy}
          emptyRequests="Nothing is waiting for anyone. All clear."
          toolbarExtra={
            <div className="ot-seg" role="group" aria-label="Group by">
              <button
                type="button"
                aria-pressed={groupBy === "branches"}
                onClick={() => setGroupBy("branches")}
              >
                By Branch
              </button>
              <button
                type="button"
                aria-pressed={groupBy === "people"}
                onClick={() => setGroupBy("people")}
              >
                By People
              </button>
            </div>
          }
        />
      </div>

      {/* Slide-over Visual Editor Sheet (.dr-sheet from MEELII) */}
      {sheet ? (
        <div
          className="dr-sheet-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheet(null);
          }}
        >
          <div className="dr-sheet" role="dialog" aria-modal="true">
            {sheet.kind === "add-branch" ? (
              <>
                <span className="dr-chip dr-chip--super">New Branch</span>
                <h2 style={{ marginTop: 8 }}>{sheet.tenantName}</h2>
                <p className="dr-hint" style={{ marginBottom: 16 }}>
                  Add a new retail shop, factory, or warehouse to this business.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await platformCreateBranchAction({
                        tenantId: sheet.tenantId,
                        name: bName,
                        code: bCode,
                        type: bType,
                        stateCode: bState,
                        gstin: bGstin,
                      });
                      toast.success("Branch created.");
                      setSheet(null);
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to create branch.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="dr-field">
                    <label>Branch Name</label>
                    <input
                      value={bName}
                      onChange={(e) => setBName(e.target.value)}
                      placeholder="e.g. Mumbai Flagship"
                      required
                    />
                  </div>
                  <div className="dr-field">
                    <label>Code (max 4 chars)</label>
                    <input
                      maxLength={4}
                      value={bCode}
                      onChange={(e) => setBCode(e.target.value.toUpperCase())}
                      placeholder="MUM"
                      required
                    />
                  </div>
                  <div className="dr-field">
                    <label>Type</label>
                    <Select
                      value={bType}
                      onChange={(e) => setBType(e.target.value as typeof bType)}
                    >
                      <option value="retail">Retail Shop</option>
                      <option value="factory">Factory</option>
                      <option value="warehouse">Warehouse</option>
                    </Select>
                  </div>
                  <div className="dr-field">
                    <label>State</label>
                    <Select value={bState} onChange={(e) => setBState(e.target.value)}>
                      {Object.entries(INDIAN_STATES).map(([c, n]) => (
                        <option key={c} value={c}>
                          {c} — {n}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="dr-field">
                    <label>GSTIN (optional)</label>
                    <input
                      value={bGstin}
                      onChange={(e) => setBGstin(e.target.value.toUpperCase())}
                      placeholder="27AABCU9603R1ZM"
                    />
                  </div>
                  <div className="dr-sheet-actions">
                    <button type="button" className="ot-btn" onClick={() => setSheet(null)}>
                      Cancel
                    </button>
                    <button type="submit" disabled={busy} className="ot-btn ot-btn--accent">
                      {busy ? "Saving…" : "Create Branch"}
                    </button>
                  </div>
                </form>
              </>
            ) : sheet.kind === "add-person" ? (
              <>
                <span className="dr-chip dr-chip--super">New Person</span>
                <h2 style={{ marginTop: 8 }}>{sheet.tenantName}</h2>
                <p className="dr-hint" style={{ marginBottom: 16 }}>
                  Add a branch manager or counter/stock worker and assign them to a branch.
                </p>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await platformCreatePersonAction({
                        tenantId: sheet.tenantId,
                        fullName: pName,
                        username: pUsername,
                        email: pEmail || undefined,
                        role: pRole,
                        password: pPassword,
                        branchId: pBranchId || undefined,
                      });
                      toast.success("Person added.");
                      setSheet(null);
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to add person.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="dr-field">
                    <label>Full Name</label>
                    <input
                      value={pName}
                      onChange={(e) => setPName(e.target.value)}
                      placeholder="e.g. Arjun Kumar"
                      required
                    />
                  </div>
                  <div className="dr-field">
                    <label>Username</label>
                    <input
                      value={pUsername}
                      onChange={(e) => setPUsername(e.target.value)}
                      placeholder="e.g. arjun_chn"
                      required
                    />
                  </div>
                  <div className="dr-field">
                    <label>Role</label>
                    <Select
                      value={pRole}
                      onChange={(e) => setPRole(e.target.value as "branch_admin" | "worker")}
                    >
                      <option value="worker">Worker (Counter / Stock)</option>
                      <option value="branch_admin">Branch Admin</option>
                    </Select>
                  </div>
                  <div className="dr-field">
                    <label>Assigned Branch</label>
                    <Select value={pBranchId} onChange={(e) => setPBranchId(e.target.value)}>
                      {branches
                        .filter((b) => b.tenant_id === sheet.tenantId)
                        .map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name} ({b.code})
                          </option>
                        ))}
                    </Select>
                  </div>
                  <div className="dr-field">
                    <label>Email (optional)</label>
                    <input
                      type="email"
                      value={pEmail}
                      onChange={(e) => setPEmail(e.target.value)}
                    />
                  </div>
                  <div className="dr-field">
                    <label>Temporary Password (min 8 chars)</label>
                    <input
                      type="text"
                      minLength={8}
                      value={pPassword}
                      onChange={(e) => setPPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="dr-sheet-actions">
                    <button type="button" className="ot-btn" onClick={() => setSheet(null)}>
                      Cancel
                    </button>
                    <button type="submit" disabled={busy} className="ot-btn ot-btn--accent">
                      {busy ? "Creating…" : "Create Person"}
                    </button>
                  </div>
                </form>
              </>
            ) : sheet.node.kind === "root" ? (
              <>
                <span className="dr-chip dr-chip--super">Platform Root</span>
                <h2 style={{ marginTop: 8 }}>{sheet.node.label}</h2>
                <p className="dr-hint" style={{ marginBottom: 16 }}>
                  {sheet.node.counts.branches} total branches · {sheet.node.counts.people} people ·{" "}
                  {sheet.node.counts.pendingResets} pending resets
                </p>
                <div className="dr-sheet-actions">
                  <button type="button" className="ot-btn" onClick={() => setSheet(null)}>
                    Close
                  </button>
                </div>
              </>
            ) : sheet.node.kind === "tenant" ? (
              <>
                <span className="dr-chip dr-chip--super">
                  Business · {sheet.node.meta?.tier?.replace("_", " ").toUpperCase()}
                </span>
                <h2 style={{ marginTop: 8 }}>{sheet.node.label}</h2>
                <p className="dr-hint" style={{ marginBottom: 16 }}>
                  {sheet.node.counts.branches} branches · {sheet.node.counts.people} people
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                  <button
                    type="button"
                    className="ot-btn ot-btn--accent"
                    onClick={() =>
                      openAddBranch(sheet.node.tenantId!, sheet.node.label)
                    }
                  >
                    + Add Branch
                  </button>
                  <button
                    type="button"
                    className="ot-btn ot-btn--accent"
                    onClick={() =>
                      openAddPerson(sheet.node.tenantId!, sheet.node.label)
                    }
                  >
                    + Add Person
                  </button>
                  <Link
                    href={`/platform/tenants/${sheet.node.tenantId}`}
                    className="ot-btn"
                    style={{ textDecoration: "none" }}
                  >
                    Open Tenant Studio →
                  </Link>
                </div>
                <div className="dr-sheet-actions">
                  <button type="button" className="ot-btn" onClick={() => setSheet(null)}>
                    Close
                  </button>
                </div>
              </>
            ) : sheet.node.kind === "branch" ? (
              <>
                <span className="dr-chip dr-chip--super">
                  Branch {sheet.node.isDefault ? "· Default" : ""}
                </span>
                <h2 style={{ marginTop: 8 }}>{sheet.node.label}</h2>
                <p className="dr-hint" style={{ marginBottom: 16 }}>
                  Edit branch details or add people to this location.
                </p>

                <div style={{ marginBottom: 16 }}>
                  <button
                    type="button"
                    className="ot-btn ot-btn--accent"
                    onClick={() => {
                      const t = tenants.find((x) => x.id === sheet.node.tenantId);
                      openAddPerson(
                        sheet.node.tenantId!,
                        t?.name || "Business",
                        sheet.node.branchId
                      );
                    }}
                  >
                    + Add Person to this Branch
                  </button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await platformUpdateBranchAction({
                        id: sheet.node.branchId!,
                        name: bName,
                        code: bCode,
                        type: bType,
                        stateCode: bState,
                        gstin: bGstin,
                      });
                      toast.success("Branch updated.");
                      setSheet(null);
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to update branch.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="dr-field">
                    <label>Branch Name</label>
                    <input value={bName} onChange={(e) => setBName(e.target.value)} required />
                  </div>
                  <div className="dr-field">
                    <label>Code</label>
                    <input
                      maxLength={4}
                      value={bCode}
                      onChange={(e) => setBCode(e.target.value.toUpperCase())}
                      required
                    />
                  </div>
                  <div className="dr-field">
                    <label>Type</label>
                    <Select
                      value={bType}
                      onChange={(e) => setBType(e.target.value as typeof bType)}
                    >
                      <option value="retail">Retail Shop</option>
                      <option value="factory">Factory</option>
                      <option value="warehouse">Warehouse</option>
                    </Select>
                  </div>
                  <div className="dr-field">
                    <label>State</label>
                    <Select value={bState} onChange={(e) => setBState(e.target.value)}>
                      {Object.entries(INDIAN_STATES).map(([c, n]) => (
                        <option key={c} value={c}>
                          {c} — {n}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="dr-field">
                    <label>GSTIN</label>
                    <input
                      value={bGstin}
                      onChange={(e) => setBGstin(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="dr-sheet-actions">
                    {!sheet.node.isDefault ? (
                      <button
                        type="button"
                        className="ot-btn ot-btn--danger"
                        onClick={async () => {
                          if (!confirm(`Delete branch "${sheet.node.label}"?`)) return;
                          setBusy(true);
                          try {
                            await platformDeleteBranchAction(sheet.node.branchId!);
                            toast.success("Branch deleted.");
                            setSheet(null);
                            router.refresh();
                          } catch (err) {
                            toast.error(
                              err instanceof Error ? err.message : "Could not delete branch."
                            );
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Delete Branch
                      </button>
                    ) : null}
                    <button type="button" className="ot-btn" onClick={() => setSheet(null)}>
                      Cancel
                    </button>
                    <button type="submit" disabled={busy} className="ot-btn ot-btn--accent">
                      {busy ? "Saving…" : "Save Branch"}
                    </button>
                  </div>
                </form>
              </>
            ) : (
              <>
                <span className="dr-chip dr-chip--super">
                  Person · {sheet.node.role?.replace("_", " ")}
                </span>
                <h2 style={{ marginTop: 8 }}>{sheet.node.label}</h2>
                <p className="dr-hint" style={{ marginBottom: 16 }}>
                  Username: {sheet.node.meta?.username ?? "—"} ·{" "}
                  {sheet.node.isActive === false ? "Disabled" : "Active"}
                </p>

                {sheet.node.role === "owner" ? (
                  <p className="dr-hint" style={{ marginBottom: 16 }}>
                    Workspace Owner account. Use password reset below if needed.
                  </p>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setBusy(true);
                      try {
                        await platformUpdatePersonAction({
                          tenantId: sheet.node.tenantId!,
                          userId: sheet.node.personId!,
                          fullName: pName,
                          email: pEmail || undefined,
                          role: pRole,
                          branchIds: pBranchIds,
                        });
                        toast.success("Person updated.");
                        setSheet(null);
                        router.refresh();
                      } catch (err) {
                        toast.error(
                          err instanceof Error ? err.message : "Failed to update person."
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <div className="dr-field">
                      <label>Full Name</label>
                      <input value={pName} onChange={(e) => setPName(e.target.value)} required />
                    </div>
                    <div className="dr-field">
                      <label>Email</label>
                      <input
                        type="email"
                        value={pEmail}
                        onChange={(e) => setPEmail(e.target.value)}
                      />
                    </div>
                    <div className="dr-field">
                      <label>Role</label>
                      <Select
                        value={pRole}
                        onChange={(e) => setPRole(e.target.value as "branch_admin" | "worker")}
                      >
                        <option value="worker">Worker (Counter / Stock)</option>
                        <option value="branch_admin">Branch Admin</option>
                      </Select>
                    </div>
                    <div className="dr-field">
                      <label>Assigned Branches</label>
                      <div className="grid gap-1">
                        {branches
                          .filter((b) => b.tenant_id === sheet.node.tenantId)
                          .map((b) => {
                            const on = pBranchIds.includes(b.id);
                            return (
                              <button
                                key={b.id}
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                onClick={() =>
                                  setPBranchIds((cur) => (on ? cur.filter((x) => x !== b.id) : [...cur, b.id]))
                                }
                                className={`flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-left text-[12.5px] transition-all duration-150 active:scale-[0.99] ${
                                  on
                                    ? "bg-[#171717] text-white"
                                    : "bg-white text-[#3f3f46] shadow-[0_0_0_1px_rgba(0,0,0,.09)] hover:bg-[#fafafa]"
                                }`}
                              >
                                <span>{b.name} ({b.code})</span>
                                {on ? <Check className="ui-menu-check h-3.5 w-3.5" strokeWidth={2.6} /> : null}
                              </button>
                            );
                          })}
                      </div>
                      <p className="dr-hint">People can switch between their assigned branches.</p>
                    </div>
                    <div className="dr-sheet-actions">
                      <button
                        type="button"
                        className={`ot-btn ${sheet.node.isActive ? "ot-btn--danger" : ""}`}
                        style={sheet.node.isActive ? undefined : { marginRight: "auto" }}
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await platformTogglePersonActiveAction(
                              sheet.node.personId!,
                              !sheet.node.isActive
                            );
                            toast.success(
                              sheet.node.isActive ? "Account disabled." : "Account enabled."
                            );
                            setSheet(null);
                            router.refresh();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed.");
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        {sheet.node.isActive ? "Disable Account" : "Enable Account"}
                      </button>
                      <button type="submit" disabled={busy} className="ot-btn ot-btn--accent">
                        {busy ? "Saving…" : "Save Person"}
                      </button>
                    </div>
                  </form>
                )}

                {(() => {
                  const planTier = tenants.find((x) => x.id === sheet.node.tenantId)?.tier;
                  if (!planTier) return null;
                  return (
                    <>
                      <hr />
                      <div className="dr-field">
                        <label htmlFor="person-tier">Access Tier</label>
                        <Select
                          id="person-tier"
                          disabled={busy}
                          value={(sheet.node.meta?.tier as TierKey | undefined) ?? planTier}
                          onChange={async (e) => {
                            setBusy(true);
                            try {
                              await setPersonTierAction(sheet.node.personId!, e.target.value as TierKey);
                              toast.success("Access tier updated.");
                              setSheet(null);
                              router.refresh();
                            } catch (err) {
                              toast.error(err instanceof Error ? err.message : "Could not change tier.");
                            } finally {
                              setBusy(false);
                            }
                          }}
                        >
                          {TIER_ORDER.filter((x) => tierRank(x) <= tierRank(planTier)).map((x) => (
                            <option key={x} value={x}>
                              {x.replace("tier_", "Tier ")}
                              {x === planTier ? " (business plan)" : ""}
                            </option>
                          ))}
                        </Select>
                        <p className="dr-hint">Limits this person&apos;s modules. It cannot exceed the business plan.</p>
                      </div>
                    </>
                  );
                })()}

                <hr />
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    try {
                      await platformResetPersonPasswordAction(sheet.node.personId!, pPassword);
                      toast.success("Temporary password set.");
                      setPPassword("");
                      setSheet(null);
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Failed to reset password.");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <div className="dr-field">
                    <label>Set Temporary Password (min 8 chars)</label>
                    <input
                      type="text"
                      minLength={8}
                      value={pPassword}
                      onChange={(e) => setPPassword(e.target.value)}
                      placeholder="New temporary password"
                      required
                    />
                  </div>
                  <div className="dr-sheet-actions">
                    <button type="button" className="ot-btn" onClick={() => setSheet(null)}>
                      Close
                    </button>
                    <button type="submit" disabled={busy} className="ot-btn ot-btn--accent">
                      Reset Password
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
