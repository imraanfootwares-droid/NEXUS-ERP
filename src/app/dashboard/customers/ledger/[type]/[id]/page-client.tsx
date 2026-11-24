"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Settings,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  deleteManualPartyLedgerEntryAction,
  savePartyLedgerEntryAction,
} from "@/actions/party-ledger";
import { Badge, Button, Card, CardContent, Dialog, Input, Label } from "@/components/ui/primitives";
import { StatTray } from "@/components/ui/spark";
import type {
  LedgerItemLine,
  PartyLedgerRow,
  PartyLedgerStatement,
} from "@/lib/ledger/party-ledger";
import type { LedgerConfig } from "@/types/database";

function toLocalDatetimeInput(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PartyLedgerClient({
  tenantName,
  statement,
  ledgerConfig,
  canEdit,
}: {
  tenantName: string;
  statement: PartyLedgerStatement;
  ledgerConfig: LedgerConfig;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { party, rows, totalDebit, totalCredit, closingBalance } = statement;
  const activeItemCols = ledgerConfig.item_columns.filter((c) => c.enabled);
  const activeHeaderFields = ledgerConfig.header_fields.filter((f) => f.enabled);

  // Edit / Add dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editRow, setEditRow] = useState<{
    entryId: string | null;
    sourceType: "invoice" | "purchase" | "payment" | "manual";
    sourceId: string | null;
    entryDate: string;
    voucherNo: string;
    particulars: string;
    debit: number;
    credit: number;
    extraFields: Record<string, string>;
    items: LedgerItemLine[];
  } | null>(null);

  const openEdit = (r: PartyLedgerRow) => {
    setEditRow({
      entryId: r.entryId,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      entryDate: toLocalDatetimeInput(r.entryDate),
      voucherNo: r.voucherNo,
      particulars: r.particulars,
      debit: r.debit,
      credit: r.credit,
      extraFields: { ...r.extraFields },
      items: r.items.map((it) => ({ ...it })),
    });
    setEditOpen(true);
  };

  const openAddManual = () => {
    setEditRow({
      entryId: null,
      sourceType: "manual",
      sourceId: null,
      entryDate: toLocalDatetimeInput(new Date().toISOString()),
      voucherNo: party.type === "supplier" ? "R1" : "ADJ",
      particulars: "",
      debit: 0,
      credit: 0,
      extraFields: {},
      items: [],
    });
    setEditOpen(true);
  };

  const addBlankItem = () => {
    if (!editRow) return;
    setEditRow({
      ...editRow,
      items: [...editRow.items, { item: "", amount: 0 }],
    });
  };

  const updateItemCell = (idx: number, key: string, val: string) => {
    if (!editRow) return;
    const next = editRow.items.map((it, i) => {
      if (i !== idx) return it;
      if (key === "amount") return { ...it, amount: Number(val || 0) };
      const updated: LedgerItemLine = { ...it, [key]: val };
      // Auto-calculate amount if pair & rate are numeric and user is editing pair/rate
      if (key === "pair" || key === "rate" || key === "disc_pct") {
        const pairNum = Number(updated.pair || 0);
        const rateNum = Number(updated.rate || 0);
        const discNum = Number(updated.disc_pct || 0);
        if (pairNum > 0 && rateNum > 0) {
          updated.amount = Number((pairNum * rateNum * (1 - discNum / 100)).toFixed(2));
        }
      }
      return updated;
    });
    setEditRow({ ...editRow, items: next });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editRow) return;
    setSaving(true);
    try {
      await savePartyLedgerEntryAction({
        partyType: party.type,
        partyId: party.id,
        entryId: editRow.entryId,
        sourceType: editRow.sourceType,
        sourceId: editRow.sourceId,
        entryDate: editRow.entryDate ? new Date(editRow.entryDate).toISOString() : new Date().toISOString(),
        voucherNo: editRow.voucherNo,
        particulars: editRow.particulars,
        debit: editRow.debit,
        credit: editRow.credit,
        extraFields: editRow.extraFields,
        items: editRow.items.filter((it) => it.item.trim().length > 0),
      });
      toast.success("Ledger entry saved.");
      setEditOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save ledger entry.");
    } finally {
      setSaving(false);
    }
  };

  const exportBase = `/api/exports/party-ledger/${party.type}/${party.id}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <div>
            <Link
              href={`/dashboard/customers?tab=${party.type === "supplier" ? "suppliers" : "customers"}`}
              className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-[#27272a] shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#fafafa] hover:text-[#171717]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to {party.type === "supplier" ? "Supplier" : "Customer"} Ledger
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <h1>{party.name}</h1>
            <Badge variant={party.type === "supplier" ? "warning" : "info"}>
              {party.type === "supplier" ? "Supplier Statement" : "Customer Statement"}
            </Badge>
          </div>
          <p className="text-xs text-[#77777d]">
            {tenantName}
            {party.phone ? ` • ${party.phone}` : ""}
            {party.gstin ? ` • GSTIN: ${party.gstin}` : ""}
            {party.address ? ` • ${party.address}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`${exportBase}?format=pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800"
          >
            <FileText className="h-3.5 w-3.5" /> Export PDF
          </a>
          <a
            href={`${exportBase}?format=xlsx`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </a>
          <a
            href={`${exportBase}?format=csv`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </a>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
            title="Customize Ledger Fields"
          >
            <Settings className="h-3.5 w-3.5" /> Fields
          </Link>
          {canEdit && (
            <Button size="sm" onClick={openAddManual}>
              <Plus className="h-3.5 w-3.5" /> Add Entry
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTray label="Entries" value={rows.length} unit="Records" footnote="Bills, payments & adjustments" />
        <StatTray
          label="Total Debit"
          value={`₹${totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          unit="Dr"
          footnote={party.type === "supplier" ? "Total goods purchased" : "Total bills raised"}
        />
        <StatTray
          label="Total Credit"
          value={`₹${totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          unit="Cr"
          footnote={party.type === "supplier" ? "Total payments given" : "Payments & returns"}
        />
        <StatTray
          label="Closing Balance"
          value={`₹${Math.abs(closingBalance).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          unit={closingBalance >= 0 ? "Dr" : "Cr"}
          footnote="Running statement balance"
        />
      </div>

      {/* Proper Dashboard Table with Shaded Item Breakdown Enclosures */}
      <div className="ui-tray">
        <div className="ui-surface overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-left text-xs">
            <thead className="border-b border-[#ececee]">
              <tr className="font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-[#77777d]">
                <th className="px-4 py-2.5">Date &amp; Time</th>
                <th className="px-4 py-2.5">Ch./Voc</th>
                <th className="px-4 py-2.5">Particulars</th>
                <th className="px-4 py-2.5 text-right">Debit (₹)</th>
                <th className="px-4 py-2.5 text-right">Credit (₹)</th>
                <th className="px-4 py-2.5 text-right">Balance (₹)</th>
                <th className="px-4 py-2.5">Built By</th>
                {canEdit && <th className="px-4 py-2.5 text-right">Actions</th>}
              </tr>
            </thead>
            {rows.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-4 py-10 text-center text-[#77777d]">
                    No ledger entries yet. Record a bill, payment, or click &ldquo;+ Add Entry&rdquo; above.
                  </td>
                </tr>
              </tbody>
            ) : (
              rows.map((r) => {
                const extraPairs = activeHeaderFields
                  .map((f) => ({ label: f.label, val: r.extraFields[f.key] }))
                  .filter((x) => x.val && x.val.trim().length > 0);
                const hasItems = r.items.length > 0;
                const isPayment = r.credit > 0 && r.debit === 0;

                return (
                  <tbody key={r.key} className="border-b border-[#ececee] last:border-b-0">
                    <tr className={hasItems ? "bg-white" : "bg-white hover:bg-[#fafafa]"}>
                      <td
                        className={`whitespace-nowrap px-4 py-3 font-mono text-[11px] text-[#77777d] ${
                          hasItems ? "border-l-[3px] border-l-[#171717]" : ""
                        }`}
                        suppressHydrationWarning
                      >
                        {new Date(r.entryDate).toLocaleString("en-IN", {
                          timeZone: "Asia/Kolkata",
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-[11.5px] font-semibold text-[#171717]">
                        {r.voucherNo || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-semibold text-[#171717]">{r.particulars}</span>
                          {hasItems && (
                            <span className="rounded-full bg-[#f1f1f2] px-2 py-0.5 text-[10px] font-semibold text-[#55555b]">
                              {r.items.length} {r.items.length === 1 ? "item" : "items"}
                            </span>
                          )}
                          {isPayment && (
                            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                              Payment
                            </span>
                          )}
                        </div>
                        {extraPairs.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {extraPairs.map((ep) => (
                              <span
                                key={ep.label}
                                className="rounded bg-[#f4f4f5] px-1.5 py-0.5 text-[10.5px] text-[#55555b]"
                              >
                                <strong className="text-[#27272a]">{ep.label}:</strong> {ep.val}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-[#171717]">
                        {r.debit > 0
                          ? r.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-semibold text-emerald-700">
                        {r.credit > 0
                          ? r.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold text-[#171717]">
                        {Math.abs(r.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] font-semibold text-[#77777d]">
                          {r.balance >= 0 ? "Dr" : "Cr"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-[11px] text-[#55555b]">
                        {r.actorName ? (
                          <div>
                            <span className="font-medium text-[#171717]">{r.actorName}</span>
                            {r.actorLogin && (
                              <div className="text-[10px] text-[#77777d]">@{r.actorLogin}</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[#a3a3a8]">—</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="whitespace-nowrap px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              className="cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
                              title="Edit entry & item details"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {r.sourceType === "manual" && r.entryId && (
                              <button
                                type="button"
                                onClick={async () => {
                                  if (!confirm("Delete this manual ledger entry?")) return;
                                  await deleteManualPartyLedgerEntryAction(party.type, party.id, r.entryId!);
                                  toast.success("Manual entry deleted.");
                                  router.refresh();
                                }}
                                className="cursor-pointer rounded-lg border border-rose-200 bg-white p-1.5 text-rose-600 hover:bg-rose-50"
                                title="Delete manual entry"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>

                    {hasItems && (
                      <tr className="bg-white">
                        <td
                          colSpan={canEdit ? 8 : 7}
                          className="border-l-[3px] border-l-[#171717] px-4 pb-3.5 pt-0"
                        >
                          <div className="rounded-[12px] bg-[#f1f1f2] p-[3px]">
                            <div className="flex items-center justify-between px-3 py-1.5">
                              <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-[#55555b]">
                                Items in {r.voucherNo || r.particulars}
                              </span>
                              <span className="font-mono text-[10px] text-[#77777d]">
                                {r.items.length} {r.items.length === 1 ? "line item" : "line items"}
                              </span>
                            </div>
                            <div className="ui-surface overflow-x-auto">
                              <table className="w-full min-w-[600px] border-collapse text-[11px]">
                                <thead>
                                  <tr className="border-b border-[#ececee] text-left font-mono text-[10px] uppercase tracking-[0.04em] text-[#77777d]">
                                    <th className="px-3 py-2 font-medium">Item</th>
                                    {activeItemCols.map((c) => (
                                      <th key={c.key} className="px-2.5 py-2 text-right font-medium">
                                        {c.label}
                                      </th>
                                    ))}
                                    <th className="px-3 py-2 text-right font-medium">Amount (₹)</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-[#f1f1f2]">
                                  {r.items.map((it, idx) => (
                                    <tr key={idx}>
                                      <td className="px-3 py-2 font-medium text-[#171717]">{it.item}</td>
                                      {activeItemCols.map((c) => (
                                        <td key={c.key} className="px-2.5 py-2 text-right font-mono text-[#55555b]">
                                          {it[c.key] ?? "—"}
                                        </td>
                                      ))}
                                      <td className="px-3 py-2 text-right font-mono font-semibold text-[#171717]">
                                        {Number(it.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })
            )}
            {rows.length > 0 && (
              <tfoot className="border-t-2 border-[#e4e4e7] bg-[#fafafa]">
                <tr className="font-semibold text-[#171717]">
                  <td colSpan={3} className="px-4 py-3 text-right font-mono text-[11px] uppercase tracking-[0.05em] text-[#55555b]">
                    Total / Closing Balance
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold">
                    ₹{totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold text-emerald-700">
                    ₹{totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-right font-mono font-bold">
                    ₹{Math.abs(closingBalance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}{" "}
                    <span className="text-[10.5px] text-[#77777d]">
                      {closingBalance >= 0 ? "Dr" : "Cr"}
                    </span>
                  </td>
                  <td colSpan={canEdit ? 2 : 1} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <Dialog
        open={editOpen && Boolean(editRow)}
        onClose={() => setEditOpen(false)}
        title={editRow?.sourceType === "manual" ? "Manual Ledger Entry" : "Edit Ledger Statement Row"}
        maxWidth="max-w-3xl"
      >
        {editRow && (
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <Label>Date &amp; Time</Label>
                <Input
                  type="datetime-local"
                  value={editRow.entryDate}
                  onChange={(e) => setEditRow({ ...editRow, entryDate: e.target.value })}
                  required
                />
              </div>
              <div>
                <Label>Challan / Voucher No.</Label>
                <Input
                  value={editRow.voucherNo}
                  onChange={(e) => setEditRow({ ...editRow, voucherNo: e.target.value })}
                  placeholder="e.g. 99 or R1"
                />
              </div>
              <div>
                <Label>Particulars</Label>
                <Input
                  value={editRow.particulars}
                  onChange={(e) => setEditRow({ ...editRow, particulars: e.target.value })}
                  placeholder="e.g. By CASH - S.C or TPT details"
                  required
                />
              </div>
            </div>

            {editRow.sourceType === "manual" && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Debit Amount (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editRow.debit}
                    onChange={(e) => setEditRow({ ...editRow, debit: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <Label>Credit Amount (₹)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={editRow.credit}
                    onChange={(e) => setEditRow({ ...editRow, credit: Number(e.target.value) })}
                  />
                </div>
              </div>
            )}

            {activeHeaderFields.length > 0 && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                  Bill / Transport Details
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {activeHeaderFields.map((f) => (
                    <div key={f.key}>
                      <Label>{f.label}</Label>
                      <Input
                        value={editRow.extraFields[f.key] ?? ""}
                        onChange={(e) =>
                          setEditRow({
                            ...editRow,
                            extraFields: { ...editRow.extraFields, [f.key]: e.target.value },
                          })
                        }
                        placeholder={f.label}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-800">Item Breakdown Table</p>
                <Button type="button" size="sm" variant="outline" onClick={addBlankItem}>
                  <Plus className="h-3.5 w-3.5" /> Add Item Row
                </Button>
              </div>
              {editRow.items.length > 0 && (
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {editRow.items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-2 gap-2 rounded-md border border-slate-100 bg-slate-50 p-2 sm:grid-cols-4">
                      <div className="sm:col-span-2">
                        <Label>Item Name</Label>
                        <Input
                          value={it.item}
                          onChange={(e) => updateItemCell(idx, "item", e.target.value)}
                          placeholder="Model / Item"
                        />
                      </div>
                      {activeItemCols.map((c) => (
                        <div key={c.key}>
                          <Label>{c.label}</Label>
                          <Input
                            value={String(it[c.key] ?? "")}
                            onChange={(e) => updateItemCell(idx, c.key, e.target.value)}
                            placeholder={c.label}
                          />
                        </div>
                      ))}
                      <div className="flex items-end gap-1">
                        <div className="flex-1">
                          <Label>Amount (₹)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={it.amount}
                            onChange={(e) => updateItemCell(idx, "amount", e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setEditRow({
                              ...editRow,
                              items: editRow.items.filter((_, i) => i !== idx),
                            })
                          }
                          className="mb-1 rounded-md p-2 text-rose-600 hover:bg-rose-50"
                          title="Remove item"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
