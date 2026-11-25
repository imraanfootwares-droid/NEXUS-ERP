"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createProductWithVariantsAction, recordPurchaseAction } from "@/actions/inventory";
import { generateVariantCombinations } from "@/lib/catalog/verticals";
import { Button, Dialog, Form, Input, Label, Select, friendlyErrorMessage } from "@/components/ui/primitives";

export interface PurchaseCatalogVariant {
  variant_id: string;
  product_id: string;
  product_name: string;
  model_code: string;
  supplier_id: string | null;
  attributes: Record<string, string>;
  cost_price: number;
  gst_rate: number;
}

type PayMode = "cash" | "upi" | "bank_transfer" | "card";

type EntryMode = "size" | "total" | "cartons";

interface ProductBlock {
  key: string;
  productId: string;
  cost: string;
  mode: EntryMode;
  qty: Record<string, string>; // "size" mode: variant_id -> pairs typed
  total: string; // "total" mode: all pairs together (mixed sizes)
  cartons: string; // "cartons" mode
  perCarton: string; // pairs in each carton
  colour: string; // "" = all colours shared equally
  split: string; // "equal" or a size-ratio preset name
}

export interface SizeRatioPreset {
  name: string;
  ratios: Record<string, number>;
}

const normSize = (s: string) => s.replace(/\s+/g, "").toLowerCase();

/** Spread `total` pairs over variants by weight; whole pairs only, nothing lost. */
function spread(total: number, targets: Array<{ id: string; w: number }>): Record<string, number> {
  const out: Record<string, number> = {};
  const live = targets.filter((t) => t.w > 0);
  const sumW = live.reduce((s, t) => s + t.w, 0);
  if (total <= 0 || sumW <= 0) return out;
  const whole = Math.floor(total);
  const raw = live.map((t) => ({ id: t.id, exact: (whole * t.w) / sumW }));
  let given = 0;
  for (const r of raw) {
    out[r.id] = Math.floor(r.exact);
    given += out[r.id];
  }
  raw
    .sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)))
    .slice(0, whole - given)
    .forEach((r) => (out[r.id] += 1));
  return out;
}

interface OtherLine {
  key: string;
  name: string;
  qty: string;
  rate: string;
}

const attr = (a: Record<string, string>, names: string[]) => {
  for (const [k, v] of Object.entries(a ?? {})) if (names.includes(k.toLowerCase())) return v;
  return "";
};
const sizeSort = (x: string, y: string) => {
  const nx = parseFloat(x.replace(/[^0-9.]/g, ""));
  const ny = parseFloat(y.replace(/[^0-9.]/g, ""));
  if (!Number.isNaN(nx) && !Number.isNaN(ny) && nx !== ny) return nx - ny;
  return x.localeCompare(y);
};
const num = (s: string) => Math.max(0, Number(s || 0) || 0);
const money = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
let seq = 0;
const nextKey = () => `k${++seq}`;

