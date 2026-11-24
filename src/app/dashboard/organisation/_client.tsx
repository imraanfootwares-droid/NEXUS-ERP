"use client";

import React, { useMemo, useState } from "react";
import { Building2, Factory, Store, UserRound, Warehouse } from "lucide-react";
import { OrgTreeView } from "@/components/org/org-tree-view";
import type { OrgNode } from "@/components/org/org-tree-layout";
import { Badge, Dialog } from "@/components/ui/primitives";
import { Segmented, StatTray } from "@/components/ui/spark";
import { effectiveUserTier } from "@/lib/auth/access";
import type { TierKey } from "@/lib/constants/saas";
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
  branches,
  profiles,
  profileBranches,
}: {
  tenant: TenantRow;
  branches: BranchRow[];
  profiles: OrgProfileSummary[];
  profileBranches: Array<{ user_id: string; branch_id: string }>;
}) {
  const [groupBy, setGroupBy] = useState<(typeof GROUP_OPTIONS)[number]>("Branches");
  const [selectedNode, setSelectedNode] = useState<OrgNode | null>(null);

  const retailCount = branches.filter((b) => b.type === "retail").length;
  const factoryCount = branches.filter((b) => b.type === "factory").length;
  const warehouseCount = branches.filter((b) => b.type === "warehouse").length;
  const activePeople = profiles.filter((p) => p.is_active).length;
  const adminCount = profiles.filter((p) => p.role !== "worker").length;
  const workerCount = profiles.filter((p) => p.role === "worker").length;

  const { root } = useMemo(() => {
    const branchMap = new Map<string, string>();
    for (const pb of profileBranches) {
      if (!branchMap.has(pb.user_id)) {
        branchMap.set(pb.user_id, pb.branch_id);
      }
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
        const assigned = profiles.filter(
          (p) => (branchMap.get(p.id) ?? branches[0]?.id) === b.id
        );
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
            pendingResets: 0,
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
    } else {
      children = profiles.map(personNode);
    }

    const tenantRoot: OrgNode = {
      id: `tenant:${tenant.id}`,
      kind: "tenant",
      label: tenant.name,
      sublabel: `${branches.length} ${branches.length === 1 ? "branch" : "branches"} · ${profiles.length} ${profiles.length === 1 ? "person" : "people"}`,
      tenantId: tenant.id,
      meta: {
        tier: tenant.tier,
        status: tenant.status,
      },
      counts: {
        branches: branches.length,
        retail: retailCount,
        factory: factoryCount,
        warehouse: warehouseCount,
        people: profiles.length,
        admins: adminCount,
        workers: workerCount,
        pendingResets: 0,
      },
      warnings: [],
      managers: profiles
        .filter((p) => p.role === "owner")
        .map((p) => ({ id: p.id, name: p.full_name, role: "owner" })),
      children,
    };

    return { root: tenantRoot };
  }, [tenant, branches, profiles, profileBranches, groupBy, retailCount, factoryCount, warehouseCount, adminCount, workerCount]);

  const inspectedBranch =
    selectedNode?.kind === "branch"
      ? branches.find((b) => b.id === selectedNode.branchId) ?? null
      : null;
  const inspectedPerson =
    selectedNode?.kind === "person"
      ? profiles.find((p) => p.id === selectedNode.personId) ?? null
      : null;

  const branchSummaryParts = [
    retailCount > 0 ? `${retailCount} retail` : null,
    factoryCount > 0 ? `${factoryCount} factory` : null,
    warehouseCount > 0 ? `${warehouseCount} warehouse` : null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <div>
        <h1>Organisation Tree</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Visual map of all branches and team members under {tenant.name}.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTray
          label="Branches"
          value={branches.length}
          unit={`of ${tenant.max_branches}`}
          footnote={branchSummaryParts.join(" · ") || "No branches yet"}
        />
        <StatTray
          label="Team Members"
          value={profiles.length}
          unit={`${activePeople} active`}
          footnote={`Limit: ${tenant.max_users} users`}
        />
        <StatTray
          label="Owners & Admins"
          value={adminCount}
          unit="Managers"
          footnote="Owner & branch admin roles"
        />
        <StatTray
          label="Workers"
          value={workerCount}
          unit="Staff"
          footnote="Counter & operations staff"
        />
      </div>

      <OrgTreeView
        root={root}
        flows={[]}
        onSelect={(node) => setSelectedNode(node)}
        selectedId={selectedNode?.id ?? null}
        resetKey={`${tenant.id}:${groupBy}`}
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
                <p className="font-semibold text-slate-900">{branches.length} / {tenant.max_branches}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Total Staff</p>
                <p className="font-semibold text-slate-900">{profiles.length} / {tenant.max_users}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Slug</p>
                <p className="font-mono text-slate-900">{tenant.slug}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">Status</p>
                <p className="capitalize text-slate-900">{tenant.status}</p>
              </div>
            </div>
          </div>
        )}

        {inspectedBranch && (
          <div className="space-y-3 text-xs text-slate-700">
            <div className="flex items-center gap-2">
              {inspectedBranch.type === "factory" ? (
                <Factory className="h-4 w-4 text-slate-500" />
              ) : inspectedBranch.type === "warehouse" ? (
                <Warehouse className="h-4 w-4 text-slate-500" />
              ) : (
                <Store className="h-4 w-4 text-slate-500" />
              )}
              <span className="font-semibold text-slate-900">{inspectedBranch.name}</span>
              <Badge variant="default">{inspectedBranch.type}</Badge>
              {inspectedBranch.is_default && <Badge variant="info">Default</Badge>}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-3">
              <div>
                <p className="text-[11px] text-slate-500">Branch Code</p>
                <p className="font-mono text-slate-900">{inspectedBranch.code}</p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500">State Code</p>
                <p className="font-mono text-slate-900">{inspectedBranch.state_code}</p>
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
    </div>
  );
}
