"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, Loader2, MessageCircle, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { collectCustomerDueAction } from "@/actions/billing";
import {
  createCustomerAction,
  deleteCustomerAction,
  getCustomerHistoryAction,
  updateCustomerAction,
} from "@/actions/inventory";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { GstinInput } from "@/components/ui/dynamic-fields";
import { Badge, Button, Dialog, Input, Label, Select } from "@/components/ui/primitives";
import type { CustomerRow, PaymentMode } from "@/types/database";

type CustomerWithStats = CustomerRow & { total_spent: string; oldest_due_days: number };

function normalizeIndiaPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11) return digits;
  return null;
}

export function CustomersClient({
  customers,
  canManage,
  tenantName,
}: {
  customers: CustomerWithStats[];
  canManage: boolean;
  tenantName: string;
}) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [gstin, setGstin] = useState("");
  const [stateCode, setStateCode] = useState("33");
  const [custType, setCustType] = useState<"retail" | "wholesale">("retail");
  const [discPct, setDiscPct] = useState(0);
  const [creditLimit, setCreditLimit] = useState(0);

  const openCreateCustomer = () => {
    setEditingId(null);
    setName(""); setPhone(""); setGstin(""); setStateCode("33");
    setCustType("retail"); setDiscPct(0); setCreditLimit(0);
    setAddOpen(true);
  };

  const openEditCustomer = (c: CustomerWithStats) => {
    setEditingId(c.id);
    setName(c.name);
    setPhone(c.phone ?? "");
    setGstin(c.gstin ?? "");
    setStateCode(c.state_code ?? "33");
    setCustType(c.customer_type);
    setDiscPct(Number(c.default_discount_pct ?? 0));
    setCreditLimit(Number(c.credit_limit ?? 0));
    setAddOpen(true);
  };

  const [payTarget, setPayTarget] = useState<CustomerWithStats | null>(null);
  const [payAmt, setPayAmt] = useState(0);
  const [payMode, setPayMode] = useState<PaymentMode>("upi");

  const [histTarget, setHistTarget] = useState<CustomerWithStats | null>(null);
  const [histLoading, setHistLoading] = useState(false);
  const [histRows, setHistRows] = useState<
    Array<{ id: string; invoice_number: string | null; invoice_type: string; grand_total: string; paid_amount: string; due_amount: string; status: string; created_at: string }>
  >([]);

  const openHistory = async (c: CustomerWithStats) => {
    setHistTarget(c);
    setHistLoading(true);
    try {
      const rows = await getCustomerHistoryAction(c.id);
      setHistRows(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load history");
      setHistTarget(null);
    } finally {
      setHistLoading(false);
    }
  };

  const columns: ColumnDef<CustomerWithStats>[] = [
    {
      key: "name",
      header: "Customer / Party",
      mobilePrimary: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <span className="font-bold text-slate-900">{r.name}</span>
          <Badge variant={r.customer_type === "wholesale" ? "info" : "default"} className="ml-2">
            {r.customer_type}
          </Badge>
          <div className="text-[11px] text-slate-500">
            {r.phone || "No phone"} {r.gstin ? `• GSTIN: ${r.gstin}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "spent",
      header: "Total Purchases",
      sortValue: (r) => Number(r.total_spent),
      render: (r) => <span>₹{Number(r.total_spent).toLocaleString("en-IN")}</span>,
    },
    {
      key: "due",
      header: "Outstanding Due",
      sortValue: (r) => Number(r.current_due),
      render: (r) => {
        const due = Number(r.current_due);
        const credit = Number(r.credit_balance ?? 0);
        const bucket =
          r.oldest_due_days > 60 ? "60+ days" : r.oldest_due_days > 30 ? "31–60 days" : "0–30 days";
        return (
          <div>
            <span className={due > 0 ? "font-bold text-rose-600" : "text-slate-500"}>
              ₹{due.toLocaleString("en-IN")}
            </span>
            {due > 0 && <div className="text-[10px] text-amber-700">Aging: {bucket}</div>}
            {credit > 0 && (
              <div className="text-[10px] font-semibold text-emerald-700">
                Credit Note: ₹{credit.toLocaleString("en-IN")}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => {
        const waPhone = normalizeIndiaPhone(r.phone);
        const due = Number(r.current_due);
        return (
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => openHistory(r)}>
              <History className="h-3.5 w-3.5" /> History
            </Button>
            {due > 0 && canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPayTarget(r);
                  setPayAmt(due);
                }}
              >
                <Wallet className="h-3.5 w-3.5" /> Collect
              </Button>
            )}
            {due > 0 && waPhone && (
              <a
                href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                  `Hello ${r.name}, gentle reminder from ${tenantName}: your pending balance is ₹${due.toLocaleString("en-IN")}. Please share payment update. Thank you!`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Remind
              </a>
            )}
            {canManage && (
              <>
                <button
                  type="button"
                  title="Edit Customer"
                  onClick={() => openEditCustomer(r)}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Delete Customer"
                  onClick={async () => {
                    if (!confirm(`Archive customer "${r.name}"?`)) return;
                    await deleteCustomerAction(r.id);
                    toast.success(`Archived ${r.name}`);
                    router.refresh();
                  }}
                  className="rounded-lg bg-rose-500 p-1.5 text-white hover:bg-rose-600 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-4">
      <DataTable
        data={customers}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search customer name, phone or GSTIN..."
        searchFilter={(r, q) =>
          r.name.toLowerCase().includes(q) ||
          (r.phone ?? "").includes(q) ||
          (r.gstin ?? "").toLowerCase().includes(q)
        }
        actions={
          canManage ? (
            <Button size="sm" onClick={openCreateCustomer}>
              <Plus className="h-4 w-4" /> Add Customer / Dealer
            </Button>
          ) : undefined
        }
      />

      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={editingId ? "Edit Customer / Wholesale Dealer" : "Add Customer / Wholesale Dealer"}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (editingId) {
              await updateCustomerAction({
                id: editingId,
                name,
                phone,
                gstin,
                stateCode,
                customerType: custType,
                defaultDiscountPct: discPct,
                creditLimit,
                creditDays: custType === "wholesale" ? 30 : 0,
              });
              toast.success("Customer updated.");
            } else {
              await createCustomerAction({
                name,
                phone,
                gstin,
                stateCode,
                customerType: custType,
                defaultDiscountPct: discPct,
                creditLimit,
                creditDays: custType === "wholesale" ? 30 : 0,
              });
              toast.success("Customer saved.");
            }
            setEditingId(null);
            setName(""); setPhone(""); setGstin("");
            setAddOpen(false);
            router.refresh();
          }}
          className="space-y-3"
        >
          <div><Label>Name *</Label><Input value={name} onChange={(e) => setName(e.target.value)} required /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div>
              <Label>Type</Label>
              <Select value={custType} onChange={(e) => setCustType(e.target.value as "retail" | "wholesale")}>
                <option value="retail">Retail Customer</option>
                <option value="wholesale">Wholesale / B2B Dealer</option>
              </Select>
            </div>
          </div>
          <div>
            <Label>GSTIN (optional)</Label>
            <GstinInput value={gstin} onChange={setGstin} onStateDetected={setStateCode} />
          </div>
          {custType === "wholesale" && (
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Default Discount %</Label><Input type="number" min={0} max={100} value={discPct} onChange={(e) => setDiscPct(Number(e.target.value))} /></div>
              <div><Label>Credit Limit ₹</Label><Input type="number" min={0} value={creditLimit} onChange={(e) => setCreditLimit(Number(e.target.value))} /></div>
            </div>
          )}
          <Button type="submit" className="w-full">Save Customer</Button>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title={`Collect Due — ${payTarget?.name ?? ""}`}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!payTarget) return;
            await collectCustomerDueAction({ customerId: payTarget.id, amount: payAmt, mode: payMode });
            toast.success("Payment collected.");
            setPayTarget(null);
            router.refresh();
          }}
          className="space-y-3"
        >
          <div><Label>Amount Received ₹</Label><Input type="number" min={1} value={payAmt} onChange={(e) => setPayAmt(Number(e.target.value))} required /></div>
          <div>
            <Label>Payment Mode</Label>
            <Select value={payMode} onChange={(e) => setPayMode(e.target.value as PaymentMode)}>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
            </Select>
          </div>
          <Button type="submit" className="w-full">Record Collection</Button>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(histTarget)}
        onClose={() => setHistTarget(null)}
        title={`Purchase & Return History — ${histTarget?.name ?? ""}`}
        subtitle={histTarget ? `Total Spent: ₹${Number(histTarget.total_spent).toLocaleString("en-IN")} • Due: ₹${Number(histTarget.current_due).toLocaleString("en-IN")}` : ""}
        maxWidth="max-w-xl"
      >
        {histLoading ? (
          <div className="py-8 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading purchase ledger...
          </div>
        ) : histRows.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">No invoices recorded for this customer yet.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {histRows.map((inv) => (
              <div key={inv.id} className="rounded-lg border border-slate-200 p-3 text-xs flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">
                    {inv.invoice_number || "DRAFT"}{" "}
                    {inv.invoice_type === "return_credit_note" && <Badge variant="info">Credit Note</Badge>}
                  </p>
                  <p className="text-slate-500">
                    {new Date(inv.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })} • {inv.status}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className="font-bold">₹{Number(inv.grand_total).toLocaleString("en-IN")}</p>
                    {Number(inv.due_amount) > 0 && (
                      <p className="text-[10px] text-rose-600">Due ₹{Number(inv.due_amount).toLocaleString("en-IN")}</p>
                    )}
                  </div>
                  <Link
                    href={`/dashboard/billing/${inv.id}/print`}
                    className="rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </div>
  );
}
