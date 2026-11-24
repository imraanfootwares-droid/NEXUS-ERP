"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, Edit, Printer, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { InlineRowsSkeleton } from "@/components/ui/page-skeletons";
import {
  cancelInvoiceAction,
  deleteDraftInvoiceAction,
  getInvoiceItemsForReturnAction,
  processReturnOrExchangeAction,
} from "@/actions/billing";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Badge, Button, Dialog, Input, Label, Select } from "@/components/ui/primitives";

interface InvoiceListRow {
  id: string;
  invoice_number: string | null;
  invoice_type: string;
  branch_name: string;
  customer_name: string;
  grand_total: string;
  paid_amount: string;
  due_amount: string;
  status: string;
  has_oversold: boolean;
  created_at: string;
  creator_name: string | null;
  creator_login: string | null;
  creator_role: string | null;
}

interface ReturnLineItem {
  id: string;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  hsn_code: string | null;
  sold_qty: number;
  return_qty: number;
  unit_price: number;
  taxable_value: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  line_total: number;
}

export function BillingLedgerClient({
  invoices,
  canEdit,
  canCancel,
  canReturn,
}: {
  invoices: InvoiceListRow[];
  canEdit: boolean;
  canCancel: boolean;
  canReturn: boolean;
}) {
  const router = useRouter();
  const [onlyOversold, setOnlyOversold] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<InvoiceListRow | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const [returnTarget, setReturnTarget] = useState<InvoiceListRow | null>(null);
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnItems, setReturnItems] = useState<ReturnLineItem[]>([]);
  const [exchangeOptions, setExchangeOptions] = useState<
    Array<{ id: string; sku: string; product_name: string; attributes: Record<string, string>; selling_price: string }>
  >([]);
  const [hasCustomer, setHasCustomer] = useState(false);
  const [settlementMode, setSettlementMode] = useState<"refund" | "credit_balance">("refund");
  const [exchangeVariantId, setExchangeVariantId] = useState("");
  const [exchangeQty, setExchangeQty] = useState(1);
  const [returnNotes, setReturnNotes] = useState("Counter return");

  const openReturnModal = async (inv: InvoiceListRow) => {
    setReturnTarget(inv);
    setReturnLoading(true);
    setExchangeVariantId("");
    setExchangeQty(1);
    setSettlementMode("refund");
    try {
      const res = await getInvoiceItemsForReturnAction(inv.id);
      setHasCustomer(Boolean(res.invoice?.customer_id));
      setExchangeOptions(res.exchangeOptions);
      setReturnItems(
        res.items.map((it) => ({
          id: it.id,
          variant_id: it.variant_id,
          product_name: it.product_name,
          sku: it.sku,
          hsn_code: it.hsn_code,
          sold_qty: Number(it.qty),
          return_qty: 0,
          unit_price: Number(it.unit_price),
          taxable_value: Number(it.taxable_value),
          gst_rate: Number(it.gst_rate),
          cgst: Number(it.cgst),
          sgst: Number(it.sgst),
          igst: Number(it.igst),
          line_total: Number(it.line_total),
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invoice items");
      setReturnTarget(null);
    } finally {
      setReturnLoading(false);
    }
  };

  const selectedReturnLines = returnItems.filter((it) => it.return_qty > 0);
  const computedReturnTotals = selectedReturnLines.reduce(
    (acc, it) => {
      const ratio = it.return_qty / Math.max(1, it.sold_qty);
      acc.taxable += it.taxable_value * ratio;
      acc.cgst += it.cgst * ratio;
      acc.sgst += it.sgst * ratio;
      acc.igst += it.igst * ratio;
      acc.total += it.line_total * ratio;
      return acc;
    },
    { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 }
  );

  const filtered = onlyOversold ? invoices.filter((i) => i.has_oversold) : invoices;
  const oversoldCount = invoices.filter((i) => i.has_oversold).length;

  const columns: ColumnDef<InvoiceListRow>[] = [
    {
      key: "no",
      header: "Invoice #",
      mobilePrimary: true,
      sortValue: (r) => r.invoice_number || "DRAFT",
      render: (r) => (
        <div>
          <span className="font-semibold text-slate-900">{r.invoice_number || "DRAFT"}</span>
          {r.invoice_type === "return_credit_note" && <Badge variant="info" className="ml-1.5">Credit Note</Badge>}
          {r.has_oversold && <Badge variant="danger" className="ml-1.5">Oversold</Badge>}
          <div className="text-[11px] text-slate-500">{r.branch_name}</div>
        </div>
      ),
    },
    {
      key: "customer",
      header: "Customer & Date/Time",
      sortValue: (r) => r.customer_name,
      render: (r) => (
        <div>
          <span className="font-medium">{r.customer_name}</span>
          <div className="font-mono text-[11px] text-slate-500" suppressHydrationWarning>
            {new Date(r.created_at).toLocaleString("en-IN", {
              timeZone: "Asia/Kolkata",
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </div>
        </div>
      ),
    },
    {
      key: "built_by",
      header: "Built By",
      sortValue: (r) => r.creator_name || "",
      render: (r) =>
        r.creator_name ? (
          <div>
            <span className="font-medium text-slate-900">{r.creator_name}</span>
            <div className="text-[11px] text-slate-500">
              {r.creator_login ? `@${r.creator_login}` : ""}
              {r.creator_role ? ` • ${r.creator_role.replace("_", " ")}` : ""}
            </div>
          </div>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: "total",
      header: "Amount",
      sortValue: (r) => Number(r.grand_total),
      render: (r) => (
        <div>
          <span className="font-semibold">₹{Number(r.grand_total).toLocaleString("en-IN")}</span>
          {Number(r.due_amount) > 0 && (
            <div className="text-[11px] text-amber-700">Due: ₹{Number(r.due_amount).toLocaleString("en-IN")}</div>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge
          variant={
            r.status === "paid"
              ? "success"
              : r.status === "cancelled"
              ? "danger"
              : r.status === "draft"
              ? "info"
              : "warning"
          }
        >
          {r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (r) => (
        <div className="flex flex-wrap gap-1.5">
          {r.status === "draft" && canEdit && (
            <>
              <Link
                href={`/dashboard/billing/new?draft=${r.id}`}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                <Edit className="h-3.5 w-3.5" /> Edit
              </Link>
              <button
                type="button"
                title="Delete Draft"
                onClick={async () => {
                  if (!confirm("Delete this draft bill permanently?")) return;
                  await deleteDraftInvoiceAction(r.id);
                  toast.success("Draft deleted.");
                  router.refresh();
                }}
                className="inline-flex items-center rounded-lg bg-white p-1.5 text-rose-600 shadow-[0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-rose-50 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          <Link
            href={`/dashboard/billing/${r.id}/print`}
            className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </Link>
          {r.status !== "draft" && r.status !== "cancelled" && r.invoice_type === "sale" && canReturn && (
            <Button size="sm" variant="outline" onClick={() => openReturnModal(r)}>
              <RotateCcw className="h-3.5 w-3.5" /> Return / Exchange
            </Button>
          )}
          {r.status !== "cancelled" && canCancel && (
            <Button size="sm" variant="ghost" onClick={() => setCancelTarget(r)}>
              <Ban className="h-3.5 w-3.5 text-rose-600" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <DataTable
        data={filtered}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search invoice number or customer..."
        searchFilter={(r, q) =>
          (r.invoice_number ?? "draft").toLowerCase().includes(q) ||
          r.customer_name.toLowerCase().includes(q)
        }
        actions={
          oversoldCount > 0 ? (
            <Button
              size="sm"
              variant={onlyOversold ? "danger" : "outline"}
              onClick={() => setOnlyOversold(!onlyOversold)}
            >
              Oversold Offline Bills ({oversoldCount})
            </Button>
          ) : undefined
        }
      />

      <Dialog
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title={`Cancel ${cancelTarget?.invoice_number || "Draft"}`}
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!cancelTarget) return;
            try {
              await cancelInvoiceAction(cancelTarget.id, cancelReason);
              toast.success("Invoice cancelled & stock restocked.");
              setCancelTarget(null);
              setCancelReason("");
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Cancel failed");
            }
          }}
          className="space-y-3"
        >
          <div>
            <Label>Reason for Cancellation</Label>
            <Input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} required />
          </div>
          <Button type="submit" variant="danger" className="w-full">Confirm Void &amp; Restock</Button>
        </form>
      </Dialog>

      <Dialog
        open={Boolean(returnTarget)}
        onClose={() => setReturnTarget(null)}
        title={`Return Credit Note & Size Exchange — ${returnTarget?.invoice_number ?? ""}`}
        maxWidth="max-w-2xl"
      >
        {returnLoading ? (
          <InlineRowsSkeleton label="Loading invoice line items" />
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!returnTarget || selectedReturnLines.length === 0) {
                toast.error("Select at least one item quantity to return.");
                return;
              }
              try {
                const roundedTotal = Math.round(computedReturnTotals.total);
                await processReturnOrExchangeAction({
                  idempotency_key: crypto.randomUUID(),
                  parent_invoice_id: returnTarget.id,
                  subtotal: Number(computedReturnTotals.taxable.toFixed(2)),
                  taxable_amount: Number(computedReturnTotals.taxable.toFixed(2)),
                  cgst_amount: Number(computedReturnTotals.cgst.toFixed(2)),
                  sgst_amount: Number(computedReturnTotals.sgst.toFixed(2)),
                  igst_amount: Number(computedReturnTotals.igst.toFixed(2)),
                  round_off: Number((roundedTotal - computedReturnTotals.total).toFixed(2)),
                  grand_total: roundedTotal,
                  refund_paid: settlementMode === "refund" && !exchangeVariantId ? roundedTotal : 0,
                  credit_to_balance: settlementMode === "credit_balance" && hasCustomer && !exchangeVariantId ? roundedTotal : 0,
                  return_items: selectedReturnLines.map((it) => {
                    const ratio = it.return_qty / Math.max(1, it.sold_qty);
                    return {
                      variant_id: it.variant_id,
                      product_name: it.product_name,
                      sku: it.sku,
                      hsn_code: it.hsn_code,
                      qty: it.return_qty,
                      unit_price: it.unit_price,
                      taxable_value: Number((it.taxable_value * ratio).toFixed(2)),
                      gst_rate: it.gst_rate,
                      cgst: Number((it.cgst * ratio).toFixed(2)),
                      sgst: Number((it.sgst * ratio).toFixed(2)),
                      igst: Number((it.igst * ratio).toFixed(2)),
                      line_total: Number((it.line_total * ratio).toFixed(2)),
                    };
                  }),
                  exchange_items: exchangeVariantId
                    ? [{ variant_id: exchangeVariantId, qty: exchangeQty }]
                    : [],
                  notes: exchangeVariantId ? `${returnNotes} (1-Click Size Exchange)` : returnNotes,
                });
                toast.success(exchangeVariantId ? "Size exchange completed & stock adjusted!" : "Credit Note issued & stock restocked!");
                setReturnTarget(null);
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Return failed");
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-2 max-h-56 overflow-y-auto">
              <p className="text-xs font-semibold text-slate-700">1. Select Items to Return (Auto-restocks original variant)</p>
              {returnItems.map((it, idx) => (
                <div key={it.id} className="rounded-lg border border-slate-200 p-2.5 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 truncate">{it.product_name}</p>
                    <p className="text-slate-500">
                      Sold: {it.sold_qty} • ₹{it.unit_price} • GST {it.gst_rate}%
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-slate-500">Return Qty:</span>
                    <input
                      type="number"
                      min={0}
                      max={it.sold_qty}
                      value={it.return_qty}
                      onChange={(e) => {
                        const q = Math.min(it.sold_qty, Math.max(0, Number(e.target.value) || 0));
                        setReturnItems((prev) => prev.map((row, i) => (i === idx ? { ...row, return_qty: q } : row)));
                      }}
                      className="w-16 min-h-[36px] rounded border border-slate-300 text-center font-semibold"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-[10px] border border-sky-200 bg-sky-50/60 p-3 space-y-2">
              <p className="text-xs font-semibold text-sky-900">2. Optional: 1-Click Size / Variant Exchange</p>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <div className="sm:col-span-3">
                  <Label>Replacement Size / Variant</Label>
                  <Select value={exchangeVariantId} onChange={(e) => setExchangeVariantId(e.target.value)}>
                    <option value="">No exchange (Credit Note / Refund only)</option>
                    {exchangeOptions.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.product_name} — {Object.values(v.attributes).join(" / ")} ({v.sku}) ₹{v.selling_price}
                      </option>
                    ))}
                  </Select>
                </div>
                {exchangeVariantId && (
                  <div>
                    <Label>Exchange Qty</Label>
                    <Input type="number" min={1} value={exchangeQty} onChange={(e) => setExchangeQty(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                )}
              </div>
            </div>

            {!exchangeVariantId && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label>Settlement Mode</Label>
                  <Select value={settlementMode} onChange={(e) => setSettlementMode(e.target.value as "refund" | "credit_balance")}>
                    <option value="refund">Cash / UPI Refund</option>
                    {hasCustomer && <option value="credit_balance">Add to Customer Credit Balance</option>}
                  </Select>
                </div>
                <div>
                  <Label>Return Note</Label>
                  <Input value={returnNotes} onChange={(e) => setReturnNotes(e.target.value)} />
                </div>
              </div>
            )}

            <div className="rounded-lg bg-slate-900 text-white px-4 py-3 text-xs flex justify-between items-center">
              <span>Credit Note Value (incl. GST)</span>
              <span className="text-base font-bold">₹{Math.round(computedReturnTotals.total).toLocaleString("en-IN")}</span>
            </div>

            <Button type="submit" className="w-full" disabled={selectedReturnLines.length === 0}>
              {exchangeVariantId ? "Confirm 1-Click Size Exchange" : "Issue Credit Note & Restock"}
            </Button>
          </form>
        )}
      </Dialog>
    </div>
  );
}
