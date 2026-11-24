"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Banknote,
  Camera,
  ChevronDown,
  ChevronUp,
  CreditCard,
  Eye,
  Layers,
  Loader2,
  Plus,
  Printer,
  QrCode,
  Save,
  Search,
  Settings,
  ShoppingCart,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { createOrFinalizeInvoiceAction } from "@/actions/billing";
import { InvoiceRenderer } from "@/components/billing/invoice-renderer";
import { PosProductCard, QtyStepper, money } from "@/components/billing/pos-parts";
import { normalizeGstin, normalizePhone } from "@/lib/billing/walk-in-identity";
import { readCachedBlock } from "@/lib/offline/access-block";
import { GstinInput, SizeRunQuickFill } from "@/components/ui/dynamic-fields";
import { Form, Alert, Button, Card, CardContent, Dialog, Input, Label, Select } from "@/components/ui/primitives";
import { Paged } from "@/components/ui/pagination";
import { Segmented } from "@/components/ui/spark";
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
  BillTemplateConfig,
  BillTemplateRow,
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
  custom_gst?: boolean;
}

type QuickPayMode = "cash" | "upi" | "card";
const PAY_LABEL: Record<QuickPayMode, string> = { cash: "Cash", upi: "UPI", card: "Card" };
const PAY_ICON = { cash: Banknote, upi: QrCode, card: CreditCard } as const;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function PosTerminal({
  tenant,
  userId,
  branches,
  branchLocked = false,
  initialVariants,
  initialCustomers,
  initialHsn,
  ratioPresets = [],
  defaultTemplate = null,
  logoUrl = null,
  stockEnabled,
  crmEnabled,
  discountsEnabled,
  canEditDraft,
  draftToEdit,
}: {
  tenant: TenantRow;
  userId: string;
  branches: BranchRow[];
  /** True when the header branch switcher has already chosen one branch. */
  branchLocked?: boolean;
  initialVariants: PosVariantItem[];
  initialCustomers: CustomerRow[];
  initialHsn: HsnCodeRow[];
  ratioPresets?: RatioPreset[];
  defaultTemplate?: BillTemplateRow | null;
  logoUrl?: string | null;
  stockEnabled: boolean;
  crmEnabled: boolean;
  discountsEnabled: boolean;
  canEditDraft: boolean;
  draftToEdit?: {
    id: string;
    branch_id: string;
    customer_id: string | null;
    customer_snapshot?: { name?: string | null; phone?: string | null; gstin?: string | null; state_code?: string | null; address?: string | null } | null;
    invoice_type: InvoiceType;
    tax_mode: TaxMode;
    items: CartLine[];
  } | null;
}) {
  const router = useRouter();
  const billableBranches = branches.filter((b) => !b.is_read_only);
  const startBranchId = draftToEdit?.branch_id || (branchLocked ? branches[0]?.id : billableBranches[0]?.id) || "";
  const [branchId, setBranchId] = useState(startBranchId);
  const [variants, setVariants] = useState<PosVariantItem[]>(initialVariants);
  const [customers, setCustomers] = useState<CustomerRow[]>(initialCustomers);
  const [hsnList, setHsnList] = useState<HsnCodeRow[]>(initialHsn);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>(draftToEdit?.items ?? []);
  const [customerId, setCustomerId] = useState<string>(draftToEdit?.customer_id ?? "");
  const draftWalkIn = draftToEdit && !draftToEdit.customer_id ? draftToEdit.customer_snapshot : null;
  const [walkInName, setWalkInName] = useState(draftWalkIn?.name || "Walk-In Customer");
  const [walkInPhone, setWalkInPhone] = useState(draftWalkIn?.phone || "");
  const [walkInGstin, setWalkInGstin] = useState(draftWalkIn?.gstin || "");
  const [walkInState, setWalkInState] = useState(draftWalkIn?.state_code || branches[0]?.state_code || "33");
  const [walkInAddress, setWalkInAddress] = useState(draftWalkIn?.address || "");

  const [invoiceType, setInvoiceType] = useState<InvoiceType>(draftToEdit?.invoice_type ?? "sale");
  const [taxMode, setTaxMode] = useState<TaxMode>(
    draftToEdit?.tax_mode ?? (tenant.tax_config.gst_enabled ? tenant.tax_config.default_tax_mode : "none")
  );
  const [billDiscType, setBillDiscType] = useState<"percent" | "flat">("flat");
  const [billDiscVal, setBillDiscVal] = useState(0);
  const [creditRedeem, setCreditRedeem] = useState(0);
  const [ewayBillNo, setEwayBillNo] = useState("");
  // A full-payment method follows the bill total; manual entry switches to split payment.
  const [fullMode, setFullMode] = useState<QuickPayMode | null>("cash");
  const [splitPay, setSplitPay] = useState<Record<QuickPayMode, number>>({ cash: 0, upi: 0, card: 0 });
  const [detailsOpen, setDetailsOpen] = useState(Boolean(draftWalkIn?.gstin));
  const [lineDiscOpen, setLineDiscOpen] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [modelFilter, setModelFilter] = useState("all");
  const [online, setOnline] = useState(true);

  const [freeOpen, setFreeOpen] = useState(false);
  const [freeName, setFreeName] = useState("");
  const [freeHsn, setFreeHsn] = useState("6403");
  const [freeQty, setFreeQty] = useState(1);
  const [cartonLineKey, setCartonLineKey] = useState<string | null>(null);
  const [cartonCount, setCartonCount] = useState("1");
  const [cartonPack, setCartonPack] = useState("20");
  const [freeRate, setFreeRate] = useState(0);
  const [freeGst, setFreeGst] = useState(5);

  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [sizeRunOpen, setSizeRunOpen] = useState(false);
  const [sizeRunModel, setSizeRunModel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSyncRef = useRef<string>(new Date().toISOString());
  const submitLockRef = useRef(false);
  const initialBranchRef = useRef<string>(startBranchId);

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
  const sizeRunVariants = useMemo(() => variants.filter((v) => v.model_code === sizeRunModel), [variants, sizeRunModel]);

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

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  const hsnMap = useMemo(() => {
    const m = new Map<string, HsnCodeRow>();
    for (const h of hsnList) m.set(h.code, h);
    return m;
  }, [hsnList]);

  const effectivePlaceOfSupply = walkInState || selectedCustomer?.state_code || activeBranch?.state_code || "33";

  const gstCalc = useMemo(() => {
    return calculateInvoiceGst({
      invoice_type: invoiceType,
      tax_mode: invoiceType === "estimate_bill_of_supply" ? "none" : taxMode,
      branch_state_code: activeBranch?.state_code ?? "33",
      place_of_supply_state_code: effectivePlaceOfSupply,
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
        hsn_rule: c.custom_gst || c.fallback_gst_rate === 0 ? undefined : c.hsn_code ? hsnMap.get(c.hsn_code) : undefined,
        fallback_gst_rate: c.fallback_gst_rate,
      })),
    });
  }, [cart, invoiceType, taxMode, activeBranch, effectivePlaceOfSupply, billDiscType, billDiscVal, discountsEnabled, hsnMap]);

  const creditBalance = Number(selectedCustomer?.credit_balance ?? 0);
  const appliedCredit = Math.min(creditRedeem, creditBalance, gstCalc.grand_total);
  const payable = round2(Math.max(0, gstCalc.grand_total - appliedCredit));
  const payModes = (["cash", "upi", "card"] as const).filter(
    (m) => !posUi.quick_pay_modes?.length || posUi.quick_pay_modes.includes(m)
  );
  const activeFullMode = fullMode && payModes.includes(fullMode) ? fullMode : fullMode ? payModes[0] ?? "cash" : null;
  const payAmounts: Record<QuickPayMode, number> = activeFullMode
    ? { cash: 0, upi: 0, card: 0, [activeFullMode]: payable }
    : splitPay;
  const digitalPaid = round2(payAmounts.upi + payAmounts.card);
  const digitalOverpaid = digitalPaid > payable;
  // Cash above the bill is change to hand back, so it is never recorded as revenue.
  const recordedCash = round2(Math.min(payAmounts.cash, Math.max(0, payable - digitalPaid)));
  const changeDue = round2(payAmounts.cash - recordedCash);
  const paidAmount = round2(recordedCash + payAmounts.upi + payAmounts.card);
  const balanceDue = round2(Math.max(0, payable - paidAmount));

  const editPayment = (mode: QuickPayMode, amount: number) => {
    // Typing into another method splits the bill: the full-payment method keeps the remainder.
    const next: Record<QuickPayMode, number> = activeFullMode ? { cash: 0, upi: 0, card: 0 } : { ...splitPay };
    if (activeFullMode && activeFullMode !== mode) next[activeFullMode] = round2(Math.max(0, payable - amount));
    next[mode] = amount;
    setSplitPay(next);
    setFullMode(null);
  };

  const qtyByVariant = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cart) if (c.variant_id) m.set(c.variant_id, (m.get(c.variant_id) ?? 0) + c.qty);
    return m;
  }, [cart]);
  const itemCount = cart.reduce((sum, c) => sum + c.qty, 0);

  /** Never block billing when physical stock exceeds system stock; warn only. */
  const stockLimit = (_v: PosVariantItem): number | undefined => undefined;

  const priceFor = (v: PosVariantItem, customer: CustomerRow | null = selectedCustomer) =>
    customer?.customer_type === "wholesale" && v.wholesale_price > 0 ? Number(v.wholesale_price) : Number(v.selling_price);

  const setVariantQty = (v: PosVariantItem, requested: number) => {
    const qty = Math.max(0, requested);
    const available = Math.max(0, Number(v.stock_qty));
    if (stockEnabled && qty > available) {
      toast.warning(
        available === 0
          ? `${v.sku} shows 0 stock in system — billing ${qty} anyway.`
          : `Only ${available} in system for ${v.sku} — billing ${qty} anyway.`
      );
    }
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.variant_id === v.variant_id);
      if (qty <= 0) return idx >= 0 ? prev.filter((_, i) => i !== idx) : prev;
      if (idx >= 0) return prev.map((c, i) => (i === idx ? { ...c, qty } : c));
      return [
        ...prev,
        {
          key: v.variant_id,
          variant_id: v.variant_id,
          product_name: `${v.product_name} (${Object.values(v.attributes).join(" / ")})`,
          sku: v.sku,
          hsn_code: v.hsn_code,
          qty,
          unit_price: priceFor(v),
          line_discount_amount: 0,
          fallback_gst_rate: Number(v.gst_rate ?? 0),
        },
      ];
    });
  };

  const addVariantToCart = (v: PosVariantItem): boolean => {
    const current = qtyByVariant.get(v.variant_id) ?? 0;
    setVariantQty(v, current + 1);
    return true;
  };

  const setLineQty = (key: string, requested: number) => {
    const line = cart.find((c) => c.key === key);
    const variant = line?.variant_id ? variants.find((v) => v.variant_id === line.variant_id) : undefined;
    if (variant) {
      setVariantQty(variant, requested);
      return;
    }
    setCart((prev) =>
      requested <= 0 ? prev.filter((c) => c.key !== key) : prev.map((c) => (c.key === key ? { ...c, qty: requested } : c))
    );
  };

  const chooseCustomer = (id: string) => {
    const previous = selectedCustomer;
    const next = customers.find((c) => c.id === id) ?? null;
    setCustomerId(id);
    setCreditRedeem(0);
    if (next) {
      setWalkInName(next.name);
      setWalkInPhone(next.phone ?? "");
      setWalkInGstin(next.gstin ?? "");
      setWalkInState(next.state_code || activeBranch?.state_code || "33");
      setWalkInAddress(next.address ?? "");
    } else {
      setWalkInName("Walk-In Customer");
      setWalkInPhone("");
      setWalkInGstin("");
      setWalkInState(activeBranch?.state_code || "33");
      setWalkInAddress("");
    }
    // Keep catalog lines on the right retail or wholesale price for this customer.
    setCart((prev) =>
      prev.map((line) => {
        const v = line.variant_id ? variants.find((x) => x.variant_id === line.variant_id) : undefined;
        return v ? { ...line, unit_price: priceFor(v, next) } : line;
      })
    );
    if (next?.customer_type === "wholesale") {
      setTaxMode(tenant.tax_config.gst_enabled ? "exclusive" : "none");
      if (next.default_discount_pct > 0 && discountsEnabled) {
        setBillDiscType("percent");
        setBillDiscVal(Number(next.default_discount_pct));
      }
    } else if (previous?.customer_type === "wholesale") {
      setTaxMode(tenant.tax_config.gst_enabled ? tenant.tax_config.default_tax_mode : "none");
      if (previous.default_discount_pct > 0) setBillDiscVal(0);
    }
  };

  const resetBill = () => {
    setCart([]);
    setBillDiscVal(0);
    setCreditRedeem(0);
    setEwayBillNo("");
    setFullMode("cash");
    setSplitPay({ cash: 0, upi: 0, card: 0 });
    setCustomerId("");
    setWalkInName("Walk-In Customer");
    setWalkInPhone("");
    setWalkInGstin("");
    setWalkInState(activeBranch?.state_code || "33");
    setWalkInAddress("");
    setDetailsOpen(false);
  };

  const clearBill = () => {
    const saved = cart;
    setCart([]);
    toast("Bill cleared", { action: { label: "Undo", onClick: () => setCart(saved) } });
  };

  const overStockLine = cart.find((c) => {
    const v = c.variant_id ? variants.find((x) => x.variant_id === c.variant_id) : undefined;
    const limit = v ? stockLimit(v) : undefined;
    return limit !== undefined && c.qty > limit;
  });
  const finalizeBlock =
    cart.length === 0
      ? "Add at least one item."
      : activeBranch?.is_read_only
      ? "This branch is read-only."
      : overStockLine
      ? "Reduce items that are over available stock."
      : digitalOverpaid
      ? "UPI and card are more than the bill amount."
      : null;

  const filteredVariants = useMemo(() => {
    const q = search.trim().toLowerCase();
    return variants
      .filter(
        (v) =>
          (modelFilter === "all" || v.model_code === modelFilter) &&
          (!q ||
            v.product_name.toLowerCase().includes(q) ||
            v.model_code.toLowerCase().includes(q) ||
            v.sku.toLowerCase().includes(q) ||
            (v.barcode && v.barcode.toLowerCase().includes(q)))
      )
      ;
  }, [variants, search, modelFilter]);

  const handleBarcodeKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter") return;
    const q = search.trim().toLowerCase();
    if (!q) return;
    const exact = variants.find(
      (v) => v.barcode?.toLowerCase() === q || v.sku.toLowerCase() === q
    );
    const single = exact ?? (filteredVariants.length === 1 ? filteredVariants[0] : undefined);
    if (single) {
      e.preventDefault();
      if (addVariantToCart(single)) {
        setSearch("");
        toast.success(`Added ${single.sku}`);
      }
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
                if (addVariantToCart(hit)) toast.success(`Scanned ${hit.sku}`);
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
                if (addVariantToCart(hit)) toast.success(`Scanned ${hit.sku}`);
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

  const submitInvoice = async (isDraft: boolean) => {
    if (cart.length === 0) {
      toast.error("Add at least one item to the bill.");
      return;
    }
    if (readCachedBlock(tenant.id, userId)) {
      toast.error("Your access is paused. Pay the bill or contact the administrator.");
      return;
    }
    if (!isDraft && finalizeBlock) {
      toast.error(finalizeBlock);
      return;
    }
    // Double-click / double-Enter guard: state updates are async, a ref is not.
    if (submitLockRef.current) return;
    submitLockRef.current = true;
    setSubmitting(true);
    const idempotencyKey = crypto.randomUUID();
    const payments: Array<{ mode: PaymentMode; amount: number }> = [
      { mode: "cash", amount: recordedCash },
      { mode: "upi", amount: payAmounts.upi },
      { mode: "card", amount: payAmounts.card },
    ];

    const payload = {
      idempotency_key: idempotencyKey,
      draft_id: draftToEdit?.id ?? null,
      is_draft: isDraft,
      branch_id: branchId,
      invoice_type: invoiceType,
      customer_id: crmEnabled && customerId ? customerId : null,
      customer_snapshot: selectedCustomer
        ? {
            name: walkInName.trim() || selectedCustomer.name,
            phone: walkInPhone.trim() || selectedCustomer.phone,
            gstin: walkInGstin.trim().toUpperCase() || selectedCustomer.gstin,
            state_code: effectivePlaceOfSupply,
            address: walkInAddress.trim() || selectedCustomer.address || null,
          }
        : {
            name: walkInName.trim() || "Walk-In Customer",
            phone: walkInPhone.trim() || null,
            gstin: walkInGstin.trim().toUpperCase() || null,
            state_code: effectivePlaceOfSupply,
            address: walkInAddress.trim() || null,
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
      credit_redeemed: appliedCredit,
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
        resetBill();
        return;
      }

      const invoiceId = await createOrFinalizeInvoiceAction(payload);
      toast.success(isDraft ? "Draft saved." : "Invoice finalized!");
      resetBill();
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
        resetBill();
      } else {
        toast.error(err instanceof Error ? err.message : "Failed to save invoice");
      }
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  };

  const stateOptions = Object.entries(INDIAN_STATES).map(([c, n]) => (
    <option key={c} value={c}>{c} — {n}</option>
  ));

  const walkInPhoneClean = normalizePhone(walkInPhone);
  const walkInGstinClean = normalizeGstin(walkInGstin);
  const matchedCustomer =
    !customerId && (walkInPhoneClean || walkInGstinClean)
      ? customers.find(
          (c) =>
            (walkInGstinClean && normalizeGstin(c.gstin) === walkInGstinClean) ||
            (walkInPhoneClean && normalizePhone(c.phone) === walkInPhoneClean)
        ) ?? null
      : null;

  const customerFields = (
    <div className="space-y-2.5">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <Input
          aria-label="Customer name"
          placeholder="Customer name"
          value={walkInName}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setWalkInName(e.target.value)}
        />
        <Input aria-label="Customer phone" placeholder="Phone number" inputMode="tel" value={walkInPhone} onChange={(e) => setWalkInPhone(e.target.value)} />
      </div>
      {detailsOpen || invoiceType === "sale" ? (
        <div className="ui-page space-y-2.5 rounded-xl border border-[#ececee] bg-[#fafafa] p-3 sm:p-3.5">
          <div className="flex flex-wrap items-center justify-between gap-1.5">
            <span className="text-[12px] font-semibold text-[#3f3f46]">
              Receiving Party GST Details <span className="font-normal text-[#77777d]">(Optional · Recommended)</span>
            </span>
            <span
              className={`max-w-full truncate rounded-full px-2.5 py-1 font-mono text-[10.5px] font-semibold ${
                gstCalc.supply_type === "inter_state"
                  ? "bg-sky-100 text-sky-800"
                  : "bg-emerald-50 text-emerald-700"
              }`}
            >
              {gstCalc.supply_type === "inter_state"
                ? `Inter-State (${INDIAN_STATES[effectivePlaceOfSupply] || effectivePlaceOfSupply}) → IGST`
                : `Same State → CGST + SGST`}
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <GstinInput value={walkInGstin} onChange={setWalkInGstin} onStateDetected={setWalkInState} />
            <Select aria-label="Place of supply" value={effectivePlaceOfSupply} onChange={(e) => setWalkInState(e.target.value)}>
              {stateOptions}
            </Select>
          </div>
          <Input
            aria-label="Receiving party address"
            placeholder="Company / Delivery Address (Recommended)"
            value={walkInAddress}
            onChange={(e) => setWalkInAddress(e.target.value)}
          />
        </div>
      ) : null}
      {crmEnabled ? (
        matchedCustomer ? (
          <button type="button" className="pos-link !text-emerald-700" onClick={() => chooseCustomer(matchedCustomer.id)}>
            Existing customer: {matchedCustomer.name}. Tap to use their account
          </button>
        ) : walkInPhoneClean || walkInGstinClean ? (
          <p className="text-[11px] font-medium text-emerald-700">Will be saved to Customers when finalized</p>
        ) : walkInPhone.trim() ? (
          <p className="text-[11px] font-medium text-amber-700">Enter a 10-digit phone number to save this customer</p>
        ) : (
          <p className="text-[11px] text-[#77777d]">Add a phone or GSTIN to save this customer</p>
        )
      ) : null}
    </div>
  );

  const billBody = (
    <div className="space-y-5 divide-y divide-[#f0f0f1] p-4 sm:p-5 [&>section+section]:pt-5">
      <section className="space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="ui-eyebrow">Customer</p>
          {!customerId && (
            <button type="button" className="pos-link" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((v) => !v)}>
              {detailsOpen ? "Hide GSTIN" : "GSTIN & state"}
              <ChevronDown className={`h-3 w-3 transition-transform duration-200 ${detailsOpen ? "rotate-180" : ""}`} />
            </button>
          )}
        </div>
        {crmEnabled ? (
          <Select aria-label="Customer" value={customerId} onChange={(e) => chooseCustomer(e.target.value)}>
            <option value="">Walk-In Customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.customer_type}) {c.current_due > 0 ? `• Due ₹${c.current_due}` : ""}
              </option>
            ))}
          </Select>
        ) : null}
        {!customerId ? customerFields : null}
        {customerId && invoiceType === "sale" ? (
          <div className="ui-page space-y-2.5 rounded-xl border border-[#ececee] bg-[#fafafa] p-3 sm:p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-1.5">
              <span className="text-[12px] font-semibold text-[#3f3f46]">
                Buyer GST &amp; Delivery <span className="font-normal text-[#77777d]">(Optional · Recommended)</span>
              </span>
              <span
                className={`max-w-full truncate rounded-full px-2.5 py-1 font-mono text-[10.5px] font-semibold ${
                  gstCalc.supply_type === "inter_state"
                    ? "bg-sky-100 text-sky-800"
                    : "bg-emerald-50 text-emerald-700"
                }`}
              >
                {gstCalc.supply_type === "inter_state"
                  ? `Inter-State (${INDIAN_STATES[effectivePlaceOfSupply] || effectivePlaceOfSupply}) → IGST`
                  : `Same State → CGST + SGST`}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <Input
                aria-label="Buyer company name"
                placeholder="Company / Party Name"
                value={walkInName}
                onChange={(e) => setWalkInName(e.target.value)}
              />
              <Input
                aria-label="Buyer phone"
                placeholder="Phone number"
                inputMode="tel"
                value={walkInPhone}
                onChange={(e) => setWalkInPhone(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <GstinInput value={walkInGstin} onChange={setWalkInGstin} onStateDetected={setWalkInState} />
              <Select aria-label="Place of supply" value={effectivePlaceOfSupply} onChange={(e) => setWalkInState(e.target.value)}>
                {stateOptions}
              </Select>
            </div>
            <Input
              aria-label="Buyer address"
              placeholder="Billing / Delivery Address (Recommended)"
              value={walkInAddress}
              onChange={(e) => setWalkInAddress(e.target.value)}
            />
          </div>
        ) : null}
        {selectedCustomer && creditBalance > 0 && (
          <div className="flex items-center justify-between gap-2 rounded-lg bg-emerald-50 px-2.5 py-2 text-xs text-emerald-800">
            <span>Credit available {money(creditBalance)}</span>
            <label className="flex items-center gap-1.5">
              Use ₹
              <input
                type="number"
                min={0}
                max={Math.min(creditBalance, gstCalc.grand_total)}
                value={creditRedeem}
                onChange={(e) =>
                  setCreditRedeem(Math.min(creditBalance, gstCalc.grand_total, Math.max(0, Number(e.target.value) || 0)))
                }
                className="h-7 w-20 rounded-md bg-white px-2 text-right font-mono font-medium shadow-[0_0_0_1px_rgba(5,150,105,.25)] focus:outline-none"
              />
            </label>
          </div>
        )}
        {selectedCustomer &&
          selectedCustomer.credit_limit > 0 &&
          selectedCustomer.current_due + gstCalc.grand_total > selectedCustomer.credit_limit && (
            <p className="text-xs font-medium text-rose-600">
              Exceeds dealer credit limit of {money(selectedCustomer.credit_limit)}
            </p>
          )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="ui-eyebrow">Bill Mode</p>
          {invoiceType === "sale" && (
            <div className="flex items-center gap-1.5">
              {activeBranch?.gstin && (
                <span className="truncate font-mono text-[11px] font-semibold text-[#55555b]">
                  {activeBranch.gstin}
                </span>
              )}
              <Link
                href="/dashboard/settings?tab=tax"
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#f1f1f2] px-2 py-1 text-[11px] font-semibold text-[#171717] transition-colors hover:bg-[#e4e4e7]"
                title="Set or change GST number & tax settings"
              >
                <Settings className="h-3 w-3" />
                GST Settings
              </Link>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-[#f1f1f2] p-[3px]">
          <button
            type="button"
            onClick={() => {
              setInvoiceType("estimate_bill_of_supply");
              setTaxMode("none");
            }}
            className={`min-h-[38px] cursor-pointer rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-all ${
              invoiceType === "estimate_bill_of_supply"
                ? "bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,.08)]"
                : "text-[#55555b] hover:text-[#171717]"
            }`}
          >
            Normal Bill
          </button>
          <button
            type="button"
            onClick={() => {
              setInvoiceType("sale");
              setTaxMode(tenant.tax_config.default_tax_mode === "exclusive" ? "exclusive" : "inclusive");
            }}
            className={`min-h-[38px] cursor-pointer rounded-[9px] px-3 py-2 text-[13px] font-semibold transition-all ${
              invoiceType === "sale"
                ? "bg-[#171717] text-white shadow-[0_1px_2px_rgba(0,0,0,.18)]"
                : "text-[#55555b] hover:text-[#171717]"
            }`}
          >
            GST Bill
          </button>
        </div>

        {invoiceType === "sale" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-[#55555b]">Tax Calculation</span>
              <div className="w-44 sm:w-48">
                <Select
                  aria-label="Tax mode"
                  value={taxMode}
                  onChange={(e) => setTaxMode(e.target.value as TaxMode)}
                  className="!text-[12.5px]"
                >
                  <option value="inclusive">Inclusive (MRP)</option>
                  <option value="exclusive">Exclusive (B2B)</option>
                  <option value="none">No Tax (0%)</option>
                </Select>
              </div>
            </div>

            {(!tenant.tax_config.gst_enabled || !activeBranch?.gstin) && (
              <div className="flex items-start justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2 text-[11px] text-amber-900">
                <div className="flex items-start gap-1.5">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                  <div>
                    <p className="font-semibold">GST Bill details not set</p>
                    <p className="text-[10.5px] text-amber-800">
                      {!tenant.tax_config.gst_enabled && !activeBranch?.gstin
                        ? "Turn on GST Billing and add your Branch GSTIN in Settings."
                        : !activeBranch?.gstin
                        ? `Add GSTIN for "${activeBranch?.name || "this branch"}" in Settings.`
                        : "Turn on GST Billing in System Settings."}
                    </p>
                  </div>
                </div>
                <Link
                  href={!activeBranch?.gstin && tenant.tax_config.gst_enabled ? "/dashboard/settings?tab=branches" : "/dashboard/settings?tab=tax"}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-900 px-2.5 py-1.5 text-[10.5px] font-semibold text-white hover:bg-amber-950"
                >
                  <Settings className="h-3 w-3" /> Setup
                </Link>
              </div>
            )}
          </div>
        )}
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <p className="ui-eyebrow">Items{cart.length > 0 ? ` (${cart.length})` : ""}</p>
          {discountsEnabled && cart.length > 0 ? (
            <button type="button" className="pos-link" aria-pressed={lineDiscOpen} onClick={() => setLineDiscOpen((v) => !v)}>
              {lineDiscOpen ? "Hide item discounts" : "Item discounts"}
            </button>
          ) : null}
        </div>
        {cart.length === 0 ? (
          <div className="pos-empty">
            <ShoppingCart aria-hidden="true" />
            <p>Your bill is empty</p>
            <small>Tap a product or scan a barcode</small>
          </div>
        ) : (
          <ul className="pos-lines">
            {cart.map((c, idx) => {
              const variant = c.variant_id ? variants.find((v) => v.variant_id === c.variant_id) : undefined;
              const limit = variant ? stockLimit(variant) : undefined;
              const systemStock = variant ? Math.max(0, Number(variant.stock_qty)) : undefined;
              const lowWarning = stockEnabled && systemStock !== undefined && c.qty > systemStock;
              const lineGross = c.qty * c.unit_price;
              const lineNet = Math.max(0, lineGross - (discountsEnabled ? c.line_discount_amount : 0));
              return (
                <li key={c.key} className="pos-line">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-[#171717]" title={c.product_name}>{c.product_name}</p>
                      <p className="mt-0.5 truncate text-[11.5px] text-[#77777d]">
                        {money(c.unit_price)} each
                        {posUi.show_hsn_col ? ` · HSN ${c.hsn_code || "—"} · GST ${gstCalc.items[idx]?.gst_rate ?? c.fallback_gst_rate}%` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[14px] font-semibold text-[#171717]">{money(lineNet)}</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <QtyStepper value={c.qty} max={limit} label={c.product_name} onChange={(q) => setLineQty(c.key, q)} />
                      <label className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-[#55555b]" title="Edit price per piece">
                        <span>₹</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`Unit price for ${c.product_name}`}
                          value={String(c.unit_price)}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                            const parsed = Number(cleaned);
                            if (cleaned === "" || Number.isFinite(parsed)) {
                              setCart((prev) =>
                                prev.map((it) =>
                                  it.key === c.key ? { ...it, unit_price: cleaned === "" ? 0 : Math.max(0, parsed) } : it
                                )
                              );
                            }
                          }}
                          className="h-6 w-16 bg-transparent text-right font-mono text-xs font-semibold text-[#171717] focus:outline-none"
                        />
                        <span className="text-[10px] text-[#77777d]">/pc</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (cartonLineKey === c.key) {
                            setCartonLineKey(null);
                          } else {
                            setCartonLineKey(c.key);
                            setCartonCount("1");
                            setCartonPack("20");
                          }
                        }}
                        className={`rounded-md border px-2 py-1 text-[10.5px] font-semibold cursor-pointer ${
                          cartonLineKey === c.key
                            ? "border-[#171717] bg-[#171717] text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                        title="Enter quantity by Cartons / Boxes"
                      >
                        Box/Ctn
                      </button>
                      <label className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-[#55555b]" title="Edit HSN code">
                        <span className="text-[10px] text-[#77777d]">HSN</span>
                        <input
                          type="text"
                          aria-label={`HSN code for ${c.product_name}`}
                          value={c.hsn_code ?? ""}
                          placeholder="—"
                          onChange={(e) => {
                            const val = e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 8);
                            setCart((prev) =>
                              prev.map((it) => (it.key === c.key ? { ...it, hsn_code: val || null } : it))
                            );
                          }}
                          className="h-6 w-14 bg-transparent text-right font-mono text-xs font-medium text-[#171717] focus:outline-none"
                        />
                      </label>
                      <label className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-[#55555b]" title="Edit GST percentage">
                        <span className="text-[10px] text-[#77777d]">GST</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          aria-label={`GST percentage for ${c.product_name}`}
                          value={String(c.custom_gst ? c.fallback_gst_rate : gstCalc.items[idx]?.gst_rate ?? c.fallback_gst_rate)}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                            const parsed = Number(cleaned);
                            if (cleaned === "" || (Number.isFinite(parsed) && parsed >= 0 && parsed <= 40)) {
                              setCart((prev) =>
                                prev.map((it) =>
                                  it.key === c.key
                                    ? {
                                        ...it,
                                        fallback_gst_rate: cleaned === "" ? 0 : parsed,
                                        custom_gst: true,
                                      }
                                    : it
                                )
                              );
                            }
                          }}
                          className="h-6 w-10 bg-transparent text-right font-mono text-xs font-semibold text-[#171717] focus:outline-none"
                        />
                        <span className="text-[10px] text-[#77777d]">%</span>
                      </label>
                    </div>
                    {discountsEnabled && lineDiscOpen ? (
                      <label className="flex items-center gap-1.5 text-[11px] text-[#77777d]">
                        Discount ₹
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="0"
                          value={c.line_discount_amount || ""}
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                            const d = Math.min(lineGross, Math.max(0, Number(cleaned) || 0));
                            setCart((prev) => prev.map((it) => (it.key === c.key ? { ...it, line_discount_amount: d } : it)));
                          }}
                          className="h-7 w-16 rounded-md bg-white px-2 text-right font-mono text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.1)] focus:shadow-[0_0_0_1px_#171717] focus:outline-none"
                        />
                      </label>
                    ) : c.line_discount_amount > 0 && discountsEnabled ? (
                      <span className="text-[11px] text-emerald-700">−{money(c.line_discount_amount)}</span>
                    ) : null}
                  </div>
                  {cartonLineKey === c.key && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-[11px]">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={cartonCount}
                        onChange={(e) => setCartonCount(e.target.value.replace(/\D/g, ""))}
                        className="h-7 w-14 rounded-md border border-slate-300 bg-white px-2 text-center font-mono text-xs"
                        placeholder="Ctn"
                        aria-label="Number of cartons"
                      />
                      <span className="text-slate-500">Ctn ×</span>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={cartonPack}
                        onChange={(e) => setCartonPack(e.target.value.replace(/\D/g, ""))}
                        className="h-7 w-14 rounded-md border border-slate-300 bg-white px-2 text-center font-mono text-xs"
                        placeholder="Pcs"
                        aria-label="Pieces per carton"
                      />
                      <span className="font-mono font-semibold text-slate-700">
                        = {(Number(cartonCount || 0) * Number(cartonPack || 0)).toLocaleString("en-IN")} pcs
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const totalPcs = Number(cartonCount || 0) * Number(cartonPack || 0);
                          if (totalPcs > 0) {
                            setLineQty(c.key, totalPcs);
                            setCartonLineKey(null);
                          }
                        }}
                        className="ml-auto rounded-md bg-[#171717] px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-slate-800 cursor-pointer"
                      >
                        Apply
                      </button>
                    </div>
                  )}
                  {lowWarning ? (
                    <p className="mt-1.5 text-[11px] font-medium text-amber-700">
                      Warning: Only {systemStock} recorded in system — you can still bill {c.qty}.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {discountsEnabled && cart.length > 0 && (
        <section>
          <p className="ui-eyebrow mb-2.5">Bill Discount</p>
          <div className="flex gap-2">
            <Segmented
              label="Discount type"
              options={["₹", "%"] as const}
              value={billDiscType === "flat" ? "₹" : "%"}
              onChange={(v) => {
                setBillDiscType(v === "₹" ? "flat" : "percent");
                setBillDiscVal(0);
              }}
            />
            <Input
              aria-label={billDiscType === "flat" ? "Discount in rupees" : "Discount percent"}
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={billDiscVal || ""}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                const raw = Math.max(0, Number(cleaned) || 0);
                setBillDiscVal(billDiscType === "percent" ? Math.min(100, raw) : raw);
              }}
              className="flex-1 font-mono"
            />
          </div>
        </section>
      )}

      {cart.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-center justify-between gap-2">
            <p className="ui-eyebrow">Payment</p>
            <span className="text-[11.5px] text-[#77777d]">Tap a method to pay in full</span>
          </div>
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${payModes.length}, minmax(0, 1fr))` }}>
            {payModes.map((m) => {
              const Icon = PAY_ICON[m];
              const amount = payAmounts[m];
              return (
                <div key={m} className="pos-pay" data-active={amount > 0 || undefined}>
                  <button type="button" onClick={() => setFullMode(m)} aria-pressed={fullMode === m} aria-label={`Pay full amount by ${PAY_LABEL[m]}`}>
                    <Icon aria-hidden="true" />
                    {PAY_LABEL[m]}
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    aria-label={`${PAY_LABEL[m]} amount`}
                    value={amount || ""}
                    placeholder="0"
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^0-9.]/g, "");
                      editPayment(m, Math.max(0, Number(cleaned) || 0));
                    }}
                  />
                </div>
              );
            })}
          </div>
          {changeDue > 0 ? <p className="mt-1.5 text-xs font-medium text-emerald-700">Return change: {money(changeDue)}</p> : null}
          {digitalOverpaid ? <p className="mt-1.5 text-xs font-medium text-rose-600">UPI and card are more than the bill amount.</p> : null}
          {balanceDue > 0 && !digitalOverpaid ? (
            <p className="mt-1.5 text-xs font-medium text-amber-700">
              {money(balanceDue)} will stay due{customerId ? " on this customer's account" : ". Select a customer to track it"}
            </p>
          ) : null}
        </section>
      )}

      {gstCalc.grand_total >= 50000 && (
        <section>
          <p className="ui-eyebrow mb-2.5">E-Way Bill No</p>
          <Input value={ewayBillNo} onChange={(e) => setEwayBillNo(e.target.value)} placeholder="12-digit EWB number" />
        </section>
      )}
    </div>
  );

  const billFooter = (
    <div className="space-y-2.5 p-[3px] pt-1.5">
      <div className="pos-total">
        {showBreakdown ? (
          <dl className="ui-page mb-2 space-y-1 border-b border-white/15 pb-2 text-[11.5px] text-white/70">
            <div className="flex justify-between"><dt>Subtotal</dt><dd className="font-mono">{money(gstCalc.subtotal)}</dd></div>
            {gstCalc.discount_amount > 0 ? <div className="flex justify-between"><dt>Discount</dt><dd className="font-mono">−{money(gstCalc.discount_amount)}</dd></div> : null}
            <div className="flex justify-between"><dt>Taxable</dt><dd className="font-mono">{money(gstCalc.taxable_amount)}</dd></div>
            {gstCalc.supply_type === "intra_state" ? (
              <>
                <div className="flex justify-between"><dt>CGST</dt><dd className="font-mono">{money(gstCalc.cgst_amount)}</dd></div>
                <div className="flex justify-between"><dt>SGST</dt><dd className="font-mono">{money(gstCalc.sgst_amount)}</dd></div>
              </>
            ) : (
              <div className="flex justify-between"><dt>IGST</dt><dd className="font-mono">{money(gstCalc.igst_amount)}</dd></div>
            )}
            {gstCalc.round_off !== 0 ? <div className="flex justify-between"><dt>Round off</dt><dd className="font-mono">{money(gstCalc.round_off)}</dd></div> : null}
            {appliedCredit > 0 ? <div className="flex justify-between"><dt>Credit used</dt><dd className="font-mono">−{money(appliedCredit)}</dd></div> : null}
          </dl>
        ) : null}
        <button type="button" className="flex w-full cursor-pointer items-center justify-between gap-2 text-left" aria-expanded={showBreakdown} onClick={() => setShowBreakdown((v) => !v)}>
          <span>
            <span className="flex items-center gap-1 text-[11px] text-white/65">
              {itemCount} {itemCount === 1 ? "item" : "items"} · Tax details
              <ChevronUp className={`h-3 w-3 transition-transform duration-200 ${showBreakdown ? "rotate-180" : ""}`} />
            </span>
            <span className="text-[14px] font-semibold">Grand Total</span>
          </span>
          <span key={gstCalc.grand_total} className="pos-total-value">{money(gstCalc.grand_total)}</span>
        </button>
      </div>
      {finalizeBlock && cart.length > 0 ? <p className="px-1 text-[11px] font-medium text-rose-600">{finalizeBlock}</p> : null}
      <div className="flex gap-2">
        {canEditDraft && (
          <Button variant="outline" size="lg" className="!min-h-[46px] flex-none !px-3.5" disabled={submitting || cart.length === 0} onClick={() => submitInvoice(true)}>
            <Save className="h-4 w-4" /> Hold
          </Button>
        )}
        <Button
          variant="outline"
          size="lg"
          className="!min-h-[46px] flex-none !px-3.5"
          disabled={submitting || cart.length === 0}
          onClick={() => setPreviewOpen(true)}
          title="Preview bill before printing"
        >
          <Eye className="h-4 w-4" /> Preview
        </Button>
        <Button size="lg" className="!min-h-[46px] flex-1" disabled={submitting || cart.length === 0 || Boolean(finalizeBlock)} onClick={() => submitInvoice(false)}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
          {submitting ? "Saving..." : "Finalize & Print"}
        </Button>
      </div>
    </div>
  );

  const billHeader = (
    <header className="flex min-h-[44px] items-center justify-between gap-2 px-3.5 py-2">
      <span className="ui-eyebrow flex min-w-0 items-center gap-2">
        Current Bill
        {itemCount > 0 ? <span key={itemCount} className="pos-header-count">{itemCount}</span> : null}
      </span>
      {cart.length > 0 ? (
        <button type="button" className="pos-link pos-link--danger" onClick={clearBill}>
          <Trash2 className="h-3 w-3" /> Clear
        </button>
      ) : null}
    </header>
  );

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1>POS Terminal</h1>
          <p className="mt-0.5 text-[12.5px] text-[#77777d]">
            Billing from <span className="font-medium text-[#27272a]">{activeBranch?.name ?? "no branch"}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {!branchLocked && billableBranches.length > 1 && (
            <Select aria-label="Billing branch" value={branchId} onChange={(e) => setBranchId(e.target.value)} className="!w-48">
              {billableBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name} ({b.code})</option>
              ))}
            </Select>
          )}
          {stockEnabled && ratioPresets.length > 0 && productModels.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                setSizeRunModel(productModels[0]?.code ?? "");
                setSizeRunOpen(true);
              }}
            >
              <Layers className="h-4 w-4" /> Size-Run
            </Button>
          )}
          <Button variant="outline" onClick={() => setFreeOpen(true)}>
            <Plus className="h-4 w-4" /> Quick Item
          </Button>
        </div>
      </div>

      {activeBranch?.is_read_only ? (
        <Alert variant="warning" title="This branch is read-only">
          It is over the branch limit for this plan. Switch to another branch to create bills.
        </Alert>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_420px] xl:grid-cols-[minmax(0,1fr)_470px] 2xl:grid-cols-[minmax(0,1fr)_520px]">
        <div className="min-w-0 space-y-3 pb-20 lg:pb-0">
          <div className="ui-tray flex gap-1 !p-1">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-[#a3a3a8]" />
              <Input
                autoFocus
                aria-label="Search or scan products"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleBarcodeKey}
                placeholder="Scan barcode, or search name, model or SKU..."
                className="!pl-8"
              />
            </div>
            <Button variant="outline" onClick={startCameraScan} title="Scan with camera" aria-label="Scan with camera">
              <Camera className="h-4 w-4" />
            </Button>
          </div>

          {productModels.length > 1 && (
            <div className="no-scrollbar flex gap-1 overflow-x-auto" role="group" aria-label="Filter by product">
              {[{ code: "all", name: "All products" }, ...productModels].map((m) => (
                <button
                  key={m.code}
                  type="button"
                  aria-pressed={modelFilter === m.code}
                  onClick={() => setModelFilter(m.code)}
                  className="pos-chip"
                >
                  {m.name}
                </button>
              ))}
            </div>
          )}

          {!stockEnabled || variants.length === 0 ? (
            <Card>
              <CardContent className="space-y-3 p-8 text-center">
                <p className="text-[13px] text-[#77777d]">
                  {stockEnabled ? "No products in this branch yet." : "Stock is off for your access. Use Quick Item to bill."}
                </p>
                <Button onClick={() => setFreeOpen(true)}>
                  <Plus className="h-4 w-4" /> Add Quick Item
                </Button>
              </CardContent>
            </Card>
          ) : filteredVariants.length === 0 ? (
            <div className="ui-tray"><p className="ui-surface p-8 text-center text-[13px] text-[#77777d]">No products match your search.</p></div>
          ) : (
            <div className={posUi.layout === "list" ? "grid grid-cols-1 gap-2" : "grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3"}>
              <Paged items={filteredVariants} size={12} key={`${search}|${modelFilter}`}>{(pagedRows) => pagedRows.map((v) => (
                <PosProductCard
                  key={v.variant_id}
                  name={v.product_name}
                  attributes={Object.values(v.attributes)}
                  sku={v.sku}
                  price={priceFor(v)}
                  stock={v.stock_qty}
                  trackStock={stockEnabled}
                  qty={qtyByVariant.get(v.variant_id) ?? 0}
                  limit={stockLimit(v)}
                  thumb={posUi.show_thumbs ? v.thumb_url : null}
                  onAdd={() => addVariantToCart(v)}
                  onSetQty={(q) => setVariantQty(v, q)}
                />
              ))}</Paged>
            </div>
          )}
        </div>

        <aside className="ui-tray sticky top-[64px] hidden max-h-[calc(100dvh-76px)] flex-col lg:flex" aria-label="Current bill">
          {billHeader}
          <div className="ui-surface min-h-0 flex-1 overflow-y-auto">{billBody}</div>
          {billFooter}
        </aside>
      </div>

      <div className="fixed inset-x-3 bottom-[60px] z-20 lg:hidden">
        <Button className="w-full justify-between shadow-xl" size="lg" onClick={() => setMobileCartOpen(true)}>
          <span className="inline-flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <span className="font-mono">{money(gstCalc.grand_total)}</span>
        </Button>
      </div>

      <Dialog open={mobileCartOpen} onClose={() => setMobileCartOpen(false)} title="Current Bill">
        <div className="-m-4 sm:-m-5">
          {billBody}
          <div className="sticky bottom-0 border-t border-[#ececee] bg-white p-2 pb-[max(8px,env(safe-area-inset-bottom))]">{billFooter}</div>
        </div>
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
            variants={sizeRunVariants}
            onApply={(hits) => {
              const isWholesale = selectedCustomer?.customer_type === "wholesale";
              setCart((prev) => {
                const next = [...prev];
                for (const { variant: hit, qty } of hits) {
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
              setSizeRunOpen(false);
            }}
          />
        </div>
      </Dialog>

      <Dialog open={freeOpen} onClose={() => setFreeOpen(false)} title="Add Quick / Free-Text Item">
        <Form
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
        </Form>
      </Dialog>

      {/* Live Bill Preview Modal (before finalizing & printing) */}
      <Dialog
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        title="Bill Preview"
        subtitle="Check all details below. Close to edit, or click Finalize & Print to confirm."
        maxWidth="max-w-3xl"
      >
        <div className="space-y-4">
          <div className="max-h-[62vh] overflow-y-auto rounded-xl bg-[#f4f7fb] p-3">
            <InvoiceRenderer
              format={defaultTemplate?.format ?? "a4"}
              config={
                ({
                  header_title: tenant.name.toUpperCase(),
                  header_subtitle: invoiceType === "sale" ? "GST Tax Invoice" : "Cash Memo / Bill",
                  footer_note: "Thank you for your business!",
                  terms: "",
                  accent_color: tenant.brand_config?.primary_color ?? "#171717",
                  design_style: invoiceType === "sale" ? "gst_full" : "classic",
                  show_logo: true,
                  show_hsn: invoiceType === "sale",
                  show_discount: true,
                  show_custom_fields: false,
                  show_upi_qr: true,
                  ...(defaultTemplate?.config ?? {}),
                  show_gst_summary:
                    invoiceType === "estimate_bill_of_supply"
                      ? false
                      : defaultTemplate?.config?.show_gst_summary ?? true,
                }) as BillTemplateConfig
              }
              data={{
                logoUrl,
                invoiceNumber: "PREVIEW",
                invoiceType,
                dateStr: new Date().toLocaleString("en-IN", {
                  timeZone: "Asia/Kolkata",
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
                branchName: activeBranch?.name ?? tenant.name,
                branchAddress: activeBranch?.address ?? null,
                branchGstin: activeBranch?.gstin ?? null,
                customerName: walkInName.trim() || selectedCustomer?.name || "Walk-In Customer",
                customerPhone: walkInPhone.trim() || selectedCustomer?.phone || null,
                customerGstin: walkInGstin.trim().toUpperCase() || selectedCustomer?.gstin || null,
                customerAddress: walkInAddress.trim() || selectedCustomer?.address || null,
                placeOfSupply: INDIAN_STATES[effectivePlaceOfSupply]
                  ? `${INDIAN_STATES[effectivePlaceOfSupply]} (${effectivePlaceOfSupply})`
                  : effectivePlaceOfSupply,
                taxableAmount: gstCalc.taxable_amount,
                cgstAmount: gstCalc.cgst_amount,
                sgstAmount: gstCalc.sgst_amount,
                igstAmount: gstCalc.igst_amount,
                roundOff: gstCalc.round_off,
                grandTotal: gstCalc.grand_total,
                paidAmount,
                dueAmount: balanceDue,
                items: gstCalc.items.map((it) => ({
                  product_name: it.product_name,
                  sku: it.sku,
                  hsn_code: it.hsn_code,
                  qty: it.qty,
                  unit_price: it.unit_price,
                  gst_rate: it.gst_rate,
                  line_total: it.line_total,
                })),
              }}
            />
          </div>
          {finalizeBlock && (
            <p className="text-xs font-medium text-rose-600">{finalizeBlock}</p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setPreviewOpen(false)}>
              Close &amp; Edit Bill
            </Button>
            <Button
              type="button"
              disabled={submitting || Boolean(finalizeBlock)}
              onClick={async () => {
                setPreviewOpen(false);
                await submitInvoice(false);
              }}
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
              {submitting ? "Saving..." : "Finalize & Print"}
            </Button>
          </div>
        </div>
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
