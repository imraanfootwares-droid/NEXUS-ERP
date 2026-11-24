"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, MessageCircle, Package, Pencil, Plus, Trash2, Wallet, X } from "lucide-react";
import { Paged } from "@/components/ui/pagination";
import { toast } from "sonner";
import { InlineRowsSkeleton } from "@/components/ui/page-skeletons";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { collectCustomerDueAction } from "@/actions/billing";
import { recordPartyMoneyTransactionAction } from "@/actions/party-ledger";
import {
  createCustomerAction,
  createSupplierAction,
  deleteCustomerAction,
  deleteSupplierAction,
  getCustomerHistoryAction,
  getSupplierHistoryAction,
  recordSupplierPaymentAction,
  updateCustomerAction,
  updateSupplierAction,
} from "@/actions/inventory";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { GstinInput } from "@/components/ui/dynamic-fields";
import { Form, Badge, Button, Dialog, Input, Label, Select, Tabs } from "@/components/ui/primitives";
import { StatTray } from "@/components/ui/spark";
import type { CustomerRow, PaymentMode } from "@/types/database";

type CustomerWithStats = CustomerRow & { total_spent: string; oldest_due_days: number };

export interface SupplierLedgerRow {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  state_code: string | null;
  address?: string | null;
  material_type: string | null;
  supplied_products?: string[];
  /** Products in Stock whose Supplier is set to this supplier. */
  linked_products?: string[];
  current_due: string;
  total_purchased: string;
  bill_count: number;
}

function normalizeIndiaPhone(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length >= 11) return digits;
  return null;
}

