"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Lock, Pencil, Trash2 } from "lucide-react";
import { Paged } from "@/components/ui/pagination";
import { toast } from "sonner";
import {
  closeDayCashAction,
  deleteExpenseAction,
  recordExpenseAction,
  updateExpenseAction,
} from "@/actions/billing";
import { Badge, Button, Card, CardContent, CardHeader, Input, Label, Select, Tabs } from "@/components/ui/primitives";
import type { BranchRow, PaymentMode } from "@/types/database";

export function ReportsAndDayEndClient({
  branches,
  expenses,
  dayCloses,
  canExport,
  canCloseDay,
}: {
  branches: BranchRow[];
  expenses: Array<{ id: string; category: string; amount: string; mode: string; expense_date: string; note: string | null }>;
  dayCloses: Array<{ id: string; close_date: string; expected_cash: string; counted_cash: string; variance_cash: string; upi_total: string; card_total: string }>;
  canExport: boolean;
  canCloseDay: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState("exports");
  const today = new Date().toISOString().slice(0, 10);
  const [from, setFrom] = useState(today.slice(0, 8) + "01");
  const [to, setTo] = useState(today);
  const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");

  const [editExpId, setEditExpId] = useState<string | null>(null);
  const [expBranch, setExpBranch] = useState(branches[0]?.id ?? "");
  const [expCat, setExpCat] = useState("Rent & Electricity");
  const [expAmt, setExpAmt] = useState(0);
  const [expMode, setExpMode] = useState<PaymentMode>("cash");
  const [expNote, setExpNote] = useState("");

  const [closeBranch, setCloseBranch] = useState(branches[0]?.id ?? "");
  const [countedCash, setCountedCash] = useState(0);
  const [closeNote, setCloseNote] = useState("");

  const exportTypes = [
    { id: "sales_register", label: "Sales Register (GSTR-1)" },
    { id: "purchase_register", label: "Purchase Register (ITC / GSTR-3B)" },
    { id: "hsn_summary", label: "HSN Summary Report" },
    { id: "stock_valuation", label: "Stock Valuation (Weighted Avg)" },
    { id: "eway_json", label: "E-Way Bill JSON Export" },
    { id: "irp_json", label: "E-Invoice IRP JSON Export" },
  ];

  return (
    <div className="space-y-4">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "exports", label: "GST & Accounting Exports" },
          { id: "expenses", label: "Expenses" },
          { id: "day_end", label: "Day-End Cash Reconciliation" },
        ]}
      />

      {tab === "exports" && (
        <Card>
          <CardHeader><h3 className="text-sm font-semibold">Select Date Range &amp; Download</h3></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div><Label>From Date</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
              <div><Label>To Date</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <div>
                <Label>Format</Label>
                <Select value={format} onChange={(e) => setFormat(e.target.value as "xlsx" | "csv")}>
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV (.csv)</option>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {exportTypes.map((ex) => (
                <a
                  key={ex.id}
                  href={canExport ? `/api/exports/${ex.id}?from=${from}&to=${to}&format=${format}` : "#"}
                  className={`rounded-[10px] border border-slate-200 p-4 flex items-center justify-between hover:border-sky-400 bg-white ${
                    !canExport ? "opacity-50 pointer-events-none" : ""
                  }`}
                >
                  <span className="text-sm font-semibold text-slate-900">{ex.label}</span>
                  <Download className="h-4 w-4 text-sky-600" />
                </a>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "expenses" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">{editExpId ? "Edit Expense" : "Record Business Expense"}</h3></CardHeader>
            <CardContent>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (editExpId) {
                    await updateExpenseAction({
                      id: editExpId,
                      category: expCat,
                      amount: expAmt,
                      mode: expMode,
                      note: expNote,
                    });
                    toast.success("Expense updated.");
                  } else {
                    await recordExpenseAction({
                      branchId: expBranch,
                      category: expCat,
                      amount: expAmt,
                      mode: expMode,
                      expenseDate: today,
                      note: expNote,
                    });
                    toast.success("Expense recorded.");
                  }
                  setEditExpId(null);
                  setExpAmt(0);
                  setExpNote("");
                  router.refresh();
                }}
                className="space-y-3"
              >
                <div>
                  <Label>Branch</Label>
                  <Select value={expBranch} onChange={(e) => setExpBranch(e.target.value)} disabled={Boolean(editExpId)}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Category</Label><Input value={expCat} onChange={(e) => setExpCat(e.target.value)} required /></div>
                  <div><Label>Amount ₹</Label><Input type="number" min={1} value={expAmt} onChange={(e) => setExpAmt(Number(e.target.value))} required /></div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>Payment Mode</Label>
                    <Select value={expMode} onChange={(e) => setExpMode(e.target.value as PaymentMode)}>
                      <option value="cash">Cash</option>
                      <option value="upi">UPI</option>
                      <option value="card">Card</option>
                      <option value="bank_transfer">Bank Transfer</option>
                    </Select>
                  </div>
                  <div><Label>Note</Label><Input value={expNote} onChange={(e) => setExpNote(e.target.value)} /></div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit">{editExpId ? "Update Expense" : "Save Expense"}</Button>
                  {editExpId && (
                    <Button variant="outline" onClick={() => { setEditExpId(null); setExpAmt(0); setExpNote(""); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Recent Expenses</h3></CardHeader>
            <CardContent className="space-y-2">
              <Paged items={expenses} size={10}>{(pagedRows) => pagedRows.map((ex) => (
                <div key={ex.id} className="flex justify-between items-center gap-2 rounded-[10px] border border-slate-200 p-3 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">{ex.category}</p>
                    <p className="text-slate-500">{ex.expense_date} • {ex.mode.toUpperCase()} {ex.note ? `• ${ex.note}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-rose-600 mr-1">₹{Number(ex.amount).toLocaleString("en-IN")}</span>
                    <button
                      type="button"
                      title="Edit Expense"
                      onClick={() => {
                        setEditExpId(ex.id);
                        setExpCat(ex.category);
                        setExpAmt(Number(ex.amount));
                        setExpMode(ex.mode as PaymentMode);
                        setExpNote(ex.note ?? "");
                      }}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="Delete Expense"
                      onClick={async () => {
                        if (!confirm(`Delete expense "${ex.category}"?`)) return;
                        await deleteExpenseAction(ex.id);
                        toast.success("Expense deleted.");
                        router.refresh();
                      }}
                      className="rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}</Paged>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "day_end" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Close Today&apos;s Counter Cash</h3></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Branch</Label>
                <Select value={closeBranch} onChange={(e) => setCloseBranch(e.target.value)}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </Select>
              </div>
              <div><Label>Physical Counted Cash in Drawer ₹</Label><Input type="number" min={0} value={countedCash} onChange={(e) => setCountedCash(Number(e.target.value))} /></div>
              <div><Label>Note</Label><Input value={closeNote} onChange={(e) => setCloseNote(e.target.value)} /></div>
              <Button
                disabled={!canCloseDay}
                onClick={async () => {
                  try {
                    await closeDayCashAction({ branchId: closeBranch, closeDate: today, countedCash, note: closeNote });
                    toast.success("Day-End Close locked.");
                    router.refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Already closed or failed");
                  }
                }}
              >
                <Lock className="h-4 w-4" /> Lock Day-End Close ({today})
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Day-End Close History</h3></CardHeader>
            <CardContent className="space-y-2">
              <Paged items={dayCloses} size={10}>{(pagedRows) => pagedRows.map((dc) => (
                <div key={dc.id} className="rounded-lg border border-slate-200 p-3 text-xs space-y-1">
                  <div className="flex justify-between font-bold">
                    <span>{dc.close_date}</span>
                    <Badge variant={Number(dc.variance_cash) === 0 ? "success" : "warning"}>
                      Variance: ₹{Number(dc.variance_cash).toFixed(2)}
                    </Badge>
                  </div>
                  <p className="text-slate-600">
                    Expected Cash: ₹{Number(dc.expected_cash).toFixed(2)} • Counted: ₹{Number(dc.counted_cash).toFixed(2)} • UPI: ₹{Number(dc.upi_total).toFixed(2)}
                  </p>
                </div>
              ))}</Paged>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
