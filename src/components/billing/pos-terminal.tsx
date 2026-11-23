"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Layers, Plus, Printer, Save, Search, ShoppingCart, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createOrFinalizeInvoiceAction } from "@/actions/billing";
import { GstinInput, SizeRunQuickFill } from "@/components/ui/dynamic-fields";
import { Badge, Button, Card, CardContent, Dialog, Input, Label, Select } from "@/components/ui/primitives";
import { INDIAN_STATES } from "@/lib/constants/saas";
import { calculateInvoiceGst } from "@/lib/gst/calculator";
import { getIndianFyCode } from "@/lib/catalog/verticals";
import {
  allocateNextOfflineInvoiceNumber,
  enqueueOutbox,
  getCatalogSnapshot,
  getDeviceState,
  loadFormDraft,
  saveCatalogSnapshot,
  saveDeviceState,
  saveFormDraft,
} from "@/lib/offline/sync-engine";
import type {
  BranchRow,
  CustomerRow,
  HsnCodeRow,
  InvoiceType,
  PaymentMode,
  RatioPreset,
  TaxMode,
  TenantRow,
} from "@/types/database";

export interface PosVariantItem {
  variant_id: string;
  product_id: string;
  product_name: string;
  model_code: string;
  sku: string;
  barcode: string | null;
  hsn_code: string | null;
  gst_rate: number;
  attributes: Record<string, string>;
  selling_price: number;
  wholesale_price: number;
  mrp: number;
  stock_qty: number;
  thumb_url?: string | null;
}

interface CartLine {
  key: string;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  hsn_code: string | null;
  qty: number;
  unit_price: number;
  line_discount_amount: number;
  fallback_gst_rate: number;
}