export function CustomersClient({
  customers,
  suppliers = [],
  catalogProducts = [],
  customersEnabled = true,
  suppliersEnabled = false,
  canManage,
  canManageSuppliers = false,
  initialTab = "customers",
  tenantName,
}: {
  customers: CustomerWithStats[];
  suppliers?: SupplierLedgerRow[];
  catalogProducts?: string[];
  customersEnabled?: boolean;
  suppliersEnabled?: boolean;
  canManage: boolean;
  canManageSuppliers?: boolean;
  initialTab?: "customers" | "suppliers";
  tenantName: string;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Customer modal states
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

  // Supplier right-sidebar states
  const [supModalOpen, setSupModalOpen] = useState(false);
  const [editSupId, setEditSupId] = useState<string | null>(null);
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supGstin, setSupGstin] = useState("");
  const [supStateCode, setSupStateCode] = useState("33");
  const [supAddress, setSupAddress] = useState("");
  const [supMat, setSupMat] = useState("");
  const [supProducts, setSupProducts] = useState<string[]>([]);
  const [supProductInput, setSupProductInput] = useState("");
  const [supSaving, setSupSaving] = useState(false);

  const addSupplierProduct = (raw?: string) => {
    const source = raw ?? supProductInput;
    const parts = source
      .split(/[\n,]+/)
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length === 0) return;
    setSupProducts((prev) => {
      const seen = new Set(prev.map((x) => x.toLowerCase()));
      const next = [...prev];
      for (const item of parts) {
        if (!seen.has(item.toLowerCase())) {
          seen.add(item.toLowerCase());
          next.push(item);
        }
      }
      return next;
    });
    if (raw === undefined) setSupProductInput("");
  };

  const removeSupplierProduct = (index: number) => {
    setSupProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const [supPayTarget, setSupPayTarget] = useState<SupplierLedgerRow | null>(null);
  const [supPayAmt, setSupPayAmt] = useState(0);
  const [supPayMode, setSupPayMode] = useState<PaymentMode>("bank_transfer");
  const [supPayRef, setSupPayRef] = useState("");

  const [supHistTarget, setSupHistTarget] = useState<SupplierLedgerRow | null>(null);
  const [supHistLoading, setSupHistLoading] = useState(false);
  const [supHistRows, setSupHistRows] = useState<
    Array<{ id: string; bill_number: string | null; purchase_type: string; total_amount: string; paid_amount: string; created_at: string }>
  >([]);

  // Unified Add / Deduct Money transaction modal (works for both Customer & Supplier!)
  const [txTarget, setTxTarget] = useState<{
    partyType: "customer" | "supplier";
    id: string;
    name: string;
    currentDue: number;
  } | null>(null);
  const [txDirection, setTxDirection] = useState<"add" | "deduct">("deduct");
  const [txAmount, setTxAmount] = useState("");
  const [txMode, setTxMode] = useState<PaymentMode>("cash");
  const [txVoucher, setTxVoucher] = useState("");
  const [txNote, setTxNote] = useState("");
  const [txSaving, setTxSaving] = useState(false);

  const openMoneyTx = (
    partyType: "customer" | "supplier",
    id: string,
    name: string,
    currentDue: number
  ) => {
    setTxTarget({ partyType, id, name, currentDue });
    setTxDirection(currentDue > 0 ? "deduct" : "add");
    setTxAmount("");
    setTxMode("cash");
    setTxVoucher("");
    setTxNote("");
  };

  const openCreateSupplier = () => {
    setEditSupId(null);
    setSupName("");
    setSupPhone("");
    setSupGstin("");
    setSupStateCode("33");
    setSupAddress("");
    setSupMat("");
    setSupProducts([]);
    setSupProductInput("");
    setSupModalOpen(true);
  };

  const openEditSupplier = (s: SupplierLedgerRow) => {
    setEditSupId(s.id);
    setSupName(s.name);
    setSupPhone(s.phone ?? "");
    setSupGstin(s.gstin ?? "");
    setSupStateCode(s.state_code ?? "33");
    setSupAddress(s.address ?? "");
    setSupMat(s.material_type ?? "");
    setSupProducts(Array.isArray(s.supplied_products) ? [...s.supplied_products] : []);
    setSupProductInput("");
    setSupModalOpen(true);
  };

  const openSupplierHistory = async (s: SupplierLedgerRow) => {
    setSupHistTarget(s);
    setSupHistLoading(true);
    try {
      const rows = await getSupplierHistoryAction(s.id);
      setSupHistRows(rows);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load supplier history");
      setSupHistTarget(null);
    } finally {
      setSupHistLoading(false);
    }
  };

  const customerColumns: ColumnDef<CustomerWithStats>[] = [
    {
      key: "name",
      header: "Customer / Party",
      mobilePrimary: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900">{r.name}</span>
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
            <Link
              href={`/dashboard/customers/ledger/customer/${r.id}`}
              className="inline-flex items-center gap-1 rounded-[10px] border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
            >
              Transactions
            </Link>
            {canManage && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openMoneyTx("customer", r.id, r.name, due)}
              >
                <Wallet className="h-3.5 w-3.5" /> Add / Deduct ₹
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => openHistory(r)}>
              <History className="h-3.5 w-3.5" /> Bills
            </Button>
            {due > 0 && waPhone && (
              <a
                href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                  `Hello ${r.name}, gentle reminder from ${tenantName}: your pending balance is ₹${due.toLocaleString("en-IN")}. Please share payment update. Thank you!`
                )}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-[10px] border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
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
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
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
                  className="cursor-pointer rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50"
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

  const supplierColumns: ColumnDef<SupplierLedgerRow>[] = [
    {
      key: "name",
      header: "Supplier / Vendor",
      mobilePrimary: true,
      sortValue: (s) => s.name,
      render: (s) => {
        const linked = Array.isArray(s.linked_products) ? s.linked_products : [];
        const typed = Array.isArray(s.supplied_products) ? s.supplied_products : [];
        const products = Array.from(new Set([...linked, ...typed]));
        return (
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {canManageSuppliers ? (
                <button
                  type="button"
                  onClick={() => openEditSupplier(s)}
                  className="cursor-pointer text-left font-semibold text-slate-900 hover:text-sky-700 hover:underline"
                >
                  {s.name}
                </button>
              ) : (
                <span className="font-semibold text-slate-900">{s.name}</span>
              )}
              {s.material_type && <Badge variant="default">{s.material_type}</Badge>}
            </div>
            <div className="text-[11px] text-slate-500">
              {s.phone || "No phone"}
              {s.gstin ? ` • GSTIN: ${s.gstin}` : ""}
              {s.address ? ` • ${s.address}` : ""}
            </div>
            {products.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 pt-0.5">
                {products.slice(0, 4).map((p) => (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10.5px] font-medium text-slate-700"
                  >
                    <Package className="h-2.5 w-2.5 text-slate-400" />
                    {p}
                  </span>
                ))}
                {products.length > 4 && (
                  <span className="text-[10.5px] font-medium text-slate-500">
                    +{products.length - 4} more
                  </span>
                )}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: "purchased",
      header: "Total Billed",
      sortValue: (s) => Number(s.total_purchased),
      render: (s) => (
        <div>
          <span>₹{Number(s.total_purchased).toLocaleString("en-IN")}</span>
          <div className="text-[10.5px] text-slate-500">
            {s.bill_count} {s.bill_count === 1 ? "bill" : "bills"}
          </div>
        </div>
      ),
    },
    {
      key: "due",
      header: "Payable Due",
      sortValue: (s) => Number(s.current_due),
      render: (s) => {
        const due = Number(s.current_due);
        return (
          <span className={due > 0 ? "font-bold text-rose-600" : "text-emerald-700 font-medium"}>
            {due > 0 ? `₹${due.toLocaleString("en-IN")}` : "Settled"}
          </span>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      render: (s) => {
        const due = Number(s.current_due);
        return (
          <div className="flex flex-wrap gap-1.5">
            <Link
              href={`/dashboard/customers/ledger/supplier/${s.id}`}
              className="inline-flex items-center gap-1 rounded-[10px] border border-sky-300 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-100"
            >
              Transactions
            </Link>
            {canManageSuppliers && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => openMoneyTx("supplier", s.id, s.name, due)}
              >
                <Wallet className="h-3.5 w-3.5" /> Add / Deduct ₹
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => openSupplierHistory(s)}>
              <History className="h-3.5 w-3.5" /> Bills
            </Button>
            {canManageSuppliers && (
              <>
                <button
                  type="button"
                  title="Edit Supplier"
                  onClick={() => openEditSupplier(s)}
                  className="cursor-pointer rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  title="Delete Supplier"
                  onClick={async () => {
                    if (!confirm(`Delete supplier "${s.name}"?`)) return;
                    try {
                      await deleteSupplierAction(s.id);
                      toast.success(`Deleted ${s.name}`);
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not delete supplier.");
                    }
                  }}
                  className="cursor-pointer rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50"
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

  const totalCustomerReceivable = customers.reduce((s, c) => s + Number(c.current_due || 0), 0);
  const totalSupplierPayable = suppliers.reduce((s, sup) => s + Number(sup.current_due || 0), 0);
  const totalSupplierPurchased = suppliers.reduce((s, sup) => s + Number(sup.total_purchased || 0), 0);

  return (
    <div className="space-y-4">
      <Tabs
        active={activeTab}
        onChange={setActiveTab}
        tabs={[
          { id: "customers", label: "Customer Ledger", badge: customers.length },
          { id: "suppliers", label: "Supplier Ledger", badge: suppliers.length },
        ]}
      />

      {activeTab === "customers" ? (
        !customersEnabled ? (
          <TierLockOverlay featureKey="customer_crm" />
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
              <StatTray label="Customers" value={customers.length} unit="Active" footnote="Retail & wholesale dealers" />
              <StatTray
                label="Receivable Due"
                value={`₹${totalCustomerReceivable.toLocaleString("en-IN")}`}
                unit="Pending"
                footnote="To be collected from customers"
              />
              <StatTray
                label="With Dues"
                value={customers.filter((c) => Number(c.current_due) > 0).length}
                unit="Accounts"
                footnote="Active credit balances"
              />
            </div>

            <DataTable
              data={customers}
              columns={customerColumns}
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
          </div>
        )
      ) : !suppliersEnabled ? (
        <TierLockOverlay featureKey="supplier_and_production" />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <StatTray label="Suppliers" value={suppliers.length} unit="Vendors" footnote="Raw material & finished goods" />
            <StatTray
              label="Total Payable"
              value={`₹${totalSupplierPayable.toLocaleString("en-IN")}`}
              unit="Due"
              footnote="Outstanding balance to suppliers"
            />
            <StatTray
              label="Total Purchased"
              value={`₹${totalSupplierPurchased.toLocaleString("en-IN")}`}
              unit="Billed"
              footnote="Cumulative purchase orders"
            />
          </div>

          <DataTable
            data={suppliers}
            columns={supplierColumns}
            rowKey={(s) => s.id}
            searchPlaceholder="Search supplier name, product, phone, material or GSTIN..."
            searchFilter={(s, q) =>
              s.name.toLowerCase().includes(q) ||
              (s.phone ?? "").includes(q) ||
              (s.material_type ?? "").toLowerCase().includes(q) ||
              (s.gstin ?? "").toLowerCase().includes(q) ||
              (s.address ?? "").toLowerCase().includes(q) ||
              (s.supplied_products ?? []).some((p) => p.toLowerCase().includes(q))
            }
            emptyMessage="No suppliers added yet."
            actions={
              canManageSuppliers ? (
                <div className="flex items-center gap-2">
                  <Link
                    href="/dashboard/operations"
                    className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    Record Purchase →
                  </Link>
                  <Button size="sm" onClick={openCreateSupplier}>
                    <Plus className="h-4 w-4" /> Add Supplier
                  </Button>
                </div>
              ) : undefined
            }
          />
        </div>
      )}

      {/* Customer Dialogs */}
      <Dialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={editingId ? "Edit Customer / Wholesale Dealer" : "Add Customer / Wholesale Dealer"}
      >
        <Form
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
        </Form>
      </Dialog>

      <Dialog
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title={`Collect Due — ${payTarget?.name ?? ""}`}
      >
        <Form
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
        </Form>
      </Dialog>

      <Dialog
        open={Boolean(histTarget)}
        onClose={() => setHistTarget(null)}
        title={`Purchase & Return History — ${histTarget?.name ?? ""}`}
        subtitle={histTarget ? `Total Spent: ₹${Number(histTarget.total_spent).toLocaleString("en-IN")} • Due: ₹${Number(histTarget.current_due).toLocaleString("en-IN")}` : ""}
        maxWidth="max-w-xl"
      >
        {histLoading ? (
          <InlineRowsSkeleton label="Loading customer ledger" />
        ) : histRows.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">No invoices recorded for this customer yet.</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            <Paged items={histRows} size={8}>{(pagedRows) => pagedRows.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs">
                <div>
                  <p className="font-semibold text-slate-900">
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
            ))}</Paged>
          </div>
        )}
      </Dialog>

      {/* Supplier Right-Side Sidebar Drawer */}
      {supModalOpen && typeof document !== "undefined" && (() => {
        const addedLower = new Set(supProducts.map((p) => p.toLowerCase()));
        const query = supProductInput.trim().toLowerCase();
        const suggestions = catalogProducts
          .filter((p) => !addedLower.has(p.toLowerCase()))
          .filter((p) => (!query ? true : p.toLowerCase().includes(query)))
          .slice(0, 8);

        return createPortal(
          <div
            className="spark-ui fixed inset-0 z-[9998] flex justify-end bg-black/35 backdrop-blur-[2px]"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget && !supSaving) setSupModalOpen(false);
            }}
          >
            <aside className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    {editSupId ? "Edit Supplier" : "Add New Supplier"}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Only Supplier Name is required — phone, materials, products &amp; GSTIN are optional.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSupModalOpen(false)}
                  aria-label="Close supplier sidebar"
                  className="cursor-pointer rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Form Body */}
              <Form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!supName.trim()) {
                    toast.error("Supplier Name is required.");
                    return;
                  }
                  setSupSaving(true);
                  try {
                    // Include any typed product that wasn't clicked with "+ Add" yet
                    const pendingParts = supProductInput
                      .split(/[\n,]+/)
                      .map((p) => p.trim())
                      .filter(Boolean);
                    const finalProducts = Array.from(
                      new Set([...supProducts, ...pendingParts])
                    );

                    if (editSupId) {
                      await updateSupplierAction({
                        id: editSupId,
                        name: supName,
                        phone: supPhone || undefined,
                        gstin: supGstin || undefined,
                        stateCode: supStateCode || undefined,
                        address: supAddress || undefined,
                        materialType: supMat || undefined,
                        suppliedProducts: finalProducts,
                      });
                      toast.success("Supplier updated.");
                    } else {
                      await createSupplierAction({
                        name: supName,
                        phone: supPhone || undefined,
                        gstin: supGstin || undefined,
                        stateCode: supStateCode || undefined,
                        address: supAddress || undefined,
                        materialType: supMat || undefined,
                        suppliedProducts: finalProducts,
                      });
                      toast.success("Supplier added.");
                    }
                    setSupModalOpen(false);
                    setEditSupId(null);
                    setSupProductInput("");
                    router.refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not save supplier.");
                  } finally {
                    setSupSaving(false);
                  }
                }}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
                  {/* Required Name */}
                  <div>
                    <Label>Supplier Name *</Label>
                    <Input
                      value={supName}
                      onChange={(e) => setSupName(e.target.value)}
                      placeholder="e.g. Agra Leather & Soles Co."
                      autoFocus
                      required
                    />
                  </div>

                  {/* Phone & Material (Optional) */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Phone (Optional)</Label>
                      <Input
                        value={supPhone}
                        onChange={(e) => setSupPhone(e.target.value)}
                        placeholder="e.g. 9811122334"
                      />
                    </div>
                    <div>
                      <Label>Material / Goods Type (Optional)</Label>
                      <Input
                        value={supMat}
                        onChange={(e) => setSupMat(e.target.value)}
                        placeholder="e.g. Leather, TPR Soles, Boxes"
                      />
                    </div>
                  </div>

                  {/* Multiple Products Bought From This Supplier (Optional) */}
                  <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="!mb-0 flex items-center gap-1.5 text-slate-800">
                        <Package className="h-3.5 w-3.5 text-slate-500" />
                        Products You Buy From This Supplier (Optional)
                      </Label>
                      <span className="text-[11px] font-medium text-slate-500">
                        {supProducts.length} {supProducts.length === 1 ? "item" : "items"}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-slate-500">
                      Add multiple products, model names, or materials so you always know what you buy from this supplier.
                    </p>

                    <div className="flex gap-2">
                      <Input
                        value={supProductInput}
                        onChange={(e) => setSupProductInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addSupplierProduct();
                          }
                        }}
                        placeholder="Type product name & press Enter (or comma-separated)..."
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => addSupplierProduct()}
                        className="shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    </div>

                    {/* Added Products List */}
                    {supProducts.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {supProducts.map((prod, idx) => (
                          <span
                            key={`${prod}-${idx}`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-2xs"
                          >
                            <span>{prod}</span>
                            <button
                              type="button"
                              onClick={() => removeSupplierProduct(idx)}
                              aria-label={`Remove ${prod}`}
                              className="cursor-pointer rounded p-0.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] italic text-slate-400">
                        No products added yet. Type above or pick from your catalog below.
                      </p>
                    )}

                    {/* Quick-pick from existing shop catalog */}
                    {suggestions.length > 0 && (
                      <div className="space-y-1.5 border-t border-slate-200/80 pt-2.5">
                        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">
                          Quick Pick From Your Products
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {suggestions.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => addSupplierProduct(item)}
                              className="cursor-pointer inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:border-slate-500 hover:bg-slate-100"
                            >
                              <Plus className="h-3 w-3 text-slate-500" />
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* GSTIN & Address (Optional) */}
                  <div className="space-y-3 border-t border-slate-100 pt-3">
                    <div>
                      <Label>GSTIN (Optional)</Label>
                      <GstinInput
                        value={supGstin}
                        onChange={setSupGstin}
                        onStateDetected={setSupStateCode}
                      />
                    </div>
                    <div>
                      <Label>Address / City (Optional)</Label>
                      <Input
                        value={supAddress}
                        onChange={(e) => setSupAddress(e.target.value)}
                        placeholder="e.g. Hing Ki Mandi, Agra"
                      />
                    </div>
                  </div>
                </div>

                {/* Sticky Footer */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/60 px-5 py-3.5">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setSupModalOpen(false)}
                    disabled={supSaving}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={supSaving}>
                    {supSaving ? "Saving..." : editSupId ? "Save Supplier" : "Add Supplier"}
                  </Button>
                </div>
              </Form>
            </aside>
          </div>,
          document.body
        );
      })()}

      <Dialog
        open={Boolean(supPayTarget)}
        onClose={() => setSupPayTarget(null)}
        title={`Pay Supplier Due — ${supPayTarget?.name ?? ""}`}
      >
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!supPayTarget) return;
            await recordSupplierPaymentAction({
              supplierId: supPayTarget.id,
              amount: supPayAmt,
              mode: supPayMode,
              referenceNo: supPayRef || undefined,
            });
            toast.success("Supplier payment recorded.");
            setSupPayTarget(null);
            router.refresh();
          }}
          className="space-y-3"
        >
          <div><Label>Amount Paid ₹</Label><Input type="number" min={1} value={supPayAmt} onChange={(e) => setSupPayAmt(Number(e.target.value))} required /></div>
          <div>
            <Label>Payment Mode</Label>
            <Select value={supPayMode} onChange={(e) => setSupPayMode(e.target.value as PaymentMode)}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
              <option value="card">Card</option>
            </Select>
          </div>
          <div><Label>Reference / UTR (optional)</Label><Input value={supPayRef} onChange={(e) => setSupPayRef(e.target.value)} placeholder="UTR / cheque / receipt no." /></div>
          <Button type="submit" className="w-full">Record Payment</Button>
        </Form>
      </Dialog>

      <Dialog
        open={Boolean(supHistTarget)}
        onClose={() => setSupHistTarget(null)}
        title={`Supplier Bills — ${supHistTarget?.name ?? ""}`}
        subtitle={supHistTarget ? `Total Billed: ₹${Number(supHistTarget.total_purchased).toLocaleString("en-IN")} • Due: ₹${Number(supHistTarget.current_due).toLocaleString("en-IN")}` : ""}
        maxWidth="max-w-xl"
      >
        {supHistLoading ? (
          <InlineRowsSkeleton label="Loading supplier ledger" />
        ) : supHistRows.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">No purchase bills recorded for this supplier yet.</p>
        ) : (
          <div className="max-h-80 space-y-2 overflow-y-auto">
            <Paged items={supHistRows} size={8}>{(pagedRows) => pagedRows.map((po) => {
              const due = Math.max(0, Number(po.total_amount) - Number(po.paid_amount));
              return (
                <div key={po.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-xs">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {po.bill_number || "Purchase Bill"}{" "}
                      <Badge variant="default">{po.purchase_type.replace("_", " ")}</Badge>
                    </p>
                    <p className="text-slate-500">
                      {new Date(po.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">₹{Number(po.total_amount).toLocaleString("en-IN")}</p>
                    <p className="text-[10px] text-slate-500">
                      Paid ₹{Number(po.paid_amount).toLocaleString("en-IN")}
                      {due > 0 ? ` • Due ₹${due.toLocaleString("en-IN")}` : ""}
                    </p>
                  </div>
                </div>
              );
            })}</Paged>
          </div>
        )}
      </Dialog>

      {/* Unified Add / Deduct Money Transaction Dialog (Customer & Supplier) */}
      <Dialog
        open={Boolean(txTarget)}
        onClose={() => setTxTarget(null)}
        title={
          txTarget
            ? `${txTarget.partyType === "supplier" ? "Supplier" : "Customer"} Payment / Entry — ${txTarget.name}`
            : "Record Transaction"
        }
        subtitle={
          txTarget
            ? `Current Balance Due: ₹${txTarget.currentDue.toLocaleString("en-IN")}`
            : undefined
        }
      >
        {txTarget && (() => {
          const amtNum = Number(txAmount || 0);
          const nextBal = Math.max(
            0,
            txTarget.currentDue + (txDirection === "add" ? amtNum : -amtNum)
          );
          const isSup = txTarget.partyType === "supplier";
          return (
            <Form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!amtNum || amtNum <= 0) {
                  toast.error("Enter a valid amount.");
                  return;
                }
                setTxSaving(true);
                try {
                  await recordPartyMoneyTransactionAction({
                    partyType: txTarget.partyType,
                    partyId: txTarget.id,
                    direction: txDirection,
                    amount: amtNum,
                    mode: txMode,
                    voucherNo: txVoucher || undefined,
                    note: txNote || undefined,
                  });
                  toast.success(
                    txDirection === "add"
                      ? `Added ₹${amtNum.toLocaleString("en-IN")} to ${txTarget.name}'s balance.`
                      : `Deducted ₹${amtNum.toLocaleString("en-IN")} (${isSup ? "paid to supplier" : "received from customer"}).`
                  );
                  setTxTarget(null);
                  router.refresh();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not save transaction.");
                } finally {
                  setTxSaving(false);
                }
              }}
              className="space-y-4"
            >
              {/* Sleek Add vs Deduct Segmented Switch */}
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#f1f1f2] p-1">
                <button
                  type="button"
                  onClick={() => setTxDirection("deduct")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer transition-all ${
                    txDirection === "deduct"
                      ? "bg-white text-emerald-700 shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                      : "text-[#55555b] hover:text-[#171717]"
                  }`}
                >
                  {isSup ? "− I Paid Supplier" : "− Customer Paid Me"}
                </button>
                <button
                  type="button"
                  onClick={() => setTxDirection("add")}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold cursor-pointer transition-all ${
                    txDirection === "add"
                      ? "bg-white text-rose-700 shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                      : "text-[#55555b] hover:text-[#171717]"
                  }`}
                >
                  {isSup ? "+ Add Goods / Bill" : "+ Add Bill / Due"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Amount (₹) *</Label>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={txAmount}
                    onChange={(e) => setTxAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                    placeholder="e.g. 50000"
                    required
                  />
                </div>
                <div>
                  <Label>Payment Mode</Label>
                  <Select value={txMode} onChange={(e) => setTxMode(e.target.value as PaymentMode)}>
                    <option value="cash">Cash</option>
                    <option value="upi">UPI</option>
                    <option value="bank_transfer">Bank Transfer / NEFT</option>
                    <option value="card">Card</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label>Bill / Voucher No. (Optional)</Label>
                  <Input
                    value={txVoucher}
                    onChange={(e) => setTxVoucher(e.target.value)}
                    placeholder={txDirection === "deduct" ? "e.g. R1" : "e.g. B.No. 99"}
                  />
                </div>
                <div>
                  <Label>Note / Particulars (Optional)</Label>
                  <Input
                    value={txNote}
                    onChange={(e) => setTxNote(e.target.value)}
                    placeholder="e.g. Paid by cash S.C / 10 cartons"
                  />
                </div>
              </div>

              {amtNum > 0 && (
                <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
                  <span className="text-slate-600">Updated Balance Due</span>
                  <span className="font-mono font-bold text-slate-900">
                    ₹{txTarget.currentDue.toLocaleString("en-IN")} → ₹{nextBal.toLocaleString("en-IN")}
                  </span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <Link
                  href={`/dashboard/customers/ledger/${txTarget.partyType}/${txTarget.id}`}
                  className="text-xs font-semibold text-sky-700 hover:underline"
                >
                  View Full Transaction History →
                </Link>
                <div className="flex items-center gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setTxTarget(null)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={txSaving}>
                    {txSaving ? "Saving..." : "Save Transaction"}
                  </Button>
                </div>
              </div>
            </Form>
          );
        })()}
      </Dialog>
    </div>
  );
}
