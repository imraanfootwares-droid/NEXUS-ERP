"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, LockKeyholeOpen } from "lucide-react";
import { Paged } from "@/components/ui/pagination";
import { toast } from "sonner";
import { setAccessBlockAction } from "@/actions/access-control";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Form, Button, Dialog, Input, Label, Textarea } from "@/components/ui/primitives";
import { Segmented, StatTray, StatusPill, TrayCard } from "@/components/ui/spark";

interface BlockFields {
  access_blocked?: boolean;
  access_block_message?: string | null;
  access_block_amount?: number | null;
  access_block_contact?: string | null;
  access_blocked_at?: string | null;
}

export interface AccessTenant extends BlockFields {
  id: string;
  name: string;
  slug: string;
  tier: string;
}

export interface AccessPerson extends BlockFields {
  id: string;
  tenant_id: string | null;
  full_name: string;
  username: string | null;
  role: "owner" | "branch_admin" | "worker";
}

export interface AccessHistoryRow {
  id: string;
  tenant_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id?: string | null;
  metadata?: { amount_due?: number | null; message?: string | null } | null;
  created_at: string;
}

interface Target extends BlockFields {
  kind: "business" | "user";
  id: string;
  name: string;
  context: string;
}

const VIEWS = ["Businesses", "People"] as const;
const ROLE: Record<AccessPerson["role"], string> = { owner: "Owner", branch_admin: "Branch Admin", worker: "Staff" };
const DEFAULT_MESSAGE = "Your payment is overdue. Please pay the pending bill to continue using the platform.";
const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export function AccessControlClient({
  tenants,
  people,
  history,
}: {
  tenants: AccessTenant[];
  people: AccessPerson[];
  history: AccessHistoryRow[];
}) {
  const router = useRouter();
  const [view, setView] = useState<(typeof VIEWS)[number]>("Businesses");
  const [target, setTarget] = useState<Target | null>(null);
  const [mode, setMode] = useState<"block" | "unblock">("block");
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [amount, setAmount] = useState("");
  const [contact, setContact] = useState("");
  const [busy, setBusy] = useState(false);

  const tenantById = useMemo(() => new Map(tenants.map((t) => [t.id, t])), [tenants]);
  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const blockedBusinesses = tenants.filter((t) => t.access_blocked).length;
  const blockedPeople = people.filter((p) => p.access_blocked).length;
  const affected = people.filter((p) => p.access_blocked || (p.tenant_id && tenantById.get(p.tenant_id)?.access_blocked)).length;
  const totalDue = [...tenants, ...people].reduce((sum, r) => sum + (r.access_blocked ? Number(r.access_block_amount ?? 0) : 0), 0);

  const open = (next: Target) => {
    setTarget(next);
    setMode(next.access_blocked ? "unblock" : "block");
    setMessage(next.access_block_message || DEFAULT_MESSAGE);
    setAmount(next.access_block_amount ? String(next.access_block_amount) : "");
    setContact(next.access_block_contact || "");
  };

  const submit = async (blocked: boolean) => {
    if (!target) return;
    const amountDue = amount.trim() === "" ? null : Number(amount);
    if (blocked && amountDue !== null && (!Number.isFinite(amountDue) || amountDue < 0)) {
      toast.error("Enter a valid amount.");
      return;
    }
    setBusy(true);
    try {
      await setAccessBlockAction({ target: target.kind, id: target.id, blocked, message, amountDue, contact });
      toast.success(blocked ? `${target.name} is blocked.` : `${target.name} is unblocked.`);
      setTarget(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update access.");
    } finally {
      setBusy(false);
    }
  };

  const actionButton = (row: Target) => (
    <Button
      size="sm"
      variant={row.access_blocked ? "outline" : "danger"}
      aria-label={`${row.access_blocked ? "Manage block for" : "Block"} ${row.name}`}
      onClick={() => open(row)}
    >
      {row.access_blocked ? <LockKeyholeOpen className="h-3.5 w-3.5" /> : <LockKeyhole className="h-3.5 w-3.5" />}
      {row.access_blocked ? "Manage" : "Block"}
    </Button>
  );

  const dueCell = (r: BlockFields) => (
    <span className="font-mono tabular-nums">{r.access_blocked && r.access_block_amount ? inr(Number(r.access_block_amount)) : "—"}</span>
  );
  const sinceCell = (r: BlockFields) => (
    <span className="font-mono text-[11px] text-[#77777d]" suppressHydrationWarning>
      {r.access_blocked && r.access_blocked_at
        ? new Date(r.access_blocked_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })
        : "—"}
    </span>
  );

  const businessColumns: ColumnDef<AccessTenant>[] = [
    {
      key: "name",
      header: "Business",
      mobilePrimary: true,
      sortValue: (t) => t.name.toLowerCase(),
      render: (t) => (
        <span className="block leading-tight">
          <span className="block font-medium text-[#171717]">{t.name}</span>
          <span className="block font-mono text-[10.5px] text-[#a3a3a8]">/{t.slug}</span>
        </span>
      ),
    },
    { key: "plan", header: "Plan", render: (t) => <span className="font-mono text-[#55555b]">{t.tier.replace("tier_", "Tier ")}</span> },
    { key: "people", header: "People", render: (t) => <span className="font-mono">{people.filter((p) => p.tenant_id === t.id).length}</span> },
    {
      key: "status",
      header: "Access",
      sortValue: (t) => (t.access_blocked ? 0 : 1),
      render: (t) => <StatusPill tone={t.access_blocked ? "danger" : "success"}>{t.access_blocked ? "Blocked" : "Active"}</StatusPill>,
    },
    { key: "due", header: "Amount Due", render: dueCell },
    { key: "since", header: "Blocked On", render: sinceCell },
    {
      key: "action",
      header: "Action",
      hideOnMobile: true,
      render: (t) => actionButton({ ...t, kind: "business", context: "Everyone in this business" }),
    },
  ];

  const personColumns: ColumnDef<AccessPerson>[] = [
    {
      key: "name",
      header: "Person",
      mobilePrimary: true,
      sortValue: (p) => p.full_name.toLowerCase(),
      render: (p) => (
        <span className="block leading-tight">
          <span className="block font-medium text-[#171717]">{p.full_name}</span>
          <span className="block font-mono text-[10.5px] text-[#a3a3a8]">{p.username ?? "no username"}</span>
        </span>
      ),
    },
    { key: "business", header: "Business", render: (p) => (p.tenant_id ? tenantById.get(p.tenant_id)?.name ?? "—" : "—") },
    { key: "role", header: "Role", sortValue: (p) => p.role, render: (p) => ROLE[p.role] },
    {
      key: "status",
      header: "Access",
      sortValue: (p) => (p.access_blocked ? 0 : 1),
      render: (p) =>
        p.access_blocked ? (
          <StatusPill tone="danger">Blocked</StatusPill>
        ) : p.tenant_id && tenantById.get(p.tenant_id)?.access_blocked ? (
          <StatusPill tone="warning">Business blocked</StatusPill>
        ) : (
          <StatusPill tone="success">Active</StatusPill>
        ),
    },
    { key: "due", header: "Amount Due", render: dueCell },
    { key: "since", header: "Blocked On", render: sinceCell },
    {
      key: "action",
      header: "Action",
      hideOnMobile: true,
      render: (p) =>
        actionButton({
          ...p,
          kind: "user",
          name: p.full_name,
          context: `${ROLE[p.role]} at ${p.tenant_id ? tenantById.get(p.tenant_id)?.name ?? "business" : "business"}`,
        }),
    },
  ];

  const historyName = (h: AccessHistoryRow) =>
    h.entity_type === "profile"
      ? personById.get(h.entity_id ?? "")?.full_name ?? "Deleted person"
      : tenantById.get(h.entity_id ?? h.tenant_id ?? "")?.name ?? "Deleted business";

  return (
    <div className="space-y-3.5">
      <div>
        <h1>Access Control</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">Block or unblock a business or person for unpaid bills. Their data is never deleted.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTray label="Blocked Businesses" value={blockedBusinesses} unit={`of ${tenants.length}`} footnote="Whole workspace paused" />
        <StatTray label="Blocked People" value={blockedPeople} unit={`of ${people.length}`} footnote="Individually blocked" />
        <StatTray label="People Affected" value={affected} unit="Users" footnote="Currently cannot work" />
        <StatTray label="Pending Amount" value={inr(totalDue)} footnote="Across active blocks" />
      </div>

      <div className="flex justify-start">
        <Segmented label="Choose list" options={VIEWS} value={view} onChange={setView} />
      </div>

      {view === "Businesses" ? (
        <DataTable
          key="businesses"
          data={tenants}
          columns={businessColumns}
          rowKey={(t) => t.id}
          pageSize={12}
          searchPlaceholder="Search businesses..."
          searchFilter={(t, q) => [t.name, t.slug].some((v) => v.toLowerCase().includes(q))}
          emptyMessage="No businesses found."
        />
      ) : (
        <DataTable
          key="people"
          data={people}
          columns={personColumns}
          rowKey={(p) => p.id}
          pageSize={12}
          searchPlaceholder="Search people..."
          searchFilter={(p, q) =>
            [p.full_name, p.username ?? "", p.tenant_id ? tenantById.get(p.tenant_id)?.name ?? "" : ""].some((v) => v.toLowerCase().includes(q))
          }
          emptyMessage="No people found."
        />
      )}

      <TrayCard title="Block History" bodyClassName="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-[#ececee]">
            <tr>
              <th className="px-4 py-2.5">Action</th>
              <th className="px-4 py-2.5">For</th>
              <th className="px-4 py-2.5">Amount</th>
              <th className="px-4 py-2.5 text-right">When</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f1f2]">
            {history.length === 0 ? (
              <tr><td colSpan={4} className="py-8 text-center text-[#77777d]">No blocks yet.</td></tr>
            ) : (
              <Paged items={history} size={8}>{(pagedRows) => pagedRows.map((h) => {
                const isBlock = h.action === "platform.access_blocked";
                return (
                  <tr key={h.id}>
                    <td className="px-4 py-2.5"><StatusPill tone={isBlock ? "danger" : "success"}>{isBlock ? "Blocked" : "Unblocked"}</StatusPill></td>
                    <td className="px-4 py-2.5 font-medium text-[#171717]">{historyName(h)}</td>
                    <td className="px-4 py-2.5 font-mono">{h.metadata?.amount_due ? inr(Number(h.metadata.amount_due)) : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-[11px] text-[#77777d]" suppressHydrationWarning>
                      {new Date(h.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })}
                    </td>
                  </tr>
                );
              })}</Paged>
            )}
          </tbody>
        </table>
      </TrayCard>

      <Dialog
        open={Boolean(target)}
        onClose={() => !busy && setTarget(null)}
        title={target?.access_blocked ? (mode === "unblock" ? `Unblock ${target.name}?` : `Edit block for ${target.name}`) : `Block ${target?.name ?? ""}?`}
        subtitle={target?.context}
      >
        {target ? (
          mode === "unblock" ? (
            <div className="space-y-4">
              <p className="text-[13px] text-[#55555b]">
                {target.kind === "business" ? "Everyone in this business" : "This person"} can work again on their next check, usually within a minute. Bills held offline will sync automatically.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" disabled={busy} onClick={() => setMode("block")}>Edit Block</Button>
                <Button className="flex-1" disabled={busy} onClick={() => submit(false)}>
                  <LockKeyholeOpen className="h-4 w-4" /> {busy ? "Saving..." : "Unblock Now"}
                </Button>
              </div>
            </div>
          ) : (
            <Form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(true);
              }}
            >
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="block-amount">Amount Due (₹)</Label>
                  <Input id="block-amount" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label htmlFor="block-contact">Pay / Contact</Label>
                  <Input id="block-contact" maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Phone or email" />
                </div>
              </div>
              <div>
                <Label htmlFor="block-message">Message They Will See</Label>
                <Textarea id="block-message" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} required />
              </div>
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">
                {target.kind === "business" ? "Everyone in this business" : "This person"} will see a red payment screen and cannot work until unblocked. No data is deleted.
              </p>
              <Button type="submit" variant="danger" className="w-full" disabled={busy}>
                <LockKeyhole className="h-4 w-4" /> {busy ? "Saving..." : target.access_blocked ? "Save Block" : "Block Access"}
              </Button>
            </Form>
          )
        ) : null}
      </Dialog>
    </div>
  );
}
