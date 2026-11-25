"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getPurchaseForEditAction, updatePurchaseOrderAction } from "@/actions/bill-revisions";
import { Button, Dialog, Form, Input, Label } from "@/components/ui/primitives";
import type { PurchaseItemSnapshot } from "@/lib/billing/revisions";

export function PurchaseEditDialog({
  purchaseId,
  supplierName,
  onClose,
}: {
  purchaseId: string | null;
  supplierName: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [billNumber, setBillNumber] = useState("");
  const [paidAmount, setPaidAmount] = useState("0");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<PurchaseItemSnapshot[]>([]);
  const loading = Boolean(purchaseId) && loadedId !== purchaseId;

  useEffect(() => {
    if (!purchaseId) return;
    let active = true;
    getPurchaseForEditAction(purchaseId)
      .then((snap) => {
        if (!active || !snap) return;
        setBillNumber(snap.bill_number || "");
        setPaidAmount(String(snap.paid_amount || 0));
        setNotes(snap.notes || "");
        setItems(snap.items);
      })
      .catch((err) => {
        if (active) {
          toast.error(err instanceof Error ? err.message : "Could not load purchase bill.");
          onClose();
        }
      })
      .finally(() => {
        if (active) setLoadedId(purchaseId);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [purchaseId]);

  const totalAmount = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unit_cost || 0), 0);
  const paidNum = Math.min(totalAmount, Math.max(0, Number(paidAmount || 0)));

  return (
    <Dialog
      open={Boolean(purchaseId)}
      onClose={onClose}
      title={`Edit Purchase Bill — ${supplierName}`}
      subtitle="Saving updates stock & supplier balance automatically and records a version in Edit History."
      maxWidth="max-w-2xl"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading purchase bill...
        </div>
      ) : (
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!purchaseId) return;
            const validItems = items.filter((it) => it.item_description.trim() && Number(it.qty) > 0);
            if (validItems.length === 0) {
              toast.error("Keep at least one item with quantity greater than 0.");
              return;
            }
            setSaving(true);
            try {
              await updatePurchaseOrderAction(purchaseId, {
                billNumber,
                paidAmount: paidNum,
                notes,
                items: validItems.map((it) => ({
                  ...it,
                  line_total: Number((Number(it.qty) * Number(it.unit_cost)).toFixed(2)),
                })),
              });
              toast.success("Purchase bill updated! Stock, supplier balance & history saved.");
              onClose();
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not update purchase bill.");
            } finally {
              setSaving(false);
            }
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Supplier Bill No.</Label>
              <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="e.g. PO-102" />
            </div>
            <div>
              <Label>Paid Amount ₹</Label>
              <Input
                inputMode="decimal"
                value={paidAmount}
                onChange={(e) => setPaidAmount(e.target.value.replace(/[^0-9.]/g, ""))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="!mb-0">Items ({items.length})</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  setItems((prev) => [
                    ...prev,
                    { variant_id: null, item_description: "", qty: 1, unit_cost: 0, gst_rate: 0, line_total: 0 },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add Item
              </Button>
            </div>

            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {items.map((it, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-12 items-end gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5"
                >
                  <div className="col-span-12 sm:col-span-5">
                    <Label>Item Name</Label>
                    <Input
                      value={it.item_description}
                      onChange={(e) =>
                        setItems((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, item_description: e.target.value } : row))
                        )
                      }
                      required
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label>Qty</Label>
                    <Input
                      type="number"
                      min={1}
                      value={it.qty}
                      onChange={(e) => {
                        const q = Math.max(0, Number(e.target.value) || 0);
                        setItems((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, qty: q, line_total: q * Number(row.unit_cost) } : row
                          )
                        );
                      }}
                    />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Label>Rate ₹</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={it.unit_cost}
                      onChange={(e) => {
                        const r = Math.max(0, Number(e.target.value) || 0);
                        setItems((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, unit_cost: r, line_total: Number(row.qty) * r } : row
                          )
                        );
                      }}
                    />
                  </div>
                  <div className="col-span-3 sm:col-span-2 text-right pb-2 font-mono text-xs font-bold text-slate-900">
                    ₹{(Number(it.qty) * Number(it.unit_cost)).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                  <div className="col-span-1 flex justify-end pb-1">
                    <button
                      type="button"
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="cursor-pointer rounded-md p-1.5 text-rose-600 hover:bg-rose-50"
                      title="Remove item"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Note (Optional)</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any remarks about this purchase" />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#171717] px-4 py-3 text-xs text-white">
            <span>
              Total: <strong className="font-mono text-sm">₹{totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
            </span>
            <span className="text-white/80">
              Unpaid Balance: <strong className="font-mono text-white">₹{Math.max(0, totalAmount - paidNum).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</strong>
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save Purchase Changes"}
            </Button>
          </div>
        </Form>
      )}
    </Dialog>
  );
}