export function PosTerminal({
  tenant,
  userId,
  branches,
  initialVariants,
  initialCustomers,
  initialHsn,
  ratioPresets = [],
  stockEnabled,
  crmEnabled,
  discountsEnabled,
  canEditDraft,
  draftToEdit,
}: {
  tenant: TenantRow;
  userId: string;
  branches: BranchRow[];
  initialVariants: PosVariantItem[];
  initialCustomers: CustomerRow[];
  initialHsn: HsnCodeRow[];
  ratioPresets?: RatioPreset[];
  stockEnabled: boolean;
  crmEnabled: boolean;
  discountsEnabled: boolean;
  canEditDraft: boolean;
  draftToEdit?: {
    id: string;
    branch_id: string;
    customer_id: string | null;
    invoice_type: InvoiceType;
    tax_mode: TaxMode;
    items: CartLine[];
  } | null;
}) {
  const router = useRouter();
  const [branchId, setBranchId] = useState(draftToEdit?.branch_id || branches[0]?.id || "");
  const [variants, setVariants] = useState<PosVariantItem[]>(initialVariants);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [hsnList, setHsnList] = useState<HsnCodeRow[]>(initialHsn);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>(draftToEdit?.items ?? []);
  const [customerId, setCustomerId] = useState<string>(draftToEdit?.customer_id ?? "");
  const [walkInName, setWalkInName] = useState("Walk-In Customer");
  const [walkInPhone, setWalkInPhone] = useState("");
  const [walkInGstin, setWalkInGstin] = useState("");
  const [walkInState, setWalkInState] = useState(branches[0]?.state_code ?? "33");

  const [invoiceType, setInvoiceType] = useState<InvoiceType>(draftToEdit?.invoice_type ?? "sale");
  const [taxMode, setTaxMode] = useState<TaxMode>(
    draftToEdit?.tax_mode ?? (tenant.tax_config.gst_enabled ? tenant.tax_config.default_tax_mode : "none")
  );
  const [billDiscType, setBillDiscType] = useState<"percent" | "flat">("flat");
  const [billDiscVal, setBillDiscVal] = useState(0);
  const [creditRedeem, setCreditRedeem] = useState(0);
  const [ewayBillNo, setEwayBillNo] = useState("");
  const [payCash, setPayCash] = useState<number | null>(null);
  const [payUpi, setPayUpi] = useState(0);
  const [payCard, setPayCard] = useState(0);

  const [freeOpen, setFreeOpen] = useState(false);
  const [freeName, setFreeName] = useState("");
  const [freeHsn, setFreeHsn] = useState("6403");
  const [freeQty, setFreeQty] = useState(1);
  const [freeRate, setFreeRate] = useState(0);
  const [freeGst, setFreeGst] = useState(5);

  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sizeRunOpen, setSizeRunOpen] = useState(false);
  const [sizeRunModel, setSizeRunModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSyncRef = useRef<string>(new Date().toISOString());
  const initialBranchRef = useRef<string>(draftToEdit?.branch_id || branches[0]?.id || "");

  const posUi = tenant.brand_config?.pos_ui ?? {
    layout: "grid",
    show_thumbs: true,
    show_hsn_col: true,
    quick_pay_modes: ["cash", "upi", "card"],
  };
  const activeBranch = branches.find((b) => b.id === branchId) ?? branches[0];
  const selectedCustomer = customers.find((c) => c.id === customerId) ?? null;

  const productModels = useMemo(() => {
    const map = new Map<string, string>();
    for (const v of variants) {
      if (!map.has(v.model_code)) map.set(v.model_code, v.product_name);
    }
    return Array.from(map.entries()).map(([code, name]) => ({ code, name }));
  }, [variants]);

  // Register device, refresh stock when switching branch, & cache catalog snapshot
  useEffect(() => {
    if (!branchId) return;
    (async () => {
      const existingDev = await getDeviceState(tenant.id, branchId).catch(() => undefined);
      if (!existingDev && navigator.onLine) {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "register_device", branch_id: branchId, label: "POS Terminal" }),
        }).catch(() => null);
        if (res?.ok) {
          const d = await res.json();
          await saveDeviceState({ key: `${tenant.id}:${branchId}`, ...d });
        }
      }

      if (navigator.onLine) {
        let currentVars = variants;
        if (branchId !== initialBranchRef.current) {
          const syncRes = await fetch(`/api/sync?branch_id=${branchId}`).catch(() => null);
          if (syncRes?.ok) {
            const snap = await syncRes.json();
            lastSyncRef.current = snap.synced_at;
            const stockMap = new Map<string, number>(
              (snap.stock ?? []).map((s: { variant_id: string; quantity: number }) => [s.variant_id, Number(s.quantity)])
            );
            currentVars = variants.map((v) => ({
              ...v,
              stock_qty: stockMap.get(v.variant_id) ?? 0,
            }));
            setVariants(currentVars);
          }
        }
        await saveCatalogSnapshot({
          cache_key: `${tenant.id}:${branchId}`,
          tenant_id: tenant.id,
          branch_id: branchId,
          synced_at: new Date().toISOString(),
          products: [],
          variants: currentVars as unknown as Array<Record<string, unknown>>,
          stock: currentVars.map((v) => ({ variant_id: v.variant_id, quantity: v.stock_qty })),
          customers: customers as unknown as Array<Record<string, unknown>>,
          hsn_codes: hsnList as unknown as Array<Record<string, unknown>>,
          bill_template: null,
        }).catch(() => undefined);
      } else {
        const cached = await getCatalogSnapshot(tenant.id, branchId).catch(() => undefined);
        if (cached) {
          if (cached.variants.length > 0) setVariants(cached.variants as unknown as PosVariantItem[]);
          if (cached.customers.length > 0) setCustomers(cached.customers as unknown as CustomerRow[]);
          if (cached.hsn_codes.length > 0) setHsnList(cached.hsn_codes as unknown as HsnCodeRow[]);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId]);

  // Restore local draft if no draftToEdit
  useEffect(() => {
    if (draftToEdit) return;
    loadFormDraft<CartLine[]>(`pos:${tenant.id}:${branchId}`).then((saved) => {
      if (saved && saved.length > 0) setCart(saved);
    });
  }, [tenant.id, branchId, draftToEdit]);

  useEffect(() => {
    if (!draftToEdit) {
      saveFormDraft(`pos:${tenant.id}:${branchId}`, cart).catch(() => undefined);
    }
  }, [cart, tenant.id, branchId, draftToEdit]);

  // 120s visibility-gated delta stock poll (Neon compute-friendly)
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== "visible" || !navigator.onLine || !branchId) return;
      fetch(`/api/sync?branch_id=${branchId}&since=${encodeURIComponent(lastSyncRef.current)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          lastSyncRef.current = data.synced_at;
          if (Array.isArray(data.stock) && data.stock.length > 0) {
            const stockMap = new Map<string, number>(
              data.stock.map((s: { variant_id: string; quantity: number }) => [s.variant_id, Number(s.quantity)])
            );
            setVariants((prev) =>
              prev.map((v) => (stockMap.has(v.variant_id) ? { ...v, stock_qty: stockMap.get(v.variant_id)! } : v))
            );
          }
        })
        .catch(() => undefined);
    }, 120_000);
    return () => clearInterval(timer);
  }, [branchId]);

  const hsnMap = useMemo(() => {
    const m = new Map<string, HsnCodeRow>();
    for (const h of hsnList) m.set(h.code, h);
    return m;
  }, [hsnList]);

  const gstCalc = useMemo(() => {
    return calculateInvoiceGst({
      invoice_type: invoiceType,
      tax_mode: invoiceType === "estimate_bill_of_supply" ? "none" : taxMode,
      branch_state_code: activeBranch?.state_code ?? "33",
      place_of_supply_state_code: selectedCustomer?.state_code || walkInState || activeBranch?.state_code || "33",
      bill_discount_type: discountsEnabled && billDiscVal > 0 ? billDiscType : null,
      bill_discount_value: discountsEnabled ? billDiscVal : 0,
      items: cart.map((c) => ({
        variant_id: c.variant_id,
        product_name: c.product_name,
        sku: c.sku,
        hsn_code: c.hsn_code,
        qty: c.qty,
        unit_price: c.unit_price,
        line_discount_amount: discountsEnabled ? c.line_discount_amount : 0,
        hsn_rule: c.hsn_code ? hsnMap.get(c.hsn_code) : undefined,
        fallback_gst_rate: c.fallback_gst_rate,
      })),
    });
  }, [cart, invoiceType, taxMode, activeBranch, selectedCustomer, walkInState, billDiscType, billDiscVal, discountsEnabled, hsnMap]);

  const effectivePayCash = payCash ?? Math.max(0, gstCalc.grand_total - payUpi - payCard - creditRedeem);

  const addVariantToCart = (v: PosVariantItem) => {
    const isWholesale = selectedCustomer?.customer_type === "wholesale";
    const price = isWholesale && v.wholesale_price > 0 ? Number(v.wholesale_price) : Number(v.selling_price);
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.variant_id === v.variant_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          key: v.variant_id,
          variant_id: v.variant_id,
          product_name: `${v.product_name} (${Object.values(v.attributes).join(" / ")})`,
          sku: v.sku,
          hsn_code: v.hsn_code,
          qty: 1,
          unit_price: price,
          line_discount_amount: 0,
          fallback_gst_rate: Number(v.gst_rate ?? 5),
        },
      ];
    });
  };

  const handleBarcodeKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exact = variants.find(
      (v) => v.barcode?.toLowerCase() === q || v.sku.toLowerCase() === q
    );
    if (exact) {
      e.preventDefault();
      addVariantToCart(exact);
      setSearch("");
      toast.success(`Added ${exact.sku}`);
    }
  };

  const startCameraScan = async () => {
    setScannerOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      if ("BarcodeDetector" in window) {
        // @ts-expect-error Native BarcodeDetector
        const detector = new window.BarcodeDetector({ formats: ["code_128", "ean_13", "qr_code"] });
        const tick = async () => {
          if (!videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0) {
              const raw = String(codes[0].rawValue).toLowerCase();
              const hit = variants.find((v) => v.barcode?.toLowerCase() === raw || v.sku.toLowerCase() === raw);
              if (hit) {
                addVariantToCart(hit);
                toast.success(`Scanned ${hit.sku}`);
                stopCameraScan();
                return;
              }
            }
          } catch {
            // continue
          }
          if (videoRef.current) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      } else {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (videoRef.current) {
          reader.decodeFromVideoElement(videoRef.current, (result) => {
            if (result) {
              const raw = result.getText().toLowerCase();
              const hit = variants.find((v) => v.barcode?.toLowerCase() === raw || v.sku.toLowerCase() === raw);
              if (hit) {
                addVariantToCart(hit);
                toast.success(`Scanned ${hit.sku}`);
                stopCameraScan();
              }
            }
          });
        }
      }
    } catch {
      toast.error("Camera unavailable or permission denied.");
      setScannerOpen(false);
    }
  };

  const stopCameraScan = () => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    setScannerOpen(false);
  };

  const filteredVariants = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return variants.slice(0, 40);
    return variants
      .filter(
        (v) =>
          v.product_name.toLowerCase().includes(q) ||
          v.model_code.toLowerCase().includes(q) ||
          v.sku.toLowerCase().includes(q) ||
          (v.barcode && v.barcode.toLowerCase().includes(q))
      )
      .slice(0, 40);
  }, [variants, search]);

  const submitInvoice = async (isDraft: boolean) => {
    if (cart.length === 0) {
      toast.error("Add at least one item to the bill.");
      return;
    }
    setSubmitting(true);
    const idempotencyKey = crypto.randomUUID();
    const payments: Array<{ mode: PaymentMode; amount: number }> = [
      { mode: "cash", amount: effectivePayCash },
      { mode: "upi", amount: payUpi },
      { mode: "card", amount: payCard },
    ];
    const paidAmount = effectivePayCash + payUpi + payCard;

    const payload = {
      idempotency_key: idempotencyKey,
      draft_id: draftToEdit?.id ?? null,
      is_draft: isDraft,
      branch_id: branchId,
      invoice_type: invoiceType,
      customer_id: crmEnabled && customerId ? customerId : null,
      customer_snapshot: selectedCustomer
        ? {
            name: selectedCustomer.name,
            phone: selectedCustomer.phone,
            gstin: selectedCustomer.gstin,
            state_code: selectedCustomer.state_code,
          }
        : {
            name: walkInName || "Walk-In Customer",
            phone: walkInPhone || null,
            gstin: walkInGstin || null,
            state_code: walkInState || activeBranch?.state_code || "33",
          },
      tax_mode: invoiceType === "estimate_bill_of_supply" ? "none" : taxMode,
      supply_type: gstCalc.supply_type,
      subtotal: gstCalc.subtotal,
      discount_type: discountsEnabled && billDiscVal > 0 ? billDiscType : null,
      discount_value: discountsEnabled ? billDiscVal : 0,
      discount_amount: gstCalc.discount_amount,
      taxable_amount: gstCalc.taxable_amount,
      cgst_amount: gstCalc.cgst_amount,
      sgst_amount: gstCalc.sgst_amount,
      igst_amount: gstCalc.igst_amount,
      round_off: gstCalc.round_off,
      grand_total: gstCalc.grand_total,
      paid_amount: paidAmount,
      credit_redeemed: creditRedeem,
      eway_bill_no: ewayBillNo || null,
      items: gstCalc.items,
      payments,
    };

    try {
      if (!navigator.onLine && !isDraft) {
        const fy = getIndianFyCode();
        const alloc = await allocateNextOfflineInvoiceNumber(tenant.id, branchId, fy);
        await enqueueOutbox({
          idempotency_key: idempotencyKey,
          tenant_id: tenant.id,
          branch_id: branchId,
          user_id: userId,
          device_id: alloc.deviceId,
          device_seq: alloc.deviceSeq,
          op: "create_invoice",
          payload,
        });
        toast.success(`Saved offline as ${alloc.invoiceNumber}. Will auto-sync on reconnect.`);
        setCart([]);
        return;
      }

      const invoiceId = await createOrFinalizeInvoiceAction(payload);
      toast.success(isDraft ? "Draft saved." : "Invoice finalized!");
      setCart([]);
      router.push(isDraft ? "/dashboard/billing" : `/dashboard/billing/${invoiceId}/print`);
    } catch (err) {
      if (!isDraft && err instanceof Error && err.message.toLowerCase().includes("fetch")) {
        const fy = getIndianFyCode();
        const alloc = await allocateNextOfflineInvoiceNumber(tenant.id, branchId, fy);
        await enqueueOutbox({
          idempotency_key: idempotencyKey,
          tenant_id: tenant.id,
          branch_id: branchId,
          user_id: userId,
          device_id: alloc.deviceId,
          device_seq: alloc.deviceSeq,
          op: "create_invoice",
          payload,
        });
        toast.warning(`Connection dropped — queued offline as ${alloc.invoiceNumber}`);
        setCart([]);
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to save invoice");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const cartPanel = (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Invoice Type</Label>
          <Select value={invoiceType} onChange={(e) => setInvoiceType(e.target.value as InvoiceType)}>
            <option value="sale">GST Tax Invoice</option>
            {tenant.tax_config.allow_estimate_mode && (
              <option value="estimate_bill_of_supply">Estimate (Non-GST)</option>
            )}
          </Select>
        </div>
        <div>
          <Label>Tax Mode</Label>
          <Select
            value={taxMode}
            disabled={invoiceType === "estimate_bill_of_supply"}
            onChange={(e) => setTaxMode(e.target.value as TaxMode)}
          >
            <option value="inclusive">Tax Inclusive (MRP)</option>
            <option value="exclusive">Tax Exclusive (B2B)</option>
            <option value="none">No Tax</option>
          </Select>
        </div>
      </div>

      {crmEnabled ? (
        <div className="space-y-2">
          <div>
            <Label>Customer / Wholesale Dealer</Label>
            <Select
              value={customerId}
              onChange={(e) => {
                const cid = e.target.value;
                setCustomerId(cid);
                setCreditRedeem(0);
                const cust = customers.find((c) => c.id === cid);
                if (cust?.customer_type === "wholesale") {
                  setTaxMode(tenant.tax_config.gst_enabled ? "exclusive" : "none");
                  if (cust.default_discount_pct > 0 && discountsEnabled) {
                    setBillDiscType("percent");
                    setBillDiscVal(Number(cust.default_discount_pct));
                  }
                }
              }}
            >
              <option value="">Walk-In Customer</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.customer_type}) {c.current_due > 0 ? `• Due ₹${c.current_due}` : ""}
                </option>
              ))}
            </Select>
          </div>
          {!customerId && (
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Walk-In Name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
              <Input placeholder="Phone" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} />
              <GstinInput value={walkInGstin} onChange={setWalkInGstin} onStateDetected={setWalkInState} />
              <Select value={walkInState} onChange={(e) => setWalkInState(e.target.value)}>
                {Object.entries(INDIAN_STATES).map(([c, n]) => (
                  <option key={c} value={c}>{c} — {n}</option>
                ))}
              </Select>
            </div>
          )}
          {selectedCustomer && Number(selectedCustomer.credit_balance) > 0 && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2 flex items-center justify-between gap-2 text-xs">
              <span className="text-emerald-900 font-medium">
                Credit Balance: ₹{Number(selectedCustomer.credit_balance).toLocaleString("en-IN")}
              </span>
              <div className="flex items-center gap-1">
                <span>Redeem ₹</span>
                <input
                  type="number"
                  min={0}
                  max={Math.min(Number(selectedCustomer.credit_balance), gstCalc.grand_total)}
                  value={creditRedeem}
                  onChange={(e) =>
                    setCreditRedeem(
                      Math.min(
                        Number(selectedCustomer.credit_balance),
                        gstCalc.grand_total,
                        Math.max(0, Number(e.target.value) || 0)
                      )
                    )
                  }
                  className="w-20 rounded border border-emerald-300 bg-white px-2 py-1 text-right font-semibold"
                />
              </div>
            </div>
          )}
          {selectedCustomer &&
            selectedCustomer.credit_limit > 0 &&
            selectedCustomer.current_due + gstCalc.grand_total > selectedCustomer.credit_limit && (
              <p className="text-xs text-rose-600 mt-1 font-semibold">
                Warning: Exceeds dealer credit limit (₹{selectedCustomer.credit_limit.toLocaleString("en-IN")})
              </p>
            )}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Customer Name" value={walkInName} onChange={(e) => setWalkInName(e.target.value)} />
          <Input placeholder="Phone" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} />
          <GstinInput value={walkInGstin} onChange={setWalkInGstin} onStateDetected={setWalkInState} />
          <Select value={walkInState} onChange={(e) => setWalkInState(e.target.value)}>
            {Object.entries(INDIAN_STATES).map(([c, n]) => (
              <option key={c} value={c}>{c} — {n}</option>
            ))}
          </Select>
        </div>
      )}

      {/* Cart Items */}
      <div className="divide-y divide-slate-100 max-h-60 overflow-y-auto border rounded-xl border-slate-200 bg-slate-50/50">
        {cart.length === 0 ? (
          <p className="p-6 text-center text-xs text-slate-400">Scan barcode or tap items to add</p>
        ) : (
          cart.map((c, idx) => (
            <div key={c.key} className="p-2.5 flex items-center justify-between gap-2 text-xs bg-white">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-900 truncate">{c.product_name}</p>
                <p className="text-slate-500">
                  ₹{c.unit_price}
                  {posUi.show_hsn_col && (
                    <> • HSN {c.hsn_code || "—"} • GST {gstCalc.items[idx]?.gst_rate ?? c.fallback_gst_rate}%</>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                {discountsEnabled && (
                  <input
                    type="number"
                    min={0}
                    title="Line Discount ₹"
                    placeholder="Disc"
                    value={c.line_discount_amount || ""}
                    onChange={(e) => {
                      const d = Math.max(0, Number(e.target.value) || 0);
                      setCart((prev) => prev.map((it, i) => (i === idx ? { ...it, line_discount_amount: d } : it)));
                    }}
                    className="w-14 min-h-[36px] rounded border border-slate-300 text-center text-[11px]"
                  />
                )}
                <input
                  type="number"
                  min={1}
                  value={c.qty}
                  onChange={(e) => {
                    const q = Math.max(1, Number(e.target.value) || 1);
                    setCart((prev) => prev.map((it, i) => (i === idx ? { ...it, qty: q } : it)));
                  }}
                  className="w-14 min-h-[36px] rounded border border-slate-300 text-center font-semibold"
                />
                <button
                  type="button"
                  onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {discountsEnabled && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Bill Discount</Label>
            <Select value={billDiscType} onChange={(e) => setBillDiscType(e.target.value as "percent" | "flat")}>
              <option value="flat">Flat ₹</option>
              <option value="percent">Percent %</option>
            </Select>
          </div>
          <div>
            <Label>Value</Label>
            <Input type="number" min={0} value={billDiscVal} onChange={(e) => setBillDiscVal(Number(e.target.value) || 0)} />
          </div>
        </div>
      )}

      {/* Totals */}
      <div className="rounded-xl bg-slate-900 text-white p-3.5 space-y-1 text-xs">
        <div className="flex justify-between text-slate-300">
          <span>Taxable ({gstCalc.supply_type === "intra_state" ? "CGST+SGST" : "IGST"})</span>
          <span>₹{gstCalc.taxable_amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-slate-300">
          <span>Total GST</span>
          <span>₹{(gstCalc.cgst_amount + gstCalc.sgst_amount + gstCalc.igst_amount).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-base font-bold pt-1 border-t border-slate-700">
          <span>Grand Total</span>
          <span>₹{gstCalc.grand_total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
        </div>
      </div>

      {/* Split Payments */}
      <div className="grid grid-cols-3 gap-2">
        <div><Label>Cash ₹</Label><Input type="number" min={0} value={effectivePayCash} onChange={(e) => setPayCash(Number(e.target.value) || 0)} /></div>
        <div><Label>UPI ₹</Label><Input type="number" min={0} value={payUpi} onChange={(e) => setPayUpi(Number(e.target.value) || 0)} /></div>
        <div><Label>Card ₹</Label><Input type="number" min={0} value={payCard} onChange={(e) => setPayCard(Number(e.target.value) || 0)} /></div>
      </div>

      {gstCalc.grand_total >= 50000 && (
        <div>
          <Label>E-Way Bill No (Recommended &gt;= ₹50,000)</Label>
          <Input value={ewayBillNo} onChange={(e) => setEwayBillNo(e.target.value)} placeholder="12-digit EWB No" />
        </div>
      )}

      <div className="flex gap-2">
        {canEditDraft && (
          <Button variant="outline" className="flex-1" disabled={submitting} onClick={() => submitInvoice(true)}>
            <Save className="h-4 w-4" /> Hold Draft
          </Button>
        )}
        <Button className="flex-1" disabled={submitting} onClick={() => submitInvoice(false)}>
          <Printer className="h-4 w-4" /> Finalize &amp; Print
        </Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-xl font-bold text-slate-900">POS Billing Terminal</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-44">
            {branches.filter((b) => !b.is_read_only).map((b) => (
              <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
            ))}
          </Select>
          {stockEnabled && ratioPresets.length > 0 && productModels.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                setSizeRunModel(productModels[0]?.code ?? "");
                setSizeRunOpen(true);
              }}
            >
              <Layers className="h-4 w-4" /> Size-Run Carton
            </Button>
          )}
          <Button variant="outline" onClick={() => setFreeOpen(true)}>
            <Plus className="h-4 w-4" /> Quick Item
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Search / Scan + Catalog */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleBarcodeKey}
                placeholder="Scan barcode or search shoe model / SKU..."
                className="pl-9"
              />
            </div>
            <Button variant="outline" onClick={startCameraScan} title="Camera Barcode Scanner">
              <Camera className="h-4 w-4" />
            </Button>
          </div>

          {!stockEnabled || variants.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <p className="text-sm text-slate-600">
                  {stockEnabled ? "No catalog items in this branch yet." : "Stock module is off — use Quick Item entry."}
                </p>
                <Button onClick={() => setFreeOpen(true)}>
                  <Plus className="h-4 w-4" /> Add Free-Text Bill Item
                </Button>
              </CardContent>
            </Card>
          ) : posUi.layout === "list" ? (
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden divide-y divide-slate-100">
              {filteredVariants.map((v) => (
                <button
                  key={v.variant_id}
                  type="button"
                  onClick={() => addVariantToCart(v)}
                  className="w-full px-3 py-2.5 text-left hover:bg-sky-50 flex items-center justify-between gap-3 text-xs cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {posUi.show_thumbs && v.thumb_url && (
                      <img src={v.thumb_url} alt={v.product_name} className="h-9 w-9 rounded object-cover shrink-0 border border-slate-200" />
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900 truncate">{v.product_name}</p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {v.sku} • {Object.values(v.attributes).join(" / ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold text-sky-700">₹{v.selling_price}</span>
                    <Badge variant={v.stock_qty <= 0 ? "danger" : v.stock_qty <= 5 ? "warning" : "success"}>
                      {v.stock_qty}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {filteredVariants.map((v) => (
                <button
                  key={v.variant_id}
                  type="button"
                  onClick={() => addVariantToCart(v)}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-sky-500 hover:shadow-xs transition-all cursor-pointer flex flex-col justify-between min-h-[100px]"
                >
                  <div className="flex items-start gap-2">
                    {posUi.show_thumbs && v.thumb_url && (
                      <img src={v.thumb_url} alt={v.product_name} className="h-10 w-10 rounded-lg object-cover shrink-0 border border-slate-200" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-slate-900 line-clamp-1">{v.product_name}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {Object.values(v.attributes).join(" • ")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-bold text-sky-700">₹{v.selling_price}</span>
                    <Badge variant={v.stock_qty <= 0 ? "danger" : v.stock_qty <= 5 ? "warning" : "success"}>
                      {v.stock_qty}
                    </Badge>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Desktop Cart */}
        <div className="hidden lg:block lg:col-span-5">
          <Card className="sticky top-20">
            <CardContent className="p-4">{cartPanel}</CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile Sticky Bottom Cart Trigger */}
      <div className="lg:hidden fixed bottom-14 inset-x-3 z-20">
        <Button className="w-full shadow-xl" size="lg" onClick={() => setMobileCartOpen(true)}>
          <ShoppingCart className="h-4 w-4" />
          Cart ({cart.length}) • ₹{gstCalc.grand_total.toLocaleString("en-IN")}
        </Button>
      </div>

      <Dialog open={mobileCartOpen} onClose={() => setMobileCartOpen(false)} title="Current Bill">
        {cartPanel}
      </Dialog>

      <Dialog open={sizeRunOpen} onClose={() => setSizeRunOpen(false)} title="Wholesale Size-Run Carton Fill">
        <div className="space-y-4">
          <div>
            <Label>Select Product Model</Label>
            <Select value={sizeRunModel} onChange={(e) => setSizeRunModel(e.target.value)}>
              {productModels.map((m) => (
                <option key={m.code} value={m.code}>{m.name} ({m.code})</option>
              ))}
            </Select>
          </div>
          <SizeRunQuickFill
            presets={ratioPresets}
            onApply={(ratios) => {
              const matching = variants.filter((v) => v.model_code === sizeRunModel);
              let added = 0;
              const isWholesale = selectedCustomer?.customer_type === "wholesale";
              setCart((prev) => {
                const next = [...prev];
                for (const [sizeKey, qty] of Object.entries(ratios)) {
                  if (qty <= 0) continue;
                  const hit = matching.find(
                    (v) =>
                      Object.values(v.attributes).some((av) => av.toLowerCase() === sizeKey.toLowerCase())
                  );
                  if (!hit) continue;
                  added += qty;
                  const price = isWholesale && hit.wholesale_price > 0 ? Number(hit.wholesale_price) : Number(hit.selling_price);
                  const idx = next.findIndex((c) => c.variant_id === hit.variant_id);
                  if (idx >= 0) {
                    next[idx] = { ...next[idx], qty: next[idx].qty + qty };
                  } else {
                    next.push({
                      key: hit.variant_id,
                      variant_id: hit.variant_id,
                      product_name: `${hit.product_name} (${Object.values(hit.attributes).join(" / ")})`,
                      sku: hit.sku,
                      hsn_code: hit.hsn_code,
                      qty,
                      unit_price: price,
                      line_discount_amount: 0,
                      fallback_gst_rate: Number(hit.gst_rate ?? 5),
                    });
                  }
                }
                return next;
              });
              toast.success(added > 0 ? `Added ${added} pair(s) via size-run preset.` : "No matching size variants found for this model.");
              setSizeRunOpen(false);
            }}
          />
        </div>
      </Dialog>

      <Dialog open={freeOpen} onClose={() => setFreeOpen(false)} title="Add Quick / Free-Text Item">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setCart((prev) => [
              ...prev,
              {
                key: crypto.randomUUID(),
                variant_id: null,
                product_name: freeName,
                sku: null,
                hsn_code: freeHsn || null,
                qty: freeQty,
                unit_price: freeRate,
                line_discount_amount: 0,
                fallback_gst_rate: freeGst,
              },
            ]);
            setFreeName("");
            setFreeOpen(false);
          }}
          className="space-y-3"
        >
          <div><Label>Item Name</Label><Input value={freeName} onChange={(e) => setFreeName(e.target.value)} required /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label>HSN</Label><Input value={freeHsn} onChange={(e) => setFreeHsn(e.target.value)} /></div>
            <div><Label>Qty</Label><Input type="number" min={1} value={freeQty} onChange={(e) => setFreeQty(Number(e.target.value) || 1)} /></div>
            <div><Label>GST %</Label><Input type="number" value={freeGst} onChange={(e) => setFreeGst(Number(e.target.value) || 0)} /></div>
          </div>
          <div><Label>Unit Price ₹</Label><Input type="number" min={0} step="0.01" value={freeRate} onChange={(e) => setFreeRate(Number(e.target.value) || 0)} required /></div>
          <Button type="submit" className="w-full">Add to Bill</Button>
        </form>
      </Dialog>

      {scannerOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4">
          <div className="relative w-full max-w-md rounded-2xl overflow-hidden bg-black">
            <video ref={videoRef} className="w-full aspect-square object-cover" playsInline muted />
            <button
              type="button"
              onClick={stopCameraScan}
              className="absolute top-3 right-3 rounded-full bg-white/20 p-2 text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <p className="text-white text-xs mt-3">Point camera at shoe box barcode</p>
        </div>
      )}
    </div>
  );
}
