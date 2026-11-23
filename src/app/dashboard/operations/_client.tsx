"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Pencil, Plus, Printer, ShoppingBag, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import {
  advanceProductionBatchStageAction,
  createAndDispatchTransferAction,
  createSupplierAction,
  deleteSupplierAction,
  getTransferItemsAction,
  receiveTransferAction,
  recordProductionBatchAction,
  recordPurchaseAction,
  recordSupplierPaymentAction,
  updateSupplierAction,
} from "@/actions/inventory";
import { SizeRunQuickFill } from "@/components/ui/dynamic-fields";
import {
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
import type { BranchRow, PaymentMode, ProductionStage, RatioPreset } from "@/types/database";

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
  batches,
  transfers,
  ratioPresets = [],
  prodEnabled,
  suppliersEnabled,
  transfersEnabled,
  canDispatch,
  canReceive,
}: {
  branches: BranchRow[];
  variants: VariantOpt[];
  suppliers: Array<{ id: string; name: string; phone: string | null; material_type: string | null; current_due: string }>;
  batches: Array<{ id: string; batch_number: string; stage: string; karigar_unit_name: string | null; total_units: string; is_stocked?: boolean; created_at: string }>;
  transfers: Array<{ id: string; doc_type: string; doc_number: string; from_name: string; to_name: string; status: string; transfer_value: string; igst_amount: string; created_at: string }>;
  ratioPresets?: RatioPreset[];
  prodEnabled: boolean;
  suppliersEnabled: boolean;
  transfersEnabled: boolean;
  canDispatch: boolean;
  canReceive: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState(transfersEnabled ? "transfers" : "production");

  const models = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of variants) if (!m.has(v.model_code)) m.set(v.model_code, v.product_name);
    return Array.from(m.entries()).map(([code, name]) => ({ code, name }));
  }, [variants]);

  // Production multi-item state
  const [prodBranch, setProdBranch] = useState(branches.find((b) => b.type === "factory")?.id ?? branches[0]?.id ?? "");
  const [prodStage, setProdStage] = useState<ProductionStage>("packed");
  const [karigar, setKarigar] = useState("");
  const [prodVariant, setProdVariant] = useState(variants[0]?.id ?? "");
  const [prodQty, setProdQty] = useState(12);
  const [prodCost, setProdCost] = useState(900);
  const [prodModelForRatio, setProdModelForRatio] = useState(models[0]?.code ?? "");
  const [prodItems, setProdItems] = useState<Array<{ variant_id: string; label: string; qty: number; unit_cost: number }>>([]);

  // Supplier + Purchase Order state
  const [editSupId, setEditSupId] = useState<string | null>(null);
  const [supName, setSupName] = useState("");
  const [supPhone, setSupPhone] = useState("");
  const [supMat, setSupMat] = useState("");
  const [paySup, setPaySup] = useState<{ id: string; name: string; due: number } | null>(null);
  const [payAmt, setPayAmt] = useState(0);
  const [payMode, setPayMode] = useState<PaymentMode>("bank_transfer");

  const [poOpen, setPoOpen] = useState(false);
  const [poSupplierId, setPoSupplierId] = useState(suppliers[0]?.id ?? "");
  const [poBranchId, setPoBranchId] = useState(branches[0]?.id ?? "");
  const [poType, setPoType] = useState<"finished_goods" | "raw_material">("finished_goods");
  const [poBillNo, setPoBillNo] = useState("");
  const [poVariantId, setPoVariantId] = useState(variants[0]?.id ?? "");
  const [poDesc, setPoDesc] = useState("");
  const [poQty, setPoQty] = useState(10);
  const [poUnitCost, setPoUnitCost] = useState(500);
  const [poGstRate, setPoGstRate] = useState(5);
  const [poPaid, setPoPaid] = useState(0);

  // Transfer multi-item + Receive modal state
  const [fromBranch, setFromBranch] = useState(branches.find((b) => b.type === "factory")?.id ?? branches[0]?.id ?? "");
  const [toBranch, setToBranch] = useState(branches.find((b) => b.type === "retail")?.id ?? branches[1]?.id ?? "");
  const [trVariant, setTrVariant] = useState(variants[0]?.id ?? "");
  const [trQty, setTrQty] = useState(12);
  const [trModelForRatio, setTrModelForRatio] = useState(models[0]?.code ?? "");
  const [trItems, setTrItems] = useState<
    Array<{ variant_id: string; label: string; qty_sent: number; transfer_price: number; gst_rate: number }>
  >([]);
  const [transport, setTransport] = useState("");
  const [lrNo, setLrNo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");
  const [ewayBillNo, setEwayBillNo] = useState("");

  const [receiveTarget, setReceiveTarget] = useState<{ id: string; doc_number: string } | null>(null);
  const [receiveLoading, setReceiveLoading] = useState(false);
  const [receiveRows, setReceiveRows] = useState<
    Array<{ variant_id: string; sku: string; product_name: string; qty_sent: number; qty_received: number; discrepancy_note: string }>
  >([]);

  const fromB = branches.find((b) => b.id === fromBranch);
  const toB = branches.find((b) => b.id === toBranch);
  const isInterGstinTransfer =
    Boolean(fromB?.gstin) && Boolean(toB?.gstin) && fromB!.gstin!.toUpperCase() !== toB!.gstin!.toUpperCase();

  const estimatedTransferValue = trItems.reduce((s, it) => s + it.qty_sent * it.transfer_price, 0);

  const applyRatioToList = (
    modelCode: string,
    ratios: Record<string, number>,
    mode: "transfer" | "production"
  ) => {
    const matching = variants.filter((v) => v.model_code === modelCode);
    let added = 0;
    for (const [sizeKey, qty] of Object.entries(ratios)) {
      if (qty <= 0) continue;
      const hit = matching.find((v) =>
        Object.values(v.attributes).some((av) => av.toLowerCase() === sizeKey.toLowerCase())
      );
      if (!hit) continue;
      added += qty;
      if (mode === "transfer") {
        setTrItems((prev) => {
          const idx = prev.findIndex((x) => x.variant_id === hit.id);
          if (idx >= 0) {
            const n = [...prev];
            n[idx] = { ...n[idx], qty_sent: n[idx].qty_sent + qty };
            return n;
          }
          return [
            ...prev,
            {
              variant_id: hit.id,
              label: `${hit.product_name} (${hit.sku})`,
              qty_sent: qty,
              transfer_price: Number(hit.avg_cost || 0),
              gst_rate: Number(hit.gst_rate || 5),
            },
          ];
        });
      } else {
        setProdItems((prev) => {
          const idx = prev.findIndex((x) => x.variant_id === hit.id);
          if (idx >= 0) {
            const n = [...prev];
            n[idx] = { ...n[idx], qty: n[idx].qty + qty };
            return n;
          }
          return [
            ...prev,
            {
              variant_id: hit.id,
              label: `${hit.product_name} (${hit.sku})`,
              qty,
              unit_cost: prodCost || Number(hit.avg_cost || 0),
            },
          ];
        });
      }
    }
    toast.success(added > 0 ? `Filled ${added} unit(s) across sizes.` : "No matching size variants found.");
  };

  const openReceiveModal = async (tr: { id: string; doc_number: string }) => {
    setReceiveTarget(tr);
    setReceiveLoading(true);
    try {
      const items = await getTransferItemsAction(tr.id);
      setReceiveRows(
        items.map((it) => ({
          variant_id: it.variant_id,
          sku: it.sku,
          product_name: it.product_name,
          qty_sent: Number(it.qty_sent),
          qty_received: Number(it.qty_sent),
          discrepancy_note: "",
        }))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load transfer items");
      setReceiveTarget(null);
    } finally {
      setReceiveLoading(false);
    }
  };

  const tabs = [
    ...(transfersEnabled ? [{ id: "transfers", label: `Branch Transfers (${transfers.length})` }] : []),
    ...(prodEnabled ? [{ id: "production", label: `Production Batches (${batches.length})` }] : []),
    ...(suppliersEnabled ? [{ id: "suppliers", label: `Suppliers & Purchases (${suppliers.length})` }] : []),
  ];

  return (
    <div className="space-y-4">
      <Tabs active={tab} onChange={setTab} tabs={tabs} />

      {tab === "transfers" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {canDispatch && branches.length >= 2 && (
            <Card className="lg:col-span-5">
              <CardHeader><h3 className="text-sm font-semibold">Dispatch Factory → Shop Transfer</h3></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label>From Branch</Label>
                    <Select value={fromBranch} onChange={(e) => setFromBranch(e.target.value)}>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </div>
                  <div>
                    <Label>To Branch</Label>
                    <Select value={toBranch} onChange={(e) => setToBranch(e.target.value)}>
                      {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </Select>
                  </div>
                </div>

                <Alert variant={isInterGstinTransfer ? "warning" : "info"}>
                  {isInterGstinTransfer
                    ? "Different Branch GSTINs detected → Auto-generates Branch Transfer Tax Invoice (IGST)."
                    : "Same GSTIN / Non-GST branch → Auto-generates Stock Transfer Delivery Challan."}
                </Alert>

                {ratioPresets.length > 0 && models.length > 0 && (
                  <div className="space-y-2">
                    <Label>Quick Fill by Size-Run Carton</Label>
                    <Select value={trModelForRatio} onChange={(e) => setTrModelForRatio(e.target.value)}>
                      {models.map((m) => <option key={m.code} value={m.code}>{m.name} ({m.code})</option>)}
                    </Select>
                    <SizeRunQuickFill
                      presets={ratioPresets}
                      onApply={(ratios) => applyRatioToList(trModelForRatio, ratios, "transfer")}
                    />
                  </div>
                )}

                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <Label>Add Single Variant</Label>
                    <Select value={trVariant} onChange={(e) => setTrVariant(e.target.value)}>
                      {variants.map((v) => (
                        <option key={v.id} value={v.id}>{v.product_name} — {v.sku}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="w-20">
                    <Label>Qty</Label>
                    <Input type="number" min={1} value={trQty} onChange={(e) => setTrQty(Number(e.target.value) || 1)} />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      const v = variants.find((x) => x.id === trVariant);
                      if (!v) return;
                      setTrItems((prev) => [
                        ...prev.filter((x) => x.variant_id !== v.id),
                        {
                          variant_id: v.id,
                          label: `${v.product_name} (${v.sku})`,
                          qty_sent: trQty,
                          transfer_price: Number(v.avg_cost || 0),
                          gst_rate: Number(v.gst_rate || 5),
                        },
                      ]);
                    }}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {trItems.length > 0 && (
                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-40 overflow-y-auto text-xs">
                    {trItems.map((it) => (
                      <div key={it.variant_id} className="p-2 flex items-center justify-between gap-2">
                        <span className="truncate font-medium">{it.label}</span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="info">{it.qty_sent} pcs</Badge>
                          <button
                            type="button"
                            onClick={() => setTrItems((prev) => prev.filter((x) => x.variant_id !== it.variant_id))}
                            className="text-rose-500 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div><Label>Transport</Label><Input value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="VRL / Safe" /></div>
                  <div><Label>LR No</Label><Input value={lrNo} onChange={(e) => setLrNo(e.target.value)} /></div>
                  <div><Label>Vehicle No</Label><Input value={vehicleNo} onChange={(e) => setVehicleNo(e.target.value)} placeholder="DL01AB1234" /></div>
                </div>

                {estimatedTransferValue >= 50000 && (
                  <div>
                    <Label>E-Way Bill No (Recommended ≥ ₹50,000)</Label>
                    <Input value={ewayBillNo} onChange={(e) => setEwayBillNo(e.target.value)} placeholder="12-digit EWB No" />
                  </div>
                )}

                <Button
                  className="w-full"
                  onClick={async () => {
                    const itemsToSend =
                      trItems.length > 0
                        ? trItems
                        : (() => {
                            const v = variants.find((x) => x.id === trVariant);
                            return v
                              ? [{ variant_id: v.id, qty_sent: trQty, transfer_price: Number(v.avg_cost || 0), gst_rate: Number(v.gst_rate || 5) }]
                              : [];
                          })();
                    if (itemsToSend.length === 0) return toast.error("Add at least one variant.");
                    try {
                      const tid = await createAndDispatchTransferAction({
                        fromBranchId: fromBranch,
                        toBranchId: toBranch,
                        transportName: transport,
                        lrNumber: lrNo,
                        vehicleNo,
                        ewayBillNo,
                        items: itemsToSend,
                      });
                      setTrItems([]);
                      toast.success("Transfer dispatched!");
                      router.push(`/dashboard/transfers/${tid}/challan`);
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Dispatch failed");
                    }
                  }}
                >
                  <Truck className="h-4 w-4" /> Dispatch &amp; Print Document ({trItems.length || 1} SKU)
                </Button>
              </CardContent>
            </Card>
          )}

          <Card className={canDispatch && branches.length >= 2 ? "lg:col-span-7" : "lg:col-span-12"}>
            <CardHeader><h3 className="text-sm font-semibold">Transfer History</h3></CardHeader>
            <CardContent className="space-y-2">
              {transfers.map((tr) => (
                <div key={tr.id} className="rounded-xl border border-slate-200 p-3 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-slate-900">
                      {tr.doc_number} • {tr.from_name} → {tr.to_name}
                    </p>
                    <p className="text-slate-500">
                      {tr.doc_type === "branch_transfer_invoice" ? "IGST Tax Invoice" : "Delivery Challan"} • Value: ₹{Number(tr.transfer_value).toLocaleString("en-IN")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={tr.status === "received" ? "success" : tr.status === "partial_received" ? "info" : "warning"}>
                      {tr.status}
                    </Badge>
                    <Link
                      href={`/dashboard/transfers/${tr.id}/challan`}
                      className="inline-flex items-center gap-1 rounded border border-slate-300 px-2 py-1 hover:bg-slate-50"
                    >
                      <Printer className="h-3.5 w-3.5" /> View
                    </Link>
                    {tr.status === "dispatched" && canReceive && (
                      <Button size="sm" onClick={() => openReceiveModal({ id: tr.id, doc_number: tr.doc_number })}>
                        Receive / Verify
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "production" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Log Factory Production Batch</h3></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Factory Branch</Label>
                  <Select value={prodBranch} onChange={(e) => setProdBranch(e.target.value)}>
                    {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Stage</Label>
                  <Select value={prodStage} onChange={(e) => setProdStage(e.target.value as ProductionStage)}>
                    <option value="cutting">Cutting (WIP)</option>
                    <option value="stitching">Stitching (WIP)</option>
                    <option value="lasting">Lasting (WIP)</option>
                    <option value="finishing">Finishing (WIP)</option>
                    <option value="packed">Packed (Credits Stock)</option>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div><Label>Unit Cost ₹</Label><Input type="number" min={0} value={prodCost} onChange={(e) => setProdCost(Number(e.target.value))} /></div>
                <div><Label>Karigar / Unit</Label><Input value={karigar} onChange={(e) => setKarigar(e.target.value)} placeholder="Unit A / Karigar Name" /></div>
              </div>

              {ratioPresets.length > 0 && models.length > 0 && (
                <div className="space-y-2">
                  <Label>Quick Fill Carton Size-Run</Label>
                  <Select value={prodModelForRatio} onChange={(e) => setProdModelForRatio(e.target.value)}>
                    {models.map((m) => <option key={m.code} value={m.code}>{m.name} ({m.code})</option>)}
                  </Select>
                  <SizeRunQuickFill
                    presets={ratioPresets}
                    onApply={(ratios) => applyRatioToList(prodModelForRatio, ratios, "production")}
                  />
                </div>
              )}

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label>Add Variant</Label>
                  <Select value={prodVariant} onChange={(e) => setProdVariant(e.target.value)}>
                    {variants.map((v) => <option key={v.id} value={v.id}>{v.product_name} — {v.sku}</option>)}
                  </Select>
                </div>
                <div className="w-20">
                  <Label>Qty</Label>
                  <Input type="number" min={1} value={prodQty} onChange={(e) => setProdQty(Number(e.target.value) || 1)} />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const v = variants.find((x) => x.id === prodVariant);
                    if (!v) return;
                    setProdItems((prev) => [
                      ...prev.filter((x) => x.variant_id !== v.id),
                      { variant_id: v.id, label: `${v.product_name} (${v.sku})`, qty: prodQty, unit_cost: prodCost },
                    ]);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {prodItems.length > 0 && (
                <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-36 overflow-y-auto text-xs">
                  {prodItems.map((it) => (
                    <div key={it.variant_id} className="p-2 flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{it.label}</span>
                      <div className="flex items-center gap-2">
                        <Badge variant="info">{it.qty} @ ₹{it.unit_cost}</Badge>
                        <button type="button" onClick={() => setProdItems((p) => p.filter((x) => x.variant_id !== it.variant_id))} className="text-rose-500">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                className="w-full"
                onClick={async () => {
                  const items = prodItems.length > 0 ? prodItems : [{ variant_id: prodVariant, qty: prodQty, unit_cost: prodCost }];
                  try {
                    await recordProductionBatchAction({
                      branchId: prodBranch,
                      stage: prodStage,
                      karigarUnitName: karigar,
                      items,
                    });
                    setProdItems([]);
                    toast.success("Production batch logged.");
                    router.refresh();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed");
                  }
                }}
              >
                Save Production Batch
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Recent Batches</h3></CardHeader>
            <CardContent className="space-y-2">
              {batches.map((b) => (
                <div key={b.id} className="rounded-lg border border-slate-200 p-3 text-xs flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <p className="font-bold">{b.batch_number} • {b.total_units} units</p>
                    <p className="text-slate-500">Stage: {b.stage} {b.karigar_unit_name ? `• Karigar: ${b.karigar_unit_name}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={b.stage === "packed" ? "success" : "info"}>{b.stage}</Badge>
                    {b.stage !== "packed" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await advanceProductionBatchStageAction(b.id, "packed");
                            toast.success(`Batch ${b.batch_number} marked Packed & credited to stock!`);
                            router.refresh();
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : "Failed");
                          }
                        }}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" /> Mark Packed
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "suppliers" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h3 className="text-sm font-semibold">{editSupId ? "Edit Supplier" : "Add Supplier"}</h3>
              {suppliers.length > 0 && (
                <Button size="sm" variant="secondary" onClick={() => { setPoSupplierId(suppliers[0].id); setPoOpen(true); }}>
                  <ShoppingBag className="h-3.5 w-3.5" /> Record Purchase Order
                </Button>
              )}
            </CardHeader>
            <CardContent>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (editSupId) {
                    await updateSupplierAction({ id: editSupId, name: supName, phone: supPhone, materialType: supMat });
                    toast.success("Supplier updated.");
                  } else {
                    await createSupplierAction({ name: supName, phone: supPhone, materialType: supMat });
                    toast.success("Supplier added.");
                  }
                  setEditSupId(null); setSupName(""); setSupPhone(""); setSupMat("");
                  router.refresh();
                }}
                className="space-y-3"
              >
                <div><Label>Supplier Name *</Label><Input value={supName} onChange={(e) => setSupName(e.target.value)} required /></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>Phone</Label><Input value={supPhone} onChange={(e) => setSupPhone(e.target.value)} /></div>
                  <div><Label>Material Type</Label><Input value={supMat} onChange={(e) => setSupMat(e.target.value)} placeholder="Leather / Soles" /></div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit"><Plus className="h-4 w-4" /> {editSupId ? "Update Supplier" : "Save Supplier"}</Button>
                  {editSupId && (
                    <Button variant="outline" onClick={() => { setEditSupId(null); setSupName(""); setSupPhone(""); setSupMat(""); }}>
                      Cancel
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Suppliers &amp; Dues</h3></CardHeader>
            <CardContent className="space-y-2">
              {suppliers.map((s) => (
                <div key={s.id} className="rounded-xl border border-slate-200 p-3 text-xs flex flex-wrap justify-between items-center gap-2">
                  <div>
                    <p className="font-bold text-slate-900">{s.name}</p>
                    <p className="text-slate-500">{s.material_type || "General"} • {s.phone || "—"}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-rose-600 mr-1">Due: ₹{Number(s.current_due).toLocaleString("en-IN")}</span>
                    <Button size="sm" variant="ghost" onClick={() => { setPoSupplierId(s.id); setPoOpen(true); }}>
                      + Bill
                    </Button>
                    {Number(s.current_due) > 0 && (
                      <Button size="sm" variant="outline" onClick={() => { setPaySup({ id: s.id, name: s.name, due: Number(s.current_due) }); setPayAmt(Number(s.current_due)); }}>
                        Pay
                      </Button>
                    )}
                    <button
                      type="button"
                      title="Edit Supplier"
                      onClick={() => {
                        setEditSupId(s.id);
                        setSupName(s.name);
                        setSupPhone(s.phone ?? "");
                        setSupMat(s.material_type ?? "");
                      }}
                      className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-50 cursor-pointer"
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
                          toast.success("Supplier deleted.");
                          router.refresh();
                        } catch (err) {
                          toast.error(err instanceof Error ? err.message : "Cannot delete supplier with purchase history.");
                        }
                      }}
                      className="rounded-lg bg-rose-500 p-1.5 text-white hover:bg-rose-600 cursor-pointer"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Receive & Discrepancy Modal */}
      <Dialog
        open={Boolean(receiveTarget)}
        onClose={() => setReceiveTarget(null)}
        title={`Receive Transfer — ${receiveTarget?.doc_number ?? ""}`}
        subtitle="Verify received quantities and note any transit shortages or damage."
        maxWidth="max-w-2xl"
      >
        {receiveLoading ? (
          <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading dispatched items...
          </div>
        ) : (
          <form
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
                toast.success("Transfer verified & credited into destination branch stock!");
                setReceiveTarget(null);
                router.refresh();
              } catch (err) {
                toast.error(err instanceof Error ? err.message : "Receive failed");
              }
            }}
            className="space-y-3"
          >
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {receiveRows.map((row, idx) => (
                <div key={row.variant_id} className="rounded-lg border border-slate-200 p-3 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-bold">{row.product_name}</p>
                      <p className="text-slate-500">{row.sku} • Dispatched: <strong>{row.qty_sent}</strong></p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>Recd:</span>
                      <input
                        type="number"
                        min={0}
                        max={row.qty_sent}
                        value={row.qty_received}
                        onChange={(e) => {
                          const q = Math.max(0, Number(e.target.value) || 0);
                          setReceiveRows((prev) => prev.map((r, i) => (i === idx ? { ...r, qty_received: q } : r)));
                        }}
                        className="w-16 min-h-[36px] rounded border border-slate-300 text-center font-semibold"
                      />
                    </div>
                  </div>
                  {row.qty_received !== row.qty_sent && (
                    <Input
                      placeholder="Discrepancy note (e.g. 2 pairs damaged in transit)"
                      value={row.discrepancy_note}
                      onChange={(e) =>
                        setReceiveRows((prev) =>
                          prev.map((r, i) => (i === idx ? { ...r, discrepancy_note: e.target.value } : r))
                        )
                      }
                    />
                  )}
                </div>
              ))}
            </div>
            <Button type="submit" className="w-full">Confirm Receipt &amp; Credit Stock</Button>
          </form>
        )}
      </Dialog>

      {/* Record Purchase Order Modal */}
      <Dialog open={poOpen} onClose={() => setPoOpen(false)} title="Record Supplier Purchase / Inward Bill" maxWidth="max-w-lg">
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            const base = poQty * poUnitCost;
            const gst = Number(((base * poGstRate) / 100).toFixed(2));
            const lineTotal = base + gst;
            const selVar = variants.find((v) => v.id === poVariantId);
            try {
              await recordPurchaseAction({
                branchId: poBranchId,
                supplierId: poSupplierId,
                billNumber: poBillNo,
                purchaseType: poType,
                paidAmount: poPaid,
                itcCgst: Number((gst / 2).toFixed(2)),
                itcSgst: Number((gst / 2).toFixed(2)),
                itcIgst: 0,
                items: [
                  {
                    variant_id: poType === "finished_goods" ? poVariantId : null,
                    item_description: poType === "finished_goods" && selVar ? `${selVar.product_name} (${selVar.sku})` : poDesc || "Raw Material",
                    qty: poQty,
                    unit_cost: poUnitCost,
                    gst_rate: poGstRate,
                    line_total: lineTotal,
                  },
                ],
              });
              toast.success(poType === "finished_goods" ? "Purchase recorded & stock credited!" : "Raw material purchase recorded!");
              setPoOpen(false);
              setPoBillNo("");
              setPoDesc("");
              router.refresh();
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Purchase failed");
            }
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Supplier</Label>
              <Select value={poSupplierId} onChange={(e) => setPoSupplierId(e.target.value)}>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
            <div>
              <Label>Branch</Label>
              <Select value={poBranchId} onChange={(e) => setPoBranchId(e.target.value)}>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Purchase Type</Label>
              <Select value={poType} onChange={(e) => setPoType(e.target.value as "finished_goods" | "raw_material")}>
                <option value="finished_goods">Finished Goods (Adds Stock)</option>
                <option value="raw_material">Raw Material (Leather/Soles)</option>
              </Select>
            </div>
            <div><Label>Supplier Bill No</Label><Input value={poBillNo} onChange={(e) => setPoBillNo(e.target.value)} placeholder="INV-8821" /></div>
          </div>
          {poType === "finished_goods" ? (
            <div>
              <Label>Variant to Stock</Label>
              <Select value={poVariantId} onChange={(e) => setPoVariantId(e.target.value)}>
                {variants.map((v) => <option key={v.id} value={v.id}>{v.product_name} — {v.sku}</option>)}
              </Select>
            </div>
          ) : (
            <div><Label>Raw Material Description</Label><Input value={poDesc} onChange={(e) => setPoDesc(e.target.value)} placeholder="Italian Calf Leather 200 sq.ft" required /></div>
          )}
          <div className="grid grid-cols-3 gap-2">
            <div><Label>Qty</Label><Input type="number" min={1} value={poQty} onChange={(e) => setPoQty(Number(e.target.value) || 1)} /></div>
            <div><Label>Unit Cost ₹</Label><Input type="number" min={0} value={poUnitCost} onChange={(e) => setPoUnitCost(Number(e.target.value) || 0)} /></div>
            <div><Label>GST % (ITC)</Label><Input type="number" min={0} max={40} value={poGstRate} onChange={(e) => setPoGstRate(Number(e.target.value) || 0)} /></div>
          </div>
          <div>
            <Label>Amount Paid Now ₹ (Total incl. GST: ₹{Math.round(poQty * poUnitCost * (1 + poGstRate / 100)).toLocaleString("en-IN")})</Label>
            <Input type="number" min={0} value={poPaid} onChange={(e) => setPoPaid(Number(e.target.value) || 0)} />
          </div>
          <Button type="submit" className="w-full">Save Purchase Order</Button>
        </form>
      </Dialog>

      <Dialog open={Boolean(paySup)} onClose={() => setPaySup(null)} title={`Pay Supplier — ${paySup?.name ?? ""}`}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!paySup) return;
            await recordSupplierPaymentAction({ supplierId: paySup.id, amount: payAmt, mode: payMode });
            toast.success("Supplier payment recorded.");
            setPaySup(null);
            router.refresh();
          }}
          className="space-y-3"
        >
          <div><Label>Amount ₹</Label><Input type="number" min={1} value={payAmt} onChange={(e) => setPayAmt(Number(e.target.value))} required /></div>
          <div>
            <Label>Mode</Label>
            <Select value={payMode} onChange={(e) => setPayMode(e.target.value as PaymentMode)}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="upi">UPI</option>
              <option value="cash">Cash</option>
            </Select>
          </div>
          <Button type="submit" className="w-full">Record Payment</Button>
        </form>
      </Dialog>
    </div>
  );
}
