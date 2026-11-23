"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { Badge, Button, Dialog, Input } from "@/components/ui/primitives";

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

interface CartEntry {
  variantId: string;
  name: string;
  sku: string;
  attrs: string;
  price: number | null;
  qty: number;
}

export function StorefrontClient({
  slug,
  tenantName,
  whatsappNumber,
  heroTitle,
  heroSubtitle,
  products,
}: {
  slug: string;
  tenantName: string;
  whatsappNumber: string;
  heroTitle: string;
  heroSubtitle: string;
  products: StorefrontProductItem[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [attrFilter, setAttrFilter] = useState("ALL");
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartEntry[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

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
      return p.name.toLowerCase().includes(q) || p.model_code.toLowerCase().includes(q);
    });
  }, [products, search, categoryFilter, attrFilter]);

  const addToCart = (p: StorefrontProductItem) => {
    const chosenId = selectedVariants[p.product_id];
    const v = p.variants.find((x) => x.id === chosenId) ?? p.variants[0];
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
          variantId: v.id,
          name: p.name,
          sku: v.sku,
          attrs: Object.values(v.attributes).join(" / "),
          price: v.display_price,
          qty: 1,
        },
      ];
    });
  };

  const cleanWa = whatsappNumber.replace(/\D/g, "");
  const waText = encodeURIComponent(
    `Hello ${tenantName}, I would like to enquire about:\n` +
      cart
        .map(
          (c, i) =>
            `${i + 1}. ${c.name} (${c.sku}${c.attrs ? ` - ${c.attrs}` : ""}) x ${c.qty}${
              c.price != null ? ` @ ₹${c.price}` : ""
            }`
        )
        .join("\n")
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-[#0B1120] text-white sticky top-0 z-20 border-b border-slate-800">
        <div className="mx-auto max-w-6xl px-4 h-16 flex items-center justify-between">
          <div>
            <h1 className="font-display font-bold text-lg">{tenantName}</h1>
            <p className="text-[11px] text-sky-300">Official Catalogue &amp; New Arrivals</p>
          </div>
          <Button size="sm" variant="secondary" onClick={() => setCartOpen(true)}>
            <ShoppingBag className="h-4 w-4" />
            Inquiry Cart ({cart.reduce((s, c) => s + c.qty, 0)})
          </Button>
        </div>
      </header>

      <section className="bg-slate-900 text-white py-8 px-4 text-center">
        <h2 className="font-display text-2xl sm:text-3xl font-bold">{heroTitle || "New Arrivals Showcase"}</h2>
        {heroSubtitle && <p className="text-sm text-slate-300 mt-1 max-w-xl mx-auto">{heroSubtitle}</p>}
      </section>

      <main className="mx-auto max-w-6xl px-4 py-6 space-y-5">
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search models or codes..."
              className="pl-9 bg-white"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-semibold whitespace-nowrap cursor-pointer ${
                  categoryFilter === cat
                    ? "bg-slate-900 text-white"
                    : "bg-white border border-slate-200 text-slate-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {attrOptions.length > 2 && (
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar items-center">
            <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap mr-1">Filter Size / Variant:</span>
            {attrOptions.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setAttrFilter(opt)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                  attrFilter === opt
                    ? "bg-sky-600 text-white"
                    : "bg-white border border-slate-200 text-slate-600 hover:border-sky-300"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-12">No products found.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {filtered.map((p) => {
              const firstPrice = p.variants[0]?.display_price;
              const inStock = p.variants.some((v) => v.in_stock);
              return (
                <div
                  key={p.product_id}
                  className="rounded-2xl border border-slate-200 bg-white overflow-hidden flex flex-col justify-between shadow-2xs"
                >
                  <Link href={`/s/${slug}/product/${p.product_id}`} className="block">
                    <div className="aspect-square bg-slate-100 relative overflow-hidden">
                      {p.thumb_url ? (
                        <img src={p.thumb_url} alt={p.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
                          {p.model_code}
                        </div>
                      )}
                      {p.is_new_arrival && (
                        <span className="absolute top-2 left-2 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          NEW
                        </span>
                      )}
                    </div>
                    <div className="p-3">
                      <p className="text-xs font-bold text-slate-900 line-clamp-1">{p.name}</p>
                      <p className="text-[11px] text-slate-500">{p.model_code}</p>
                      <div className="mt-2 flex items-center justify-between">
                        {firstPrice != null ? (
                          <span className="font-display font-bold text-sm text-sky-700">
                            ₹{Number(firstPrice).toLocaleString("en-IN")}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-500">Enquire</span>
                        )}
                        <Badge variant={inStock ? "success" : "default"}>
                          {inStock ? "Available" : "Made to Order"}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                  <div className="px-3 pb-3 space-y-2">
                    {p.variants.length > 1 && (
                      <select
                        value={selectedVariants[p.product_id] ?? p.variants[0]?.id ?? ""}
                        onChange={(e) =>
                          setSelectedVariants((prev) => ({ ...prev, [p.product_id]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] font-medium text-slate-800"
                      >
                        {p.variants.map((v) => (
                          <option key={v.id} value={v.id}>
                            {Object.values(v.attributes).join(" / ") || v.sku}
                            {v.display_price != null ? ` — ₹${v.display_price}` : ""}
                          </option>
                        ))}
                      </select>
                    )}
                    <Button size="sm" variant="outline" className="w-full" onClick={() => addToCart(p)}>
                      <Plus className="h-3.5 w-3.5" /> Add to Inquiry
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={cartOpen} onClose={() => setCartOpen(false)} title="WhatsApp Inquiry Cart">
        {cart.length === 0 ? (
          <p className="text-xs text-slate-500 py-6 text-center">Your inquiry cart is empty.</p>
        ) : (
          <div className="space-y-3">
            {cart.map((c, idx) => (
              <div key={c.variantId} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs">
                <div>
                  <p className="font-bold">{c.name}</p>
                  <p className="text-slate-500">{c.sku} • Qty: {c.qty}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-rose-500 p-1"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            {cleanWa ? (
              <a
                href={`https://wa.me/${cleanWa}?text=${waText}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> Send Inquiry on WhatsApp
              </a>
            ) : (
              <p className="text-xs text-amber-700">Store WhatsApp number is not configured yet.</p>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
