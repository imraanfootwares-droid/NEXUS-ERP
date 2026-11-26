"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Package, Plus, Printer, ShoppingBag, Trash2, Truck } from "lucide-react";
import { Paged } from "@/components/ui/pagination";
import { toast } from "sonner";
import { InlineRowsSkeleton } from "@/components/ui/page-skeletons";
import {
  createAndDispatchTransferAction,
  getTransferItemsAction,
  receiveTransferAction,
  recordPurchaseAction,
} from "@/actions/inventory";
import { Form,
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Dialog,
  Input,
  Label,
  Select,
  Tabs,
} from "@/components/ui/primitives";
import type { BranchRow, RatioPreset } from "@/types/database";

interface VariantOpt {
  id: string;
  sku: string;
  model_code: string;
  product_name: string;
  attributes: Record<string, string>;
  avg_cost: string;
  gst_rate: string;
}

export function OperationsHubClient({
  branches,
  variants,
  suppliers,
  transfers,
  suppliersEnabled,
  transfersEnabled,
  canDispatch,
  canReceive,
}: {
  branches: BranchRow[];
  variants: VariantOpt[];
  suppliers: Array<{ id: string; name: string; phone: string | null; material_type: string | null; current_due: string }>;
  batches?: Array<{ id: string; batch_number: string; stage: string; karigar_unit_name: string | null; total_units: string; is_stocked?: boolean; created_at: string }>;
  transfers: Array<{ id: string; doc_type: string; doc_number: string; from_name: string; to_name: string; status: string; transfer_value: string; igst_amount: string; created_at: string }>;
  ratioPresets?: RatioPreset[];
  prodEnabled?: boolean;
  suppliersEnabled: boolean;
  transfersEnabled: boolean;
  canDispatch: boolean;
  canReceive: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(transfersEnabled ? "transfers" : "purchase");

  // Group variants by product model for easy 2-step selection (Pick Model -> Pick Size/Colour)
  const models = useMemo(() => {
    const m = new Map<string, { code: string; name: string; items: VariantOpt[] }>();
    for (const v of variants) {
      const existing = m.get(v.model_code);
      if (existing) {
        existing.items.push(v);
      } else {
        m.set(v.model_code, { code: v.model_code, name: v.product_name, items: [v] });
      }
    }
    return Array.from(m.values());
  }, [variants]);

  // Send Stock (Branch Transfer) state
  const [fromBranch, setFromBranch] = useState(branches[0]?.id ?? "");
  const [toBranch, setToBranch] = useState(branches[1]?.id ?? branches[0]?.id ?? "");
  const [selectedModel, setSelectedModel] = useState(models[0]?.code ?? "");
  const modelVariants = useMemo(
    () => models.find((m) => m.code === selectedModel)?.items ?? variants,
    [models, selectedModel, variants]
  );
  const [selectedVariantIds, setSelectedVariantIds] = useState<string[]>(
    models[0]?.items[0] ? [models[0].items[0].id] : variants[0] ? [variants[0].id] : []
  );
  const [trQtyMode, setTrQtyMode] = useState<"cartons" | "pairs">("cartons");
  const [trQtyInput, setTrQtyInput] = useState("1");
  const [trCartonPack, setTrCartonPack] = useState("20");
  const [trItems, setTrItems] = useState<
    Array<{
      variant_id: string;
      label: string;
      sublabel: string;
      qty_sent: number;
      unitSummary: string;
      transfer_price: number;
      gst_rate: number;
    }>
  >([]);
  const [transport, setTransport] = useState("");
  const [lrNo, setLrNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [sending, setSending] = useState(false);

  // Receive Stock modal state
  const [receiveTarget, setReceiveTarget] = useState<{ id: string; doc_number: string } | null>(null);
  const [receiveLoading, setReceiveLoading] = useState(false);
  const [receiveRows, setReceiveRows] = useState<
    Array<{ variant_id: string; sku: string; product_name: string; qty_sent: number; qty_received: number; discrepancy_note: string }>
  >([]);

  // Simple Record Purchase Bill state
  const [poSupplierId, setPoSupplierId] = useState(suppliers[0]?.id ?? "");
  const [poBranchId, setPoBranchId] = useState(branches[0]?.id ?? "");
  const [poBillNo, setPoBillNo] = useState("");
  const [poVariantId, setPoVariantId] = useState(variants[0]?.id ?? "");
  const [poQtyMode, setPoQtyMode] = useState<"cartons" | "pairs">("cartons");
  const [poQtyInput, setPoQtyInput] = useState("5");
  const [poCartonPack, setPoCartonPack] = useState("20");
  const [poUnitCost, setPoUnitCost] = useState("500");
  const [poPaid, setPoPaid] = useState("0");
  const [poSaving, setPoSaving] = useState(false);

  const selectedVariantsForModel = useMemo(
    () => modelVariants.filter((v) => selectedVariantIds.includes(v.id)),
    [modelVariants, selectedVariantIds]
  );

  const toggleVariantSelection = (variantId: string) => {
    setSelectedVariantIds((prev) =>
      prev.includes(variantId) ? prev.filter((id) => id !== variantId) : [...prev, variantId]
    );
  };

  const computedTrQty =
    trQtyMode === "cartons"
      ? Math.max(0, Number(trQtyInput || 0)) * Math.max(1, Number(trCartonPack || 1))
      : Math.max(0, Number(trQtyInput || 0));

  const addSelectedTransferItems = () => {
    const picked = selectedVariantsForModel;
    if (picked.length === 0) {
      toast.error("Please select at least one size / colour.");
      return;
    }
    if (computedTrQty <= 0) {
      toast.error("Please enter a valid quantity.");
      return;
    }

    const unitSummary =
      trQtyMode === "cartons"
        ? `${Number(trQtyInput)} ctn × ${Number(trCartonPack)} = ${computedTrQty} pairs`
        : `${computedTrQty} pairs`;

    setTrItems((prev) => {
      const next = [...prev];
      for (const v of picked) {
        const attrs = Object.values(v.attributes ?? {}).filter(Boolean).join(" / ");
        const idx = next.findIndex((x) => x.variant_id === v.id);
        if (idx >= 0) {
          const newQty = next[idx].qty_sent + computedTrQty;
          next[idx] = {
            ...next[idx],
            qty_sent: newQty,
            unitSummary: `${newQty} pairs`,
          };
        } else {
          next.push({
            variant_id: v.id,
            label: v.product_name,
            sublabel: attrs ? `${attrs} (${v.model_code})` : v.sku,
            qty_sent: computedTrQty,
            unitSummary,
            transfer_price: Number(v.avg_cost) || 0,
            gst_rate: Number(v.gst_rate) || 0,
          });
        }
      }
      return next;
    });
    toast.success(`Added ${picked.length} ${picked.length === 1 ? "item" : "items"} to transfer list.`);
  };

  const openReceiveModal = async (tr: { id: string; doc_number: string }) => {
    setReceiveTarget(tr);
    setReceiveLoading(true);
    try {
      const rows = await getTransferItemsAction(tr.id);
      setReceiveRows(
        rows.map((r) => ({
          variant_id: r.variant_id,
          sku: r.sku,
          product_name: r.product_name,
          qty_sent: Number(r.qty_sent),
          qty_received: Number(r.qty_sent),
          discrepancy_note: "",
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load items.");
      setReceiveTarget(null);
    } finally {
      setReceiveLoading(false);
    }
  };

  const tabs = [
    ...(transfersEnabled ? [{ id: "transfers", label: "Send Stock Between Shops", badge: transfers.length }] : []),
  ];

  return (
    <div className="space-y-4">
      {tabs.length > 1 && <Tabs active={tab} onChange={setTab} tabs={tabs} />}

      {tab === "transfers" && transfersEnabled && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left: Simple Send Stock Form */}
          <Card className="lg:col-span-6">
            <CardHeader>
              <h3 className="text-sm font-semibold">Send Stock to Another Branch</h3>
              <p className="mt-0.5 text-xs text-[#77777d]">
                Select the branch, choose your model &amp; cartons/pairs, enter transport details, and send.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {branches.length < 2 && (
                <Alert variant="info">
                  You currently have only 1 branch. Add a second branch in{" "}
                  <Link href="/dashboard/settings?tab=branches" className="font-semibold underline">
                    Settings → Branches
                  </Link>{" "}
                  to transfer stock between branches.
                </Alert>
              )}

              {/* Step 1: Branches */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <Label>From Branch</Label>
                  <Select value={fromBranch} onChange={(e) => setFromBranch(e.target.value)}>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>To Branch</Label>
                  <Select value={toBranch} onChange={(e) => setToBranch(e.target.value)}>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>

              {/* Step 2: Pick Model, Variant & Cartons / Pairs */}
              <div className="space-y-3 rounded-xl border border-[#ececee] bg-[#fafafa] p-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[#171717]">Select Product &amp; Quantity</span>
                  <div className="inline-flex rounded-lg bg-[#e8e8ec] p-[2px] text-[11px]">
                    <button
                      type="button"
                      onClick={() => setTrQtyMode("cartons")}
                      className={`cursor-pointer rounded-md px-2.5 py-1 font-semibold transition-all ${
                        trQtyMode === "cartons"
                          ? "bg-[#171717] text-white shadow-2xs"
                          : "text-[#55555b] hover:text-[#171717]"
                      }`}
                    >
                      Cartons / Boxes
                    </button>
                    <button
                      type="button"
                      onClick={() => setTrQtyMode("pairs")}
                      className={`cursor-pointer rounded-md px-2.5 py-1 font-semibold transition-all ${
                        trQtyMode === "pairs"
                          ? "bg-[#171717] text-white shadow-2xs"
                          : "text-[#55555b] hover:text-[#171717]"
                      }`}
                    >
                      Pairs / Pieces
                    </button>
                  </div>
                </div>

                <div>
                  <Label>Model / Product</Label>
                  <Select
                    value={selectedModel}
                    onChange={(e) => {
                      const code = e.target.value;
                      setSelectedModel(code);
                      const first = models.find((m) => m.code === code)?.items[0];
                      setSelectedVariantIds(first ? [first.id] : []);
                    }}
                  >
                    {models.map((m) => (
                      <option key={m.code} value={m.code}>
                        {m.name} ({m.code}) — {m.items.length} {m.items.length === 1 ? "size" : "sizes"}
                      </option>
                    ))}
                  </Select>
                </div>

                {/* Multi-select Sizes & Colours chips */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <Label className="!mb-0">
                      Pick One or Multiple Sizes &amp; Colours ({selectedVariantsForModel.length} selected)
                    </Label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => setSelectedVariantIds(modelVariants.map((v) => v.id))}
                        className="cursor-pointer font-semibold text-sky-700 hover:underline"
                      >
                        Select All
                      </button>
                      {selectedVariantsForModel.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedVariantIds([])}
                          className="cursor-pointer font-medium text-[#77777d] hover:text-[#171717]"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {modelVariants.map((v) => {
                      const attrs = Object.values(v.attributes ?? {}).filter(Boolean).join(" / ") || v.sku;
                      const picked = selectedVariantIds.includes(v.id);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => toggleVariantSelection(v.id)}
                          className={`cursor-pointer rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-all active:scale-95 ${
                            picked
                              ? "bg-[#171717] text-white shadow-2xs"
                              : "border border-[#e4e4e7] bg-white text-[#3f3f46] hover:border-slate-400"
                          }`}
                        >
                          {attrs}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-wrap items-end gap-2">
                  {trQtyMode === "cartons" ? (
                    <>
                      <div className="w-28">
                        <Label>Cartons Each</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={trQtyInput}
                          onChange={(e) => setTrQtyInput(e.target.value.replace(/\D/g, ""))}
                          placeholder="e.g. 5"
                        />
                      </div>
                      <div className="w-28">
                        <Label>Pcs / Carton</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={trCartonPack}
                          onChange={(e) => setTrCartonPack(e.target.value.replace(/\D/g, ""))}
                          placeholder="20"
                        />
                      </div>
                      <div className="pb-2 font-mono text-xs font-semibold text-[#55555b]">
                        = {computedTrQty} pairs each
                      </div>
                    </>
                  ) : (
                    <div className="w-32">
                      <Label>Pairs Each</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={trQtyInput}
                        onChange={(e) => setTrQtyInput(e.target.value.replace(/\D/g, ""))}
                        placeholder="e.g. 12"
                      />
                    </div>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={addSelectedTransferItems}
                    className="ml-auto"
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Selected ({selectedVariantsForModel.length})
                  </Button>
                </div>

                {/* Items Queued to Send */}
                {trItems.length > 0 && (
                  <div className="space-y-1.5 border-t border-[#ececee] pt-2.5">
                    <p className="font-mono text-[10px] font-semibold uppercase tracking-wide text-[#77777d]">
                      Items Ready to Send ({trItems.length})
                    </p>
                    {trItems.map((it, idx) => (
                      <div
                        key={it.variant_id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-[#ececee] bg-white px-2.5 py-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-[#171717]">{it.label}</p>
                          <p className="text-[11px] text-[#77777d]">{it.sublabel}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="rounded-md bg-[#f1f1f2] px-2 py-0.5 font-mono text-[11px] font-semibold text-[#171717]">
                            {it.unitSummary}
                          </span>
                          <button
                            type="button"
                            onClick={() => setTrItems((prev) => prev.filter((_, i) => i !== idx))}
                            className="cursor-pointer rounded p-1 text-rose-500 hover:bg-rose-50"
                            title="Remove"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 3: Transport, LR No, Vehicle No */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div>
                  <Label>Transport Name</Label>
                  <Input
                    value={transport}
                    onChange={(e) => setTransport(e.target.value)}
                    placeholder="e.g. VRL / Safe"
                  />
                </div>
                <div>
                  <Label>LR Number</Label>
                  <Input
                    value={lrNo}
                    onChange={(e) => setLrNo(e.target.value)}
                    placeholder="e.g. LR-4582"
                  />
                </div>
                <div>
                  <Label>Vehicle Number</Label>
                  <Input
                    value={vehicleNo}
                    onChange={(e) => setVehicleNo(e.target.value.toUpperCase())}
                    placeholder="e.g. DL01AB1234"
                  />
                </div>
              </div>

              <Button
                className="w-full"
                disabled={!canDispatch || sending || fromBranch === toBranch}
                onClick={async () => {
                  if (fromBranch === toBranch) {
                    toast.error("From Branch and To Branch must be different.");
                    return;
                  }
                  const list =
                    trItems.length > 0
                      ? trItems
                      : selectedVariantsForModel.length > 0 && computedTrQty > 0
                      ? selectedVariantsForModel.map((v) => ({
                          variant_id: v.id,
                          label: v.product_name,
                          sublabel: v.sku,
                          qty_sent: computedTrQty,
                          unitSummary: `${computedTrQty} pairs`,
                          transfer_price: Number(v.avg_cost) || 0,
                          gst_rate: Number(v.gst_rate) || 0,
                        }))
                      : [];
                  if (list.length === 0) {
                    toast.error("Add at least one item to send.");
                    return;
                  }
                  setSending(true);
                  try {
                    const transferId = await createAndDispatchTransferAction({
                      fromBranchId: fromBranch,
                      toBranchId: toBranch,
                      transportName: transport || undefined,
                      lrNumber: lrNo || undefined,
                      vehicleNo: vehicleNo || undefined,
                      items: list.map((x) => ({
                        variant_id: x.variant_id,
                        qty_sent: x.qty_sent,
                        transfer_price: x.transfer_price,
                        gst_rate: x.gst_rate,
                      })),
                    });
                    toast.success("Stock sent! Delivery slip ready.");
                    setTrItems([]);
                    setTransport("");
                    setLrNo("");
                    setVehicleNo("");
                    router.refresh();
                    if (transferId) {
                      router.push(`/dashboard/transfers/${transferId}/challan`);
                    }
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not send stock.");
                  } finally {
                    setSending(false);
                  }
                }}
              >
                <Truck className="h-4 w-4" />
                {sending
                  ? "Sending Stock..."
                  : `Send Stock & Print Slip (${
                      trItems.length > 0 ? trItems.length : selectedVariantsForModel.length
                    } ${
                      (trItems.length > 0 ? trItems.length : selectedVariantsForModel.length) === 1
                        ? "item"
                        : "items"
                    })`}
              </Button>
            </CardContent>
          </Card>

          {/* Right: Transfer History */}
          <Card className="lg:col-span-6">
            <CardHeader>
              <h3 className="text-sm font-semibold">Transfer History ({transfers.length})</h3>
              <p className="mt-0.5 text-xs text-[#77777d]">
                Track sent stock, mark shipments as received, or print the delivery slip.
              </p>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {transfers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center text-xs text-[#77777d]">
                  <Package className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                  No stock transfers sent yet.
                </div>
              ) : (
                <Paged items={transfers} size={8}>
                  {(pagedRows) =>
                    pagedRows.map((t) => (
                      <div
                        key={t.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ececee] bg-white p-3 text-xs"
                      >
                        <div className="space-y-0.5">
                          <p className="font-semibold text-[#171717]">
                            {t.doc_number} · {t.from_name} → {t.to_name}
                          </p>
                          <p className="text-[11px] text-[#77777d]">
                            Value: ₹{Number(t.transfer_value).toLocaleString("en-IN")} ·{" "}
                            {new Date(t.created_at).toLocaleDateString("en-IN", {
                              timeZone: "Asia/Kolkata",
                            })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Badge
                            variant={
                              t.status === "received"
                                ? "success"
                                : t.status === "dispatched"
                                ? "warning"
                                : "default"
                            }
                          >
                            {t.status === "received"
                              ? "Received"
                              : t.status === "dispatched"
                              ? "In Transit"
                              : t.status}
                          </Badge>
                          {t.status === "dispatched" && canReceive && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openReceiveModal({ id: t.id, doc_number: t.doc_number })}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> Receive
                            </Button>
                          )}
                          <Link
                            href={`/dashboard/transfers/${t.id}/challan`}
                            className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-white px-2.5 text-xs font-medium text-[#27272a] shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.08)] hover:bg-[#fafafa]"
                          >
                            <Printer className="h-3.5 w-3.5" /> View
                          </Link>
                        </div>
                      </div>
                    ))
                  }
                </Paged>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "purchase" && suppliersEnabled && (
        <div className="max-w-2xl space-y-4">
          <Alert variant="info">
            <b>Bought many products or sizes in one bill?</b> Open the supplier in{" "}
            <Link href="/dashboard/customers?tab=suppliers" className="font-semibold underline">
              Customer &amp; Supplier Ledger →
            </Link>{" "}
            and tap <b>New Purchase Bill</b>. This quick form is for one item only. Both add stock automatically.
          </Alert>

          <Card>
            <CardHeader>
              <h3 className="text-sm font-semibold">Record Supplier Purchase Bill</h3>
            </CardHeader>
            <CardContent>
              {suppliers.length === 0 ? (
                <p className="text-xs text-[#77777d]">
                  No suppliers added yet.{" "}
                  <Link href="/dashboard/customers?tab=suppliers" className="font-semibold text-sky-700 underline">
                    Add a supplier first →
                  </Link>
                </p>
              ) : (
                <Form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const v = variants.find((x) => x.id === poVariantId);
                    const qty =
                      poQtyMode === "cartons"
                        ? Math.max(0, Number(poQtyInput || 0)) * Math.max(1, Number(poCartonPack || 1))
                        : Math.max(0, Number(poQtyInput || 0));
                    const cost = Math.max(0, Number(poUnitCost || 0));
                    if (!v || qty <= 0) {
                      toast.error("Please pick a product and valid quantity.");
                      return;
                    }
                    setPoSaving(true);
                    try {
                      const res = await recordPurchaseAction({
                        branchId: poBranchId,
                        supplierId: poSupplierId,
                        billNumber: poBillNo || undefined,
                        purchaseType: "finished_goods",
                        paidAmount: Math.max(0, Number(poPaid || 0)),
                        itcCgst: 0,
                        itcSgst: 0,
                        itcIgst: 0,
                        items: [
                          {
                            variant_id: v.id,
                            item_description: `${v.product_name} (${v.sku})`,
                            qty,
                            unit_cost: cost,
                            gst_rate: Number(v.gst_rate || 0),
                            line_total: qty * cost,
                          },
                        ],
                      });
                      if (!res.ok) {
                        toast.error(res.error);
                        return;
                      }
                      toast.success("Purchase bill saved & stock added!");
                      setPoBillNo("");
                      setPoPaid("0");
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not save purchase.");
                    } finally {
                      setPoSaving(false);
                    }
                  }}
                  className="space-y-3.5"
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Supplier *</Label>
                      <Select value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)}>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Receive Stock Into Branch *</Label>
                      <Select value={poBranchId} onChange={(e) => setPoBranchId(e.target.value)}>
                        {branches.map((b) => (
                          <option key={b.id} value={b.id}>
                            {b.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <Label>Product *</Label>
                      <Select value={poVariantId} onChange={(e) => setPoVariantId(e.target.value)}>
                        {variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.product_name} — {Object.values(v.attributes ?? {}).join(" / ") || v.sku}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>Supplier Bill No. (Optional)</Label>
                      <Input
                        value={poBillNo}
                        onChange={(e) => setPoBillNo(e.target.value)}
                        placeholder="e.g. INV-102"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <Label>Count By</Label>
                      <Select
                        value={poQtyMode}
                        onChange={(e) => setPoQtyMode(e.target.value as "cartons" | "pairs")}
                      >
                        <option value="cartons">Cartons</option>
                        <option value="pairs">Pairs</option>
                      </Select>
                    </div>
                    <div>
                      <Label>{poQtyMode === "cartons" ? "Cartons" : "Pairs"}</Label>
                      <Input
                        type="text"
                        inputMode="numeric"
                        value={poQtyInput}
                        onChange={(e) => setPoQtyInput(e.target.value.replace(/\D/g, ""))}
                        required
                      />
                    </div>
                    {poQtyMode === "cartons" && (
                      <div>
                        <Label>Pcs / Carton</Label>
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={poCartonPack}
                          onChange={(e) => setPoCartonPack(e.target.value.replace(/\D/g, ""))}
                          required
                        />
                      </div>
                    )}
                    <div>
                      <Label>Cost / Pair (₹)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={poUnitCost}
                        onChange={(e) => setPoUnitCost(e.target.value.replace(/[^0-9.]/g, ""))}
                        required
                      />
                    </div>
                  </div>

                  <div className="max-w-xs">
                    <Label>Amount Paid Today (₹)</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={poPaid}
                      onChange={(e) => setPoPaid(e.target.value.replace(/[^0-9.]/g, ""))}
                    />
                  </div>

                  <Button type="submit" disabled={poSaving}>
                    <ShoppingBag className="h-4 w-4" />
                    {poSaving ? "Saving..." : "Save Purchase & Add Stock"}
                  </Button>
                </Form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Receive Transfer Modal */}
      <Dialog
        open={Boolean(receiveTarget)}
        onClose={() => setReceiveTarget(null)}
        title={`Confirm Received Stock — ${receiveTarget?.doc_number ?? ""}`}
        subtitle="Check received quantities and confirm to add stock into the receiving branch."
        maxWidth="max-w-xl"
      >
        {receiveLoading ? (
          <InlineRowsSkeleton label="Loading shipment items" />
        ) : (
          <Form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!receiveTarget) return;
              try {
                await receiveTransferAction(
                  receiveTarget.id,
                  receiveRows.map((r) => ({
                    variant_id: r.variant_id,
                    qty_received: r.qty_received,
                    discrepancy_note: r.discrepancy_note || undefined,
                  }))
                );
                toast.success("Stock received & added to branch inventory!");
                setReceiveTarget(null);
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Could not receive stock.");
              }
            }}
            className="space-y-3"
          >
            {receiveRows.map((row, idx) => (
              <div
                key={row.variant_id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-3 text-xs"
              >
                <div>
                  <p className="font-semibold text-[#171717]">{row.product_name}</p>
                  <p className="text-[11px] text-[#77777d]">
                    {row.sku} · Sent: {row.qty_sent} pairs
                  </p>
                </div>
                <div className="w-28">
                  <Label>Received Qty</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={String(row.qty_received)}
                    onChange={(e) => {
                      const val = Number(e.target.value.replace(/\D/g, "") || 0);
                      setReceiveRows((prev) =>
                        prev.map((r, i) => (i === idx ? { ...r, qty_received: val } : r))
                      );
                    }}
                  />
                </div>
              </div>
            ))}
            <Button type="submit" className="w-full">
              Confirm &amp; Add to Branch Stock
            </Button>
          </Form>
        )}
      </Dialog>
    </div>
  );
}
