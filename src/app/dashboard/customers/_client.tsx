"use client";

import React, { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Package, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import {
  createCustomerAction,
  createSupplierAction,
  updateCustomerAction,
  updateSupplierAction,
} from "@/actions/inventory";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { GstinInput } from "@/components/ui/dynamic-fields";
import { Form, Badge, Button, Dialog, Input, Label, Select, Tabs } from "@/components/ui/primitives";
import { StatTray } from "@/components/ui/spark";
import type { CustomerRow } from "@/types/database";

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

export function CustomersClient({
  customers,
  suppliers = [],
  catalogProducts = [],
  customersEnabled = true,
  suppliersEnabled = false,
  canManage,
  canManageSuppliers = false,
  initialTab = "customers",
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
      header: "",
      className: "w-[1%] whitespace-nowrap text-right",
      render: (r) => (
        <Link
          href={`/dashboard/customers/ledger/customer/${r.id}`}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-[#171717] px-3 text-xs font-semibold text-white hover:bg-[#2a2a2a]"
        >
          Open <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ),
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
              <span className="font-semibold text-slate-900">{s.name}</span>
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
      header: "",
      className: "w-[1%] whitespace-nowrap text-right",
      render: (s) => (
        <Link
          href={`/dashboard/customers/ledger/supplier/${s.id}`}
          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-[#171717] px-3 text-xs font-semibold text-white hover:bg-[#2a2a2a]"
        >
          Open <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      ),
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
              rowHref={(r) => `/dashboard/customers/ledger/customer/${r.id}`}
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
            rowHref={(s) => `/dashboard/customers/ledger/supplier/${s.id}`}
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


    </div>
  );
}
