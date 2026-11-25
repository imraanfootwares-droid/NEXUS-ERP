"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Download,
  Inbox,
  Layers,
  MessageCircle,
  Minus,
  Package,
  Plus,
  Search,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Form, Badge, Button, Dialog, Input, Label } from "@/components/ui/primitives";
import { buildStructuredWhatsAppMessage, type WhatsAppCartLine } from "@/lib/storefront/whatsapp-message";
import type { EnquiryChannel } from "@/types/database";

export interface StorefrontProductItem {
  product_id: string;
  model_code: string;
  name: string;
  category: string | null;
  brand: string | null;
  uom: string;
  description: string | null;
  custom_fields: Record<string, unknown>;
  is_new_arrival: boolean;
  thumb_url: string | null;
  full_url: string | null;
  variants: Array<{
    id: string;
    sku: string;
    attributes: Record<string, string>;
    mrp: number | null;
    display_price: number | null;
    in_stock: boolean;
  }>;
}

type CartEntry = WhatsAppCartLine;

function EditableCartQty({
  qty,
  label,
  onChange,
  variant = "dark",
}: {
  qty: number;
  label: string;
  onChange: (nextQty: number) => void;
  variant?: "dark" | "light";
}) {
  const [draft, setDraft] = useState(String(qty));
  const [focused, setFocused] = useState(false);

  const display = focused ? draft : String(qty);

  return (
    <div
      className={`flex items-center justify-between rounded-lg px-1 py-0.5 ${
        variant === "dark"
          ? "flex-1 bg-[#171717] text-white shadow-[0_1px_2px_rgba(0,0,0,.22)]"
          : "w-28 border border-slate-200 bg-white text-[#171717]"
      }`}
    >
      <button
        type="button"
        aria-label={qty <= 1 ? `Remove ${label}` : `Decrease ${label}`}
        onClick={() => onChange(qty - 1)}
        className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-transform active:scale-90 ${
          variant === "dark" ? "text-white/90 hover:bg-white/15" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {qty <= 1 ? (
          <Trash2 className={`h-3.5 w-3.5 ${variant === "dark" ? "text-rose-300" : "text-rose-500"}`} />
        ) : (
          <Minus className="h-3.5 w-3.5" />
        )}
      </button>
      <input
        type="text"
        inputMode="numeric"
        aria-label={`Quantity for ${label}`}
        value={display}
        onFocus={(e) => {
          setDraft(String(qty));
          setFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/\D/g, "").slice(0, 6);
          setDraft(cleaned);
          const n = Number(cleaned);
          if (cleaned !== "" && Number.isFinite(n) && n > 0) {
            onChange(n);
          }
        }}
        onBlur={() => {
          setFocused(false);
          const n = Number(draft);
          if (draft === "" || !Number.isFinite(n) || n <= 0) {
            onChange(0);
          } else {
            onChange(n);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        className={`h-7 min-w-0 flex-1 bg-transparent text-center font-mono text-xs font-bold focus:outline-none ${
          variant === "dark" ? "text-white placeholder:text-white/50" : "text-[#171717]"
        }`}
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(qty + 1)}
        className={`flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-transform active:scale-90 ${
          variant === "dark" ? "text-white/90 hover:bg-white/15" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function StorefrontClient({
  slug,
  tenantName,
  logoUrl = null,
  whatsappNumber,
  enquiryChannel = "whatsapp",
  enquiriesEnabled = false,
  catalogueEnabled = true,
  heroTitle,
  heroSubtitle,
  showSizes = true,
  showBrand = true,
  showDescription = true,
  showCartonInfo = true,
  products,
}: {
  slug: string;
  tenantName: string;
  logoUrl?: string | null;
  whatsappNumber: string;
  enquiryChannel?: EnquiryChannel;
  enquiriesEnabled?: boolean;
  catalogueEnabled?: boolean;
  heroTitle: string;
  heroSubtitle: string;
  showSizes?: boolean;
  showBrand?: boolean;
  showDescription?: boolean;
  showCartonInfo?: boolean;
  products: StorefrontProductItem[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [attrFilter, setAttrFilter] = useState("ALL");
  const [pickerProduct, setPickerProduct] = useState<StorefrontProductItem | null>(null);
  const [pickerDraftQty, setPickerDraftQty] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) if (p.category) set.add(p.category);
    return ["ALL", ...Array.from(set)];
  }, [products]);

  const attrOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      for (const v of p.variants) {
        for (const val of Object.values(v.attributes ?? {})) {
          if (val) set.add(val);
        }
      }
    }
    return ["ALL", ...Array.from(set).slice(0, 16)];
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (categoryFilter !== "ALL" && p.category !== categoryFilter) return false;
      if (
        attrFilter !== "ALL" &&
        !p.variants.some((v) => Object.values(v.attributes ?? {}).includes(attrFilter))
      ) {
        return false;
      }
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.model_code.toLowerCase().includes(q) ||
        (p.brand ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, categoryFilter, attrFilter]);

  const setVariantQty = (variantId: string, nextQty: number) => {
    setCart((prev) => {
      if (nextQty <= 0) return prev.filter((c) => c.variantId !== variantId);
      return prev.map((c) => (c.variantId === variantId ? { ...c, qty: nextQty } : c));
    });
  };

  const openVariantPicker = (p: StorefrontProductItem) => {
    const initialDraft: Record<string, string> = {};
    for (const v of p.variants) {
      const existing = cart.find((c) => c.variantId === v.id)?.qty ?? 0;
      initialDraft[v.id] = existing > 0 ? String(existing) : "";
    }
    setPickerDraftQty(initialDraft);
    setPickerProduct(p);
  };

  const saveVariantPicker = () => {
    if (!pickerProduct) return;
    setCart((prev) => {
      const variantIds = new Set(pickerProduct.variants.map((v) => v.id));
      const kept = prev.filter((c) => !variantIds.has(c.variantId));
      const added: CartEntry[] = [];
      for (const v of pickerProduct.variants) {
        const qty = Math.max(0, Number(pickerDraftQty[v.id] || 0));
        if (qty > 0) {
          added.push({
            productId: pickerProduct.product_id,
            variantId: v.id,
            name: pickerProduct.name,
            modelCode: pickerProduct.model_code,
            sku: v.sku,
            attrs: Object.values(v.attributes).join(" / "),
            uom: pickerProduct.uom || "Pair",
            price: v.display_price,
            qty,
            imageUrl: pickerProduct.full_url || pickerProduct.thumb_url,
          });
        }
      }
      return [...kept, ...added];
    });
    setPickerProduct(null);
  };

  const addToCart = (p: StorefrontProductItem) => {
    if (p.variants.length > 1) {
      openVariantPicker(p);
      return;
    }
    const v = p.variants[0];
    if (!v) return;
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.variantId === v.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          productId: p.product_id,
          variantId: v.id,
          name: p.name,
          modelCode: p.model_code,
          sku: v.sku,
          attrs: Object.values(v.attributes).join(" / "),
          uom: p.uom || "Pair",
          price: v.display_price,
          qty: 1,
          imageUrl: p.full_url || p.thumb_url,
        },
      ];
    });
  };

  const cleanWa = whatsappNumber.replace(/\D/g, "");
  const effectiveChannel: EnquiryChannel =
    enquiryChannel === "whatsapp" && !cleanWa && enquiriesEnabled
      ? "inbox"
      : enquiryChannel === "inbox" && !enquiriesEnabled && cleanWa
      ? "whatsapp"
      : enquiryChannel;
  const canInbox = enquiriesEnabled && (effectiveChannel === "inbox" || effectiveChannel === "both");
  const canWhatsapp = Boolean(cleanWa) && (effectiveChannel === "whatsapp" || effectiveChannel === "both");

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const formattedWaMessage = buildStructuredWhatsAppMessage({
    tenantName,
    slug,
    origin,
    items: cart,
    customerName,
    customerContact,
    message,
  });
  const waText = encodeURIComponent(formattedWaMessage);

  const handleSubmitEnquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");
    if (!canInbox) {
      if (canWhatsapp) {
        window.open(`https://wa.me/${cleanWa}?text=${waText}`, "_blank", "noopener,noreferrer");
      }
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/storefront-enquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          customerName,
          customerContact,
          message: message || undefined,
          items: cart.map((c) => ({
            name: c.name,
            sku: c.sku,
            attrs: c.attrs || undefined,
            qty: c.qty,
            price: c.price,
          })),
          source: "storefront",
          channel: canWhatsapp ? "both" : "inbox",
          website: honeypot,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data.error || "Could not send enquiry.");
        return;
      }
      setSubmitted(true);
      if (canWhatsapp) {
        window.open(`https://wa.me/${cleanWa}?text=${waText}`, "_blank", "noopener,noreferrer");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalCartItems = cart.reduce((s, c) => s + c.qty, 0);
  const initials = tenantName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div
      className="min-h-screen px-2.5 py-4 sm:px-6 sm:py-8"
      style={{
        background:
          "radial-gradient(ellipse 90% 60% at 50% 0%, #dbeafe 0%, #eff6ff 40%, #f8fafc 75%, #ffffff 100%)",
      }}
    >
      {/* Frosted Glass Enclosure — inspired by the Spark dashboard showcase */}
      <div className="mx-auto max-w-6xl rounded-[28px] border border-white/90 bg-white/65 p-2.5 shadow-[0_24px_80px_rgba(15,23,42,0.08),0_2px_12px_rgba(59,130,246,0.06)] backdrop-blur-xl sm:p-4">
        <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
          {/* Clean Light Top Navigation Bar */}
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3.5 backdrop-blur-md sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={tenantName}
                    className="h-10 w-10 shrink-0 rounded-xl border border-slate-200 bg-white object-contain p-1 shadow-2xs"
                  />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#171717] text-xs font-bold text-white shadow-2xs">
                    {initials || "ST"}
                  </span>
                )}
                <div className="min-w-0">
                  <h1 className="truncate text-base font-semibold tracking-tight text-[#171717]">
                    {tenantName}
                  </h1>
                  <p className="truncate text-[11.5px] text-[#77777d]">
                    Official Product Catalogue &amp; New Arrivals
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {catalogueEnabled && (
                  <a
                    href={`/api/public/catalogue/${encodeURIComponent(slug)}?download=1`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#171717] shadow-2xs transition-colors hover:bg-slate-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">Download PDF</span>
                    <span className="sm:hidden">PDF</span>
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setCartOpen(true)}
                  className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-xl bg-[#171717] px-3.5 text-xs font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,.18)] transition-transform active:scale-95 hover:bg-[#2a2a2a]"
                >
                  <ShoppingBag className="h-3.5 w-3.5" />
                  <span>Inquiry Cart</span>
                  <span
                    key={totalCartItems}
                    style={totalCartItems > 0 ? { animation: "pos-pop 260ms var(--ui-ease)" } : undefined}
                    className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-white/20 px-1.5 py-0.5 font-mono text-[10.5px]"
                  >
                    {totalCartItems}
                  </span>
                </button>
              </div>
            </div>
          </header>

          {/* Clean Light Hero Header inside Glass Shell */}
          <section className="border-b border-slate-100 bg-gradient-to-b from-[#f8fbff] to-white px-4 py-6 text-center sm:px-6 sm:py-8">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1 text-[11px] font-semibold text-sky-800">
              {products.length} {products.length === 1 ? "Product" : "Products"} Available
            </span>
            <h2 className="mt-2.5 text-2xl font-semibold tracking-tight text-[#171717] sm:text-3xl">
              {heroTitle || "New Arrivals Showcase"}
            </h2>
            {heroSubtitle && (
              <p className="mx-auto mt-1.5 max-w-xl text-xs text-[#77777d] sm:text-sm">
                {heroSubtitle}
              </p>
            )}
          </section>

          {/* Search, Category & Size Filters */}
          <main className="space-y-5 p-4 sm:p-6">
            <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
              <div className="relative max-w-md flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search product name, model code, or brand..."
                  className="bg-[#f8fafc] pl-9"
                />
              </div>
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
                      categoryFilter === cat
                        ? "bg-[#171717] text-white shadow-2xs"
                        : "border border-slate-200 bg-white text-[#55555b] hover:bg-slate-50"
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {showSizes && attrOptions.length > 2 && (
              <div className="no-scrollbar flex items-center gap-1.5 overflow-x-auto">
                <span className="mr-1 whitespace-nowrap text-[11px] font-semibold text-[#77777d]">
                  Filter Size / Colour:
                </span>
                {attrOptions.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setAttrFilter(opt)}
                    className={`cursor-pointer whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      attrFilter === opt
                        ? "bg-sky-600 text-white"
                        : "border border-slate-200 bg-white text-slate-600 hover:border-sky-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {/* Rich Product Cards Grid */}
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 py-14 text-center">
                <Package className="mx-auto h-8 w-8 text-slate-300" />
                <p className="mt-2 text-sm font-medium text-slate-600">No products match your filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map((p) => {
                  const activeVariant = p.variants[0];
                  const activeQty = activeVariant
                    ? cart.find((c) => c.variantId === activeVariant.id)?.qty ?? 0
                    : 0;
                  const selectedInCart = cart.filter((c) => c.productId === p.product_id);
                  const productTotalQty = selectedInCart.reduce((sum, c) => sum + c.qty, 0);
                  const displayPrice = activeVariant?.display_price ?? p.variants[0]?.display_price;
                  const mrp = activeVariant?.mrp ?? p.variants[0]?.mrp;
                  const inStock = p.variants.some((v) => v.in_stock);
                  const pcsPerCarton = Number(p.custom_fields?.pieces_per_carton || 0);
                  const uniqueSizes = Array.from(
                    new Set(
                      p.variants
                        .map((v) =>
                          Object.entries(v.attributes ?? {})
                            .filter(([k]) => k.toLowerCase().includes("size"))
                            .map(([, val]) => val)
                        )
                        .flat()
                        .filter(Boolean)
                    )
                  );
                  const extraEntries = Object.entries(p.custom_fields ?? {}).filter(
                    ([k, v]) => k !== "pieces_per_carton" && v !== null && String(v).trim().length > 0
                  );

                  return (
                    <article
                      key={p.product_id}
                      className={`flex flex-col justify-between overflow-hidden rounded-2xl border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,0.08)] ${
                        productTotalQty > 0
                          ? "border-[#171717] ring-1 ring-[#171717]/10 shadow-[0_6px_20px_rgba(15,23,42,0.08)]"
                          : "border-slate-200/90 shadow-[0_2px_10px_rgba(15,23,42,0.04)]"
                      }`}
                    >
                      <div>
                        {/* Clean Image Frame */}
                        <Link href={`/s/${slug}/product/${p.product_id}`} className="block">
                          <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden border-b border-slate-100 bg-[#f8fafc] p-3">
                            {p.thumb_url ? (
                              <img
                                src={p.thumb_url}
                                alt={p.name}
                                className="h-full w-full object-contain transition-transform duration-300 hover:scale-105"
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-1 text-slate-400">
                                <Package className="h-7 w-7 opacity-40" />
                                <span className="font-mono text-[11px]">{p.model_code}</span>
                              </div>
                            )}
                            <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1">
                              {p.is_new_arrival && (
                                <span className="rounded-full bg-[#171717] px-2 py-0.5 text-[10px] font-bold tracking-wide text-white">
                                  NEW
                                </span>
                              )}
                              {p.category && (
                                <span className="rounded-full border border-slate-200/80 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-700 backdrop-blur-xs">
                                  {p.category}
                                </span>
                              )}
                            </div>
                            {productTotalQty > 0 && (
                              <span
                                key={productTotalQty}
                                style={{ animation: "pos-pop 260ms var(--ui-ease)" }}
                                className="absolute right-2.5 top-2.5 inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#171717] px-1.5 font-mono text-[11px] font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.22),0_0_0_2px_#fff]"
                              >
                                {productTotalQty}
                              </span>
                            )}
                          </div>
                        </Link>

                        {/* Complete Product Details */}
                        <div className="space-y-2.5 p-3.5">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <Link
                                href={`/s/${slug}/product/${p.product_id}`}
                                className="line-clamp-1 text-sm font-semibold text-[#171717] hover:underline"
                              >
                                {p.name}
                              </Link>
                              <Badge variant={inStock ? "success" : "default"}>
                                {inStock ? "Available" : "On Order"}
                              </Badge>
                            </div>
                            <p className="mt-0.5 text-[11px] text-[#77777d]">
                              Code: <span className="font-mono font-medium text-slate-700">{p.model_code}</span>
                              {showBrand && p.brand ? ` · ${p.brand}` : ""}
                            </p>
                          </div>

                          {/* Price Row */}
                          <div className="flex items-baseline gap-2">
                            {displayPrice != null ? (
                              <>
                                <span className="font-mono text-base font-bold text-[#171717]">
                                  ₹{Number(displayPrice).toLocaleString("en-IN")}
                                </span>
                                <span className="text-[11px] text-[#77777d]">/ {p.uom || "Pair"}</span>
                                {mrp != null && Number(mrp) > Number(displayPrice) && (
                                  <span className="font-mono text-[11px] text-slate-400 line-through">
                                    ₹{Number(mrp).toLocaleString("en-IN")}
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs font-semibold text-sky-700">Price on Enquiry</span>
                            )}
                          </div>

                          {/* Carton / Pack Info & Custom Fields */}
                          {showCartonInfo && pcsPerCarton > 0 && (
                            <div className="inline-flex items-center rounded-md bg-sky-50 px-2 py-0.5 text-[10.5px] font-semibold text-sky-800">
                              1 Carton / Box = {pcsPerCarton} {p.uom || "Pairs"}
                            </div>
                          )}

                          {showDescription && p.description && (
                            <p className="line-clamp-2 text-[11.5px] leading-relaxed text-[#55555b]">
                              {p.description}
                            </p>
                          )}

                          {extraEntries.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {extraEntries.slice(0, 3).map(([k, v]) => (
                                <span
                                  key={k}
                                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700"
                                >
                                  <span className="capitalize text-slate-500">{k.replace(/_/g, " ")}:</span>{" "}
                                  <strong>{String(v)}</strong>
                                </span>
                              ))}
                            </div>
                          )}

                          {showSizes && uniqueSizes.length > 0 && (
                            <div className="flex flex-wrap items-center gap-1 pt-0.5">
                              <span className="text-[10px] font-semibold uppercase text-slate-400">Sizes:</span>
                              {uniqueSizes.slice(0, 8).map((sz) => (
                                <span
                                  key={sz}
                                  className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-700"
                                >
                                  {sz}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Multi-Size/Colour Picker + Add to Inquiry */}
                      <div className="space-y-2 border-t border-slate-100 bg-slate-50/50 p-3">
                        {p.variants.length > 1 && selectedInCart.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {selectedInCart.slice(0, 4).map((c) => (
                              <span
                                key={c.variantId}
                                className="inline-flex items-center gap-1 rounded-md bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.08)]"
                              >
                                {c.attrs || c.sku}
                                <strong className="font-mono text-sky-700">×{c.qty}</strong>
                              </span>
                            ))}
                            {selectedInCart.length > 4 && (
                              <span className="text-[10px] font-medium text-slate-500">
                                +{selectedInCart.length - 4} more
                              </span>
                            )}
                          </div>
                        )}
                        <div className="flex gap-1.5">
                          {p.variants.length > 1 ? (
                            <Button
                              size="sm"
                              className="flex-1 active:scale-95"
                              onClick={() => openVariantPicker(p)}
                            >
                              <Layers className="h-3.5 w-3.5" />
                              {selectedInCart.length > 0
                                ? `Edit Sizes (${selectedInCart.length} · ${productTotalQty})`
                                : "Select Sizes & Colours"}
                            </Button>
                          ) : activeQty > 0 && activeVariant ? (
                            <EditableCartQty
                              qty={activeQty}
                              label={p.name}
                              onChange={(next) => setVariantQty(activeVariant.id, next)}
                            />
                          ) : (
                            <Button
                              size="sm"
                              className="flex-1 active:scale-95"
                              onClick={() => addToCart(p)}
                            >
                              <Plus className="h-3.5 w-3.5" /> Add to Inquiry
                            </Button>
                          )}
                          <Link
                            href={`/s/${slug}/product/${p.product_id}`}
                            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100"
                          >
                            View
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>

      {/* Inquiry Cart Dialog */}
      <Dialog
        open={cartOpen}
        onClose={() => {
          setCartOpen(false);
          setSubmitted(false);
          setSubmitError("");
        }}
        title="Inquiry Cart"
      >
        {submitted ? (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-slate-900">Enquiry Sent!</p>
              <p className="mt-1 text-xs text-slate-600">
                Your enquiry has been received by {tenantName}.
              </p>
            </div>
            {canWhatsapp && (
              <a
                href={`https://wa.me/${cleanWa}?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> Continue on WhatsApp
              </a>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() => {
                setCart([]);
                setMessage("");
                setSubmitted(false);
                setCartOpen(false);
              }}
            >
              Done
            </Button>
          </div>
        ) : cart.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">Your inquiry cart is empty.</p>
        ) : (
          <Form onSubmit={handleSubmitEnquiry} className="space-y-3">
            {cart.map((c, idx) => (
              <div
                key={c.variantId}
                className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{c.name}</p>
                  <p className="text-slate-500">
                    {c.sku}
                    {c.attrs ? ` · ${c.attrs}` : ""}
                    {c.price != null ? ` · ₹${c.price}` : ""}
                  </p>
                </div>
                <EditableCartQty
                  qty={c.qty}
                  label={c.name}
                  variant="light"
                  onChange={(next) => setVariantQty(c.variantId, next)}
                />
                <button
                  type="button"
                  onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-1 text-rose-500 cursor-pointer"
                  aria-label={`Remove ${c.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}

            {canInbox && (
              <>
                <input
                  type="text"
                  name="website"
                  value={honeypot}
                  onChange={(e) => setHoneypot(e.target.value)}
                  tabIndex={-1}
                  autoComplete="off"
                  className="hidden"
                />
                <div>
                  <Label>Your Name *</Label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Your name"
                    required
                  />
                </div>
                <div>
                  <Label>Phone or Email *</Label>
                  <Input
                    value={customerContact}
                    onChange={(e) => setCustomerContact(e.target.value)}
                    placeholder="+91 98765 43210"
                    required
                  />
                </div>
                <div>
                  <Label>Note (optional)</Label>
                  <Input
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Cartons, sizes, or delivery city"
                  />
                </div>
              </>
            )}

            {submitError && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {submitError}
              </p>
            )}

            {canInbox && canWhatsapp ? (
              <Button
                type="submit"
                disabled={submitting}
                className="w-full !bg-emerald-600 hover:!bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" />
                {submitting ? "Sending..." : "Send Enquiry & Open WhatsApp"}
              </Button>
            ) : canInbox ? (
              <Button type="submit" disabled={submitting} className="w-full">
                <Inbox className="h-4 w-4" />
                {submitting ? "Sending..." : "Send Enquiry"}
              </Button>
            ) : canWhatsapp ? (
              <a
                href={`https://wa.me/${cleanWa}?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> Send Inquiry on WhatsApp
              </a>
            ) : (
              <p className="text-xs text-amber-700">
                Store WhatsApp number and enquiry inbox are not configured yet.
              </p>
            )}
          </Form>
        )}
      </Dialog>

      {/* Multi-Size & Multi-Colour Picker Dialog */}
      <Dialog
        open={Boolean(pickerProduct)}
        onClose={() => setPickerProduct(null)}
        title={pickerProduct ? `Select Sizes & Colours — ${pickerProduct.name}` : "Select Sizes & Colours"}
        maxWidth="max-w-lg"
      >
        {pickerProduct && (() => {
          const totalSelectedPairs = pickerProduct.variants.reduce(
            (sum, v) => sum + Math.max(0, Number(pickerDraftQty[v.id] || 0)),
            0
          );
          const selectedVariantCount = pickerProduct.variants.filter(
            (v) => Number(pickerDraftQty[v.id] || 0) > 0
          ).length;

          return (
            <div className="space-y-3.5">
              {/* Product Summary Header */}
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white">
                  {pickerProduct.thumb_url ? (
                    <img src={pickerProduct.thumb_url} alt={pickerProduct.name} className="h-full w-full object-contain p-0.5" />
                  ) : (
                    <Package className="h-5 w-5 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-[#171717]">{pickerProduct.name}</p>
                  <p className="text-[11px] text-slate-500">
                    Code: <span className="font-mono font-semibold text-slate-700">{pickerProduct.model_code}</span> ·{" "}
                    {pickerProduct.variants.length} options available
                  </p>
                </div>
              </div>

              {/* Variant Checklist + Plus/Minus & Direct Qty Stepper */}
              <div className="max-h-[50vh] space-y-1.5 overflow-y-auto pr-1">
                {pickerProduct.variants.map((v) => {
                  const rawVal = pickerDraftQty[v.id] ?? "";
                  const numVal = Math.max(0, Number(rawVal || 0));
                  const isChecked = numVal > 0;
                  const label = Object.values(v.attributes).join(" / ") || v.sku;
                  return (
                    <div
                      key={v.id}
                      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
                        isChecked
                          ? "border-[#171717] bg-[#fafafa]"
                          : "border-slate-200 bg-white hover:border-slate-300"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setPickerDraftQty((prev) => ({
                            ...prev,
                            [v.id]: isChecked ? "" : "1",
                          }));
                        }}
                        className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 text-left"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            isChecked
                              ? "border-[#171717] bg-[#171717] text-white"
                              : "border-slate-300 bg-white"
                          }`}
                        >
                          {isChecked && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-[#171717]">{label}</p>
                          <p className="text-[10.5px] text-slate-500">
                            {v.display_price != null ? `₹${Number(v.display_price).toLocaleString("en-IN")}` : "Price on enquiry"}
                            {" · "}
                            {v.in_stock ? "Available" : "On Order"}
                          </p>
                        </div>
                      </button>

                      <div className="flex shrink-0 items-center rounded-lg border border-slate-300 bg-white p-0.5">
                        <button
                          type="button"
                          aria-label={`Decrease quantity for ${label}`}
                          disabled={numVal <= 0}
                          onClick={() => {
                            const next = Math.max(0, numVal - 1);
                            setPickerDraftQty((prev) => ({ ...prev, [v.id]: next > 0 ? String(next) : "" }));
                          }}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35"
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <input
                          type="text"
                          inputMode="numeric"
                          aria-label={`Quantity for ${label}`}
                          value={rawVal}
                          placeholder="0"
                          onFocus={(e) => e.currentTarget.select()}
                          onChange={(e) => {
                            const cleaned = e.target.value.replace(/\D/g, "").slice(0, 6);
                            setPickerDraftQty((prev) => ({ ...prev, [v.id]: cleaned }));
                          }}
                          className="h-7 w-14 bg-transparent text-center font-mono text-xs font-bold text-[#171717] focus:outline-none"
                        />
                        <button
                          type="button"
                          aria-label={`Increase quantity for ${label}`}
                          onClick={() => {
                            const next = Math.min(999999, numVal + 1);
                            setPickerDraftQty((prev) => ({ ...prev, [v.id]: String(next) }));
                          }}
                          className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-slate-700 hover:bg-slate-100"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Save Footer */}
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
                <div className="text-xs text-slate-600">
                  <strong className="font-mono text-[#171717]">{selectedVariantCount}</strong> options ·{" "}
                  <strong className="font-mono text-[#171717]">{totalSelectedPairs.toLocaleString("en-IN")}</strong>{" "}
                  {pickerProduct.uom || "Pairs"}
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setPickerProduct(null)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={saveVariantPicker}>
                    Save to Cart
                  </Button>
                </div>
              </div>
            </div>
          );
        })()}
      </Dialog>
    </div>
  );
}