/** One supplier bill with many products, sizes and colours. Saving adds the goods to stock. */
export function PurchaseBillDialog({
  open,
  onClose,
  supplierId,
  supplierName,
  branches,
  catalog,
  ratioPresets = [],
}: {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  supplierName: string;
  branches: Array<{ id: string; name: string }>;
  catalog: PurchaseCatalogVariant[];
  ratioPresets?: SizeRatioPreset[];
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [billNo, setBillNo] = useState("");
  const [blocks, setBlocks] = useState<ProductBlock[]>([]);
  const [others, setOthers] = useState<OtherLine[]>([]);
  const [paid, setPaid] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("cash");
  const [picker, setPicker] = useState("");

  // Quick Create New Product inline inside Purchase Bill (eliminates double-entry!)
  const [extraCatalog, setExtraCatalog] = useState<PurchaseCatalogVariant[]>([]);
  const [newProdOpen, setNewProdOpen] = useState(false);
  const [npName, setNpName] = useState("");
  const [npCode, setNpCode] = useState("");
  const [npSizes, setNpSizes] = useState("UK 6, UK 7, UK 8, UK 9");
  const [npColours, setNpColours] = useState("Black, Tan");
  const [npCost, setNpCost] = useState("");
  const [npSell, setNpSell] = useState("");
  const [npHsn, setNpHsn] = useState("6403");
  const [npGst, setNpGst] = useState("5");
  const [npSaving, setNpSaving] = useState(false);

  const mergedCatalog = useMemo(() => {
    const byVariant = new Map<string, PurchaseCatalogVariant>();
    for (const v of catalog) byVariant.set(v.variant_id, v);
    for (const v of extraCatalog) byVariant.set(v.variant_id, v);
    return Array.from(byVariant.values());
  }, [catalog, extraCatalog]);

  const products = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string; mine: boolean; variants: PurchaseCatalogVariant[] }>();
    for (const v of mergedCatalog) {
      const p = map.get(v.product_id) ?? { id: v.product_id, name: v.product_name, code: v.model_code, mine: v.supplier_id === supplierId, variants: [] };
      p.variants.push(v);
      map.set(v.product_id, p);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [mergedCatalog, supplierId]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  /** Pairs per variant for a product, whatever way they were entered. */
  const qtyFor = (b: ProductBlock): Record<string, number> => {
    const p = productById.get(b.productId);
    if (!p) return {};
    if (b.mode === "size") {
      const out: Record<string, number> = {};
      for (const [vid, q] of Object.entries(b.qty)) if (num(q) > 0) out[vid] = num(q);
      return out;
    }
    const total = b.mode === "cartons" ? num(b.cartons) * num(b.perCarton) : num(b.total);
    const preset = ratioPresets.find((r) => r.name === b.split);
    const ratioBySize = preset
      ? new Map(Object.entries(preset.ratios).map(([k, v]) => [normSize(k), Number(v) || 0]))
      : null;
    let targets = p.variants
      .filter((v) => !b.colour || attr(v.attributes, ["colour", "color"]) === b.colour)
      .map((v) => ({ id: v.variant_id, w: ratioBySize ? ratioBySize.get(normSize(attr(v.attributes, ["size"]))) ?? 0 : 1 }));
    if (targets.every((t) => t.w <= 0)) targets = targets.map((t) => ({ ...t, w: 1 }));
    return spread(total, targets);
  };
  const blockTotals = (b: ProductBlock) => {
    const pairs = Object.values(qtyFor(b)).reduce((s, q) => s + q, 0);
    return { pairs, amount: pairs * num(b.cost) };
  };
  const namedOthers = others.filter((o) => o.name.trim());
  const totalPairs = blocks.reduce((s, b) => s + blockTotals(b).pairs, 0);
  const billTotal =
    blocks.reduce((s, b) => s + blockTotals(b).amount, 0) + namedOthers.reduce((s, o) => s + num(o.qty) * num(o.rate), 0);
  const paidNum = Math.min(billTotal, num(paid));

  const reset = () => {
    setBillNo("");
    setBlocks([]);
    setOthers([]);
    setPaid("");
    setPayMode("cash");
    setPicker("");
  };

  const addProduct = (productId: string) => {
    const p = productById.get(productId);
    if (!p) return;
    if (blocks.some((b) => b.productId === productId)) {
      toast.info(`${p.name} is already in this bill.`);
      return;
    }
    setBlocks((prev) => [
      ...prev,
      {
        key: nextKey(),
        productId,
        cost: String(p.variants[0]?.cost_price || ""),
        mode: "size",
        qty: {},
        total: "",
        cartons: "",
        perCarton: "12",
        colour: "",
        split: "equal",
      },
    ]);
  };

  return (
    <Dialog open={open} onClose={onClose} title={`New Purchase Bill — ${supplierName}`} subtitle="Goods you add here go into stock automatically." maxWidth="max-w-3xl">
      <Form
        onSubmit={async (e) => {
          e.preventDefault();
          const items: Array<{ variant_id: string | null; item_description: string; qty: number; unit_cost: number; gst_rate: number; line_total: number }> = [];
          for (const b of blocks) {
            const p = productById.get(b.productId);
            if (!p) continue;
            const qMap = qtyFor(b);
            for (const v of p.variants) {
              const q = qMap[v.variant_id] ?? 0;
              if (q <= 0) continue;
              const label = Object.values(v.attributes ?? {}).filter(Boolean).join(" / ");
              items.push({
                variant_id: v.variant_id,
                item_description: `${p.name}${label ? ` — ${label}` : ""}`,
                qty: q,
                unit_cost: num(b.cost),
                gst_rate: v.gst_rate,
                line_total: q * num(b.cost),
              });
            }
          }
          for (const o of others) {
            if (!o.name.trim() || num(o.qty) <= 0) continue;
            items.push({ variant_id: null, item_description: o.name.trim(), qty: num(o.qty), unit_cost: num(o.rate), gst_rate: 0, line_total: num(o.qty) * num(o.rate) });
          }
          if (!branchId) return void toast.error("Choose the branch that receives the goods.");
          if (items.length === 0) return void toast.error("Type how many pairs you bought for at least one size.");
          try {
            const res = await recordPurchaseAction({
              branchId,
              supplierId,
              billNumber: billNo || undefined,
              purchaseType: "finished_goods",
              paidAmount: paidNum,
              paidMode: payMode,
              itcCgst: 0,
              itcSgst: 0,
              itcIgst: 0,
              items,
            });
            if (!res.ok) return void toast.error(res.error);
            toast.success(`Purchase saved: ${money(res.total)}. Stock added.`);
            reset();
            onClose();
            router.refresh();
          } catch (err) {
            toast.error(friendlyErrorMessage(err, "Could not save the purchase. Please try again."));
          }
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Goods go into branch *</Label>
            <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Supplier Bill No. (Optional)</Label>
            <Input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="e.g. INV-102" />
          </div>
        </div>

        <div className="space-y-3">
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <Label className="!mb-0">Add a product</Label>
              <button
                type="button"
                onClick={() => setNewProdOpen((v) => !v)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-1 text-[11.5px] font-semibold text-emerald-800 hover:bg-emerald-100"
              >
                <Plus className="h-3.5 w-3.5" />
                {newProdOpen ? "Close New Product" : "Create New Product"}
              </button>
            </div>
            <Select
              value={picker}
              onChange={(e) => {
                if (e.target.value) addProduct(e.target.value);
                setPicker("");
              }}
              aria-label="Add a product to this bill"
            >
              <option value="">+ Choose an existing product…</option>
              {products.some((p) => p.mine) && (
                <optgroup label={`From ${supplierName}`}>
                  {products.filter((p) => p.mine).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="All products">
                {products.filter((p) => !p.mine).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.code})</option>
                ))}
              </optgroup>
            </Select>
            {products.length === 0 && !newProdOpen && (
              <p className="mt-1 text-[11.5px] text-slate-500">
                No products yet. Click <strong>+ Create New Product</strong> above to create and add it in one step.
              </p>
            )}
          </div>

          {newProdOpen && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-3.5">
              <div>
                <p className="text-xs font-bold text-emerald-950">Create New Product &amp; Add to This Bill</p>
                <p className="text-[11px] text-emerald-800">
                  Creates the product in your catalog and adds it straight to this purchase bill — no need to type it twice.
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <Label>Product Name *</Label>
                  <Input value={npName} onChange={(e) => setNpName(e.target.value)} placeholder="e.g. Ladies Ortho Art 305" />
                </div>
                <div>
                  <Label>Model / Article Code *</Label>
                  <Input value={npCode} onChange={(e) => setNpCode(e.target.value)} placeholder="e.g. ART-305" />
                </div>
                <div>
                  <Label>Sizes (comma-separated)</Label>
                  <Input value={npSizes} onChange={(e) => setNpSizes(e.target.value)} placeholder="e.g. UK 6, UK 7, UK 8" />
                </div>
                <div>
                  <Label>Colours (comma-separated)</Label>
                  <Input value={npColours} onChange={(e) => setNpColours(e.target.value)} placeholder="e.g. Black, Tan" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                <div>
                  <Label>Buy Cost ₹</Label>
                  <Input inputMode="decimal" value={npCost} onChange={(e) => setNpCost(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 210" />
                </div>
                <div>
                  <Label>Sell Price ₹</Label>
                  <Input inputMode="decimal" value={npSell} onChange={(e) => setNpSell(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 499" />
                </div>
                <div>
                  <Label>HSN Code</Label>
                  <Input value={npHsn} onChange={(e) => setNpHsn(e.target.value)} placeholder="6403" />
                </div>
                <div>
                  <Label>GST %</Label>
                  <Input inputMode="decimal" value={npGst} onChange={(e) => setNpGst(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="5" />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setNewProdOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={npSaving}
                  onClick={async () => {
                    if (!npName.trim() || !npCode.trim()) {
                      toast.error("Enter both Product Name and Model Code.");
                      return;
                    }
                    setNpSaving(true);
                    try {
                      const sizesArr = npSizes.split(",").map((s) => s.trim()).filter(Boolean);
                      const colsArr = npColours.split(",").map((s) => s.trim()).filter(Boolean);
                      const axesInput: Array<{ name: string; values: string[] }> = [];
                      if (sizesArr.length > 0) axesInput.push({ name: "size", values: sizesArr });
                      if (colsArr.length > 0) axesInput.push({ name: "colour", values: colsArr });
                      const combinations = axesInput.length > 0 ? generateVariantCombinations(axesInput) : [{}];
                      const costNum = num(npCost);
                      const sellNum = num(npSell) || costNum;
                      const res = await createProductWithVariantsAction({
                        modelCode: npCode.trim(),
                        name: npName.trim(),
                        uom: "Pair",
                        hsnCode: npHsn.trim() || "6403",
                        gstRate: num(npGst),
                        customFields: {},
                        costPrice: costNum,
                        mrp: sellNum,
                        sellingPrice: sellNum,
                        wholesalePrice: sellNum,
                        lowStockThreshold: 10,
                        combinations,
                        supplierId,
                      });
                      if (!res.ok) {
                        toast.error(res.error);
                        return;
                      }
                      const createdVariants = res.variants ?? [];
                      setExtraCatalog((prev) => [...prev, ...createdVariants]);
                      setBlocks((prev) => [
                        ...prev,
                        {
                          key: nextKey(),
                          productId: res.productId,
                          cost: costNum > 0 ? String(costNum) : "",
                          mode: "size",
                          qty: {},
                          total: "",
                          cartons: "",
                          perCarton: "12",
                          colour: "",
                          split: "equal",
                        },
                      ]);
                      toast.success(`"${npName.trim()}" created & added to this bill!`);
                      setNpName("");
                      setNpCode("");
                      setNpCost("");
                      setNpSell("");
                      setNewProdOpen(false);
                    } catch (err) {
                      toast.error(friendlyErrorMessage(err, "Could not create product."));
                    } finally {
                      setNpSaving(false);
                    }
                  }}
                >
                  {npSaving ? "Creating..." : "Create & Add to Bill"}
                </Button>
              </div>
            </div>
          )}

          {blocks.map((b) => {
            const p = productById.get(b.productId);
            if (!p) return null;
            const sizes = Array.from(new Set(p.variants.map((v) => attr(v.attributes, ["size"])))).sort(sizeSort);
            const colours = Array.from(new Set(p.variants.map((v) => attr(v.attributes, ["colour", "color"]))));
            const cell = new Map(p.variants.map((v) => [`${attr(v.attributes, ["colour", "color"])}|${attr(v.attributes, ["size"])}`, v]));
            const t = blockTotals(b);
            const qMap = qtyFor(b);
            const patch = (changes: Partial<ProductBlock>) =>
              setBlocks((prev) => prev.map((x) => (x.key === b.key ? { ...x, ...changes } : x)));
            const setQty = (vid: string, val: string) =>
              setBlocks((prev) => prev.map((x) => (x.key === b.key ? { ...x, qty: { ...x.qty, [vid]: val.replace(/[^0-9]/g, "") } } : x)));
            const sizeSet = new Set(sizes.map(normSize));
            const usablePresets = ratioPresets.filter((r) => Object.keys(r.ratios).some((k) => sizeSet.has(normSize(k))));
            const editBySize = () => {
              const q: Record<string, string> = {};
              for (const [vid, n] of Object.entries(qMap)) if (n > 0) q[vid] = String(n);
              patch({ mode: "size", qty: q });
            };
            return (
              <div key={b.key} className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-slate-900">{p.name}</p>
                    <p className="text-[11.5px] text-slate-500">{p.code}</p>
                  </div>
                  <div className="flex items-end gap-2">
                    <div className="w-28">
                      <Label>Cost / pair ₹</Label>
                      <Input
                        inputMode="decimal"
                        value={b.cost}
                        onChange={(e) => setBlocks((prev) => prev.map((x) => (x.key === b.key ? { ...x, cost: e.target.value.replace(/[^0-9.]/g, "") } : x)))}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setBlocks((prev) => prev.filter((x) => x.key !== b.key))}
                      className="mb-0.5 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 md:h-[34px] md:w-[34px]"
                      aria-label={`Remove ${p.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-1 rounded-lg bg-[#ececee] p-[3px]" role="group" aria-label="How to enter quantity">
                  {([
                    ["size", "By size"],
                    ["total", "Total pairs"],
                    ["cartons", "Cartons"],
                  ] as const).map(([m, label]) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={b.mode === m}
                      onClick={() => patch({ mode: m })}
                      className={`min-h-[36px] cursor-pointer rounded-md px-2 text-[12.5px] font-semibold transition-all ${
                        b.mode === m ? "bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,.1)]" : "text-[#55555b] hover:text-[#171717]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {b.mode !== "size" && (
                  <div className="space-y-2.5 rounded-lg bg-white p-2.5 shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {b.mode === "total" ? (
                        <div className="col-span-2 sm:col-span-1">
                          <Label>Total pairs</Label>
                          <Input inputMode="numeric" value={b.total} onChange={(e) => patch({ total: e.target.value.replace(/[^0-9]/g, "") })} placeholder="e.g. 30" />
                        </div>
                      ) : (
                        <>
                          <div>
                            <Label>Cartons</Label>
                            <Input inputMode="numeric" value={b.cartons} onChange={(e) => patch({ cartons: e.target.value.replace(/[^0-9]/g, "") })} placeholder="e.g. 5" />
                          </div>
                          <div>
                            <Label>Pairs in 1 carton</Label>
                            <Input inputMode="numeric" value={b.perCarton} onChange={(e) => patch({ perCarton: e.target.value.replace(/[^0-9]/g, "") })} placeholder="e.g. 12" />
                          </div>
                        </>
                      )}
                      {colours.filter(Boolean).length > 1 && (
                        <div>
                          <Label>Colour</Label>
                          <Select value={b.colour} onChange={(e) => patch({ colour: e.target.value })}>
                            <option value="">Mixed colours</option>
                            {colours.filter(Boolean).map((c) => (
                              <option key={c} value={c}>{c} only</option>
                            ))}
                          </Select>
                        </div>
                      )}
                      {sizes.filter(Boolean).length > 1 && (
                        <div>
                          <Label>Sizes</Label>
                          <Select value={b.split} onChange={(e) => patch({ split: e.target.value })}>
                            <option value="equal">Mixed (equal)</option>
                            {usablePresets.map((r) => (
                              <option key={r.name} value={r.name}>{r.name}</option>
                            ))}
                          </Select>
                        </div>
                      )}
                    </div>
                    {b.mode === "cartons" && num(b.cartons) > 0 && (
                      <p className="text-[12.5px] font-medium text-slate-700">
                        {num(b.cartons)} cartons × {num(b.perCarton)} pairs = <b>{(num(b.cartons) * num(b.perCarton)).toLocaleString("en-IN")} pairs</b>
                      </p>
                    )}
                    {t.pairs > 0 && (
                      <div className="space-y-1.5">
                        <p className="text-[11.5px] text-slate-500">Goes into stock like this:</p>
                        <div className="flex flex-wrap gap-1">
                          {p.variants
                            .filter((v) => (qMap[v.variant_id] ?? 0) > 0)
                            .sort((x, y) => sizeSort(attr(x.attributes, ["size"]), attr(y.attributes, ["size"])))
                            .map((v) => (
                              <span key={v.variant_id} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11.5px] text-slate-700">
                                {[attr(v.attributes, ["colour", "color"]), attr(v.attributes, ["size"])].filter(Boolean).join(" ")}: {qMap[v.variant_id]}
                              </span>
                            ))}
                        </div>
                        <button type="button" onClick={editBySize} className="cursor-pointer text-[12px] font-semibold text-sky-700 hover:underline">
                          Change pairs size by size →
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {b.mode === "size" && (
                <div className="overflow-x-auto rounded-lg bg-white shadow-[0_0_0_1px_rgba(0,0,0,.06)]">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500">
                        <th className="px-2.5 py-1.5 text-left font-medium">{colours.some(Boolean) ? "Colour ↓  Size →" : "Size →"}</th>
                        {sizes.map((s) => (
                          <th key={s || "-"} className="px-1.5 py-1.5 text-center font-semibold text-slate-700">{s || "—"}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {colours.map((c) => (
                        <tr key={c || "-"} className="border-t border-slate-100">
                          <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-slate-700">{c || "Pairs"}</td>
                          {sizes.map((s) => {
                            const v = cell.get(`${c}|${s}`);
                            return (
                              <td key={s || "-"} className="px-1 py-1 text-center">
                                {v ? (
                                  <input
                                    inputMode="numeric"
                                    aria-label={`${p.name} ${c} ${s} pairs`}
                                    value={b.qty[v.variant_id] ?? ""}
                                    onChange={(e) => setQty(v.variant_id, e.target.value)}
                                    placeholder="0"
                                    className="h-9 w-14 rounded-md border border-slate-200 bg-white text-center font-mono text-[13px] focus:border-slate-900 focus:outline-none"
                                  />
                                ) : (
                                  <span className="text-slate-300">—</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
                <p className="text-right text-[12.5px] text-slate-600">
                  {t.pairs.toLocaleString("en-IN")} pairs × {money(num(b.cost))} = <span className="font-semibold text-slate-900">{money(t.amount)}</span>
                </p>
              </div>
            );
          })}

          {others.map((o) => (
            <div key={o.key} className="grid grid-cols-[1fr_auto] gap-2 rounded-xl border border-dashed border-slate-300 p-3 sm:grid-cols-[1fr_90px_110px_auto]">
              <div className="col-span-2 sm:col-span-1">
                <Label>Other item (not added to stock)</Label>
                <Input value={o.name} onChange={(e) => setOthers((prev) => prev.map((x) => (x.key === o.key ? { ...x, name: e.target.value } : x)))} placeholder="e.g. Soles, Boxes, Transport" />
              </div>
              <div>
                <Label>Qty</Label>
                <Input inputMode="decimal" value={o.qty} onChange={(e) => setOthers((prev) => prev.map((x) => (x.key === o.key ? { ...x, qty: e.target.value.replace(/[^0-9.]/g, "") } : x)))} />
              </div>
              <div>
                <Label>Rate ₹</Label>
                <Input inputMode="decimal" value={o.rate} onChange={(e) => setOthers((prev) => prev.map((x) => (x.key === o.key ? { ...x, rate: e.target.value.replace(/[^0-9.]/g, "") } : x)))} />
              </div>
              <button
                type="button"
                onClick={() => setOthers((prev) => prev.filter((x) => x.key !== o.key))}
                className="mt-auto inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 hover:bg-rose-50 md:h-[34px] md:w-[34px]"
                aria-label="Remove item"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setOthers((prev) => [...prev, { key: nextKey(), name: "", qty: "1", rate: "" }])}
            className="inline-flex cursor-pointer items-center gap-1 text-[12.5px] font-semibold text-sky-700 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> Other item (soles, boxes, transport…)
          </button>
        </div>

        <div className="space-y-3 rounded-xl bg-[#171717] p-3.5 text-white">
          <div className="flex items-center justify-between text-[13px] text-white/70">
            <span>
              {totalPairs.toLocaleString("en-IN")} pairs into stock
              {namedOthers.length > 0 ? ` · ${namedOthers.length} other item${namedOthers.length > 1 ? "s" : ""}` : ""}
            </span>
            <span className="font-mono text-xl font-semibold text-white">{money(billTotal)}</span>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-white/70">Paid today ₹ (Optional)</label>
              <Input inputMode="decimal" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" className="!bg-white !text-[#171717]" />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-medium text-white/70">Paid by</label>
              <Select value={payMode} onChange={(e) => setPayMode(e.target.value as PayMode)} className="!bg-white">
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer / NEFT</option>
                <option value="card">Card</option>
              </Select>
            </div>
          </div>
          <p className="text-[12px] text-white/70">
            Added to {supplierName}&apos;s balance: <span className="font-semibold text-white">{money(Math.max(0, billTotal - paidNum))}</span>
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={totalPairs <= 0 && namedOthers.length === 0}>
            <PackagePlus className="h-4 w-4" /> Save Bill & Add Stock
          </Button>
        </div>
      </Form>
    </Dialog>
  );
}
