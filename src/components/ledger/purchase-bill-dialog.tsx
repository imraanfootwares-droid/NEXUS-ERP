"use client";

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { recordPurchaseAction } from "@/actions/inventory";
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

interface ProductBlock {
  key: string;
  productId: string;
  cost: string;
  qty: Record<string, string>; // variant_id -> qty text
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
}: {
  open: boolean;
  onClose: () => void;
  supplierId: string;
  supplierName: string;
  branches: Array<{ id: string; name: string }>;
  catalog: PurchaseCatalogVariant[];
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [billNo, setBillNo] = useState("");
  const [blocks, setBlocks] = useState<ProductBlock[]>([]);
  const [others, setOthers] = useState<OtherLine[]>([]);
  const [paid, setPaid] = useState("");
  const [payMode, setPayMode] = useState<PayMode>("cash");
  const [picker, setPicker] = useState("");

  const products = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code: string; mine: boolean; variants: PurchaseCatalogVariant[] }>();
    for (const v of catalog) {
      const p = map.get(v.product_id) ?? { id: v.product_id, name: v.product_name, code: v.model_code, mine: v.supplier_id === supplierId, variants: [] };
      p.variants.push(v);
      map.set(v.product_id, p);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [catalog, supplierId]);
  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const blockTotals = (b: ProductBlock) => {
    const pairs = Object.values(b.qty).reduce((s, q) => s + num(q), 0);
    return { pairs, amount: pairs * num(b.cost) };
  };
  const totalPairs = blocks.reduce((s, b) => s + blockTotals(b).pairs, 0) + others.reduce((s, o) => s + num(o.qty), 0);
  const billTotal =
    blocks.reduce((s, b) => s + blockTotals(b).amount, 0) + others.reduce((s, o) => s + num(o.qty) * num(o.rate), 0);
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
    setBlocks((prev) => [...prev, { key: nextKey(), productId, cost: String(p.variants[0]?.cost_price || ""), qty: {} }]);
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
            for (const v of p.variants) {
              const q = num(b.qty[v.variant_id] ?? "");
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
            <Label>Add a product</Label>
            <Select
              value={picker}
              onChange={(e) => {
                if (e.target.value) addProduct(e.target.value);
                setPicker("");
              }}
              aria-label="Add a product to this bill"
            >
              <option value="">+ Choose a product…</option>
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
            {products.length === 0 && (
              <p className="mt-1 text-[11.5px] text-slate-500">No products yet. Add products in Stock first, or use “Other item” below.</p>
            )}
          </div>

          {blocks.map((b) => {
            const p = productById.get(b.productId);
            if (!p) return null;
            const sizes = Array.from(new Set(p.variants.map((v) => attr(v.attributes, ["size"])))).sort(sizeSort);
            const colours = Array.from(new Set(p.variants.map((v) => attr(v.attributes, ["colour", "color"]))));
            const cell = new Map(p.variants.map((v) => [`${attr(v.attributes, ["colour", "color"])}|${attr(v.attributes, ["size"])}`, v]));
            const t = blockTotals(b);
            const setQty = (vid: string, val: string) =>
              setBlocks((prev) => prev.map((x) => (x.key === b.key ? { ...x, qty: { ...x.qty, [vid]: val.replace(/[^0-9.]/g, "") } } : x)));
            return (
              <div key={b.key} className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-semibold text-slate-900">{p.name}</p>
                    <p className="text-[11.5px] text-slate-500">{p.code} · type pairs for each size</p>
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
            <span>{totalPairs.toLocaleString("en-IN")} pairs / items</span>
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
          <Button type="submit" disabled={billTotal <= 0 && totalPairs <= 0}>
            <PackagePlus className="h-4 w-4" /> Save Bill & Add Stock
          </Button>
        </div>
      </Form>
    </Dialog>
  );
}
