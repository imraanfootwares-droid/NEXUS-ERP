"use client";

import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Inbox,
  MessageCircle,
  Minus,
  Plus,
  Search,
  Send,
  ShoppingBag,
  Trash2,
} from "lucide-react";
import { Form, Badge, Button, Dialog, Input, Label } from "@/components/ui/primitives";
import type { EnquiryChannel } from "@/types/database";

export interface PublicCatalogueItem {
  product_id: string;
  model_code: string;
  name: string;
  category: string | null;
  brand: string | null;
  description: string | null;
  is_new_arrival: boolean;
  thumb_url: string | null;
  display_price: number | null;
}

interface InquirySelection {
  product_id: string;
  name: string;
  model_code: string;
  price: number | null;
  qty: number;
}

function CatalogueQtyStepper({
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
          ? "flex-1 bg-[#171717] text-white"
          : "w-24 border border-slate-200 bg-white text-[#171717]"
      }`}
    >
      <button
        type="button"
        aria-label={qty <= 1 ? `Remove ${label}` : `Decrease ${label}`}
        onClick={() => onChange(qty - 1)}
        className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded ${
          variant === "dark" ? "text-white/90 hover:bg-white/15" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        {qty <= 1 ? (
          <Trash2 className={`h-3 w-3 ${variant === "dark" ? "text-rose-300" : "text-rose-500"}`} />
        ) : (
          <Minus className="h-3 w-3" />
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
        className={`h-6 min-w-0 flex-1 bg-transparent text-center font-mono text-[11px] font-bold focus:outline-none ${
          variant === "dark" ? "text-white" : "text-[#171717]"
        }`}
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(qty + 1)}
        className={`flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded ${
          variant === "dark" ? "text-white/90 hover:bg-white/15" : "text-slate-600 hover:bg-slate-100"
        }`}
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
}

export function PublicCatalogueClient({
  slug,
  tenantName,
  title,
  pdfUrl,
  whatsappNumber,
  enquiryChannel,
  enquiriesEnabled,
  items,
}: {
  slug: string;
  tenantName: string;
  title: string;
  pdfUrl: string;
  whatsappNumber: string;
  enquiryChannel: EnquiryChannel;
  enquiriesEnabled: boolean;
  items: PublicCatalogueItem[];
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [cart, setCart] = useState<InquirySelection[]>([]);
  const [modalOpen, setModalOpen] = useState(false);

  const [customerName, setCustomerName] = useState("");
  const [customerContact, setCustomerContact] = useState("");
  const [message, setMessage] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const cleanWa = whatsappNumber.replace(/\D/g, "");
  const effectiveChannel: EnquiryChannel =
    enquiryChannel === "whatsapp" && !cleanWa && enquiriesEnabled
      ? "inbox"
      : enquiryChannel === "inbox" && !enquiriesEnabled && cleanWa
      ? "whatsapp"
      : enquiryChannel;

  const canInbox = enquiriesEnabled && (effectiveChannel === "inbox" || effectiveChannel === "both");
  const canWhatsapp = Boolean(cleanWa) && (effectiveChannel === "whatsapp" || effectiveChannel === "both");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.category) set.add(item.category);
    return ["ALL", ...Array.from(set)];
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (categoryFilter !== "ALL" && item.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.model_code.toLowerCase().includes(q) ||
        (item.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, search, categoryFilter]);

  const setItemQty = (productId: string, nextQty: number) => {
    setCart((prev) => {
      if (nextQty <= 0) return prev.filter((c) => c.product_id !== productId);
      return prev.map((c) => (c.product_id === productId ? { ...c, qty: nextQty } : c));
    });
  };

  const addItem = (item: PublicCatalogueItem) => {
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.product_id === item.product_id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], qty: next[idx].qty + 1 };
        return next;
      }
      return [
        ...prev,
        {
          product_id: item.product_id,
          name: item.name,
          model_code: item.model_code,
          price: item.display_price,
          qty: 1,
        },
      ];
    });
  };

  const enquireNow = (item: PublicCatalogueItem) => {
    setCart((prev) => {
      if (prev.some((c) => c.product_id === item.product_id)) return prev;
      return [
        ...prev,
        {
          product_id: item.product_id,
          name: item.name,
          model_code: item.model_code,
          price: item.display_price,
          qty: 1,
        },
      ];
    });
    setSubmitted(false);
    setSubmitError("");
    setModalOpen(true);
  };

  const buildWhatsappUrl = () => {
    const lines = [
      `Hello ${tenantName}, I would like to enquire about your catalogue:`,
      ...cart.map(
        (c, i) =>
          `${i + 1}. ${c.name} (${c.model_code}) x ${c.qty}${c.price != null ? ` @ ₹${c.price}` : ""}`
      ),
    ];
    if (customerName.trim()) lines.push(`Name: ${customerName.trim()}`);
    if (customerContact.trim()) lines.push(`Contact: ${customerContact.trim()}`);
    if (message.trim()) lines.push(`Note: ${message.trim()}`);
    return `https://wa.me/${cleanWa}?text=${encodeURIComponent(lines.join("\n"))}`;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (!canInbox) {
      if (canWhatsapp) {
        window.open(buildWhatsappUrl(), "_blank", "noopener,noreferrer");
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
            model_code: c.model_code,
            qty: c.qty,
            price: c.price,
          })),
          source: "catalogue",
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
        window.open(buildWhatsappUrl(), "_blank", "noopener,noreferrer");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const totalCount = cart.reduce((s, c) => s + c.qty, 0);

  return (
    <div
      className="min-h-screen px-2.5 py-4 sm:px-6 sm:py-8"
      style={{
        background:
          "radial-gradient(ellipse 90% 60% at 50% 0%, #dbeafe 0%, #eff6ff 40%, #f8fafc 75%, #ffffff 100%)",
      }}
    >
      <div className="mx-auto max-w-6xl rounded-[28px] border border-white/90 bg-white/65 p-2.5 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-4">
        <div className="overflow-hidden rounded-[22px] border border-slate-200/80 bg-white">
          <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-white/90 px-4 py-3.5 backdrop-blur-md sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold tracking-tight text-[#171717]">
                  {tenantName}
                </h1>
                <p className="truncate text-[11.5px] text-[#77777d]">{title}</p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={pdfUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-[#171717] hover:bg-slate-50"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Download PDF</span>
                  <span className="sm:hidden">PDF</span>
                </a>
                {(canInbox || canWhatsapp) && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setSubmitted(false);
                      setSubmitError("");
                      setModalOpen(true);
                    }}
                  >
                    <ShoppingBag className="h-4 w-4" />
                    <span>Enquire</span>
                    {totalCount > 0 && (
                      <span
                        key={totalCount}
                        style={{ animation: "pos-pop 260ms var(--ui-ease)" }}
                        className="ml-0.5 inline-flex min-w-[18px] items-center justify-center rounded-full bg-white/20 px-1.5 py-0.5 font-mono text-[10.5px]"
                      >
                        {totalCount}
                      </span>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </header>

          <main className="space-y-5 p-4 sm:p-6">
        <div className="flex flex-col items-stretch justify-between gap-3 sm:flex-row sm:items-center">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search catalogue models or codes..."
              className="bg-white pl-9"
            />
          </div>
          <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`cursor-pointer whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-semibold ${
                  categoryFilter === cat
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-700"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">No items found in this catalogue.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {filtered.map((item) => {
              const itemQty = cart.find((c) => c.product_id === item.product_id)?.qty ?? 0;
              return (
              <div
                key={item.product_id}
                className={`flex flex-col justify-between overflow-hidden rounded-2xl border bg-white transition-all duration-200 ${
                  itemQty > 0
                    ? "border-[#171717] ring-1 ring-[#171717]/10 shadow-[0_6px_20px_rgba(15,23,42,0.08)]"
                    : "border-slate-200 shadow-2xs"
                }`}
              >
                <div>
                  <div className="relative aspect-square overflow-hidden bg-slate-100">
                    {item.thumb_url ? (
                      <img src={item.thumb_url} alt={item.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-xs text-slate-400">
                        {item.model_code}
                      </div>
                    )}
                    {item.is_new_arrival && (
                      <span className="absolute left-2 top-2 rounded-full bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white">
                        NEW
                      </span>
                    )}
                    {itemQty > 0 && (
                      <span
                        key={itemQty}
                        style={{ animation: "pos-pop 260ms var(--ui-ease)" }}
                        className="absolute right-2 top-2 inline-flex h-6 min-w-[24px] items-center justify-center rounded-full bg-[#171717] px-1.5 font-mono text-[11px] font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.22),0_0_0_2px_#fff]"
                      >
                        {itemQty}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="line-clamp-1 text-xs font-bold text-slate-900">{item.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.model_code}
                      {item.category ? ` • ${item.category}` : ""}
                    </p>
                    <div className="mt-2 flex items-center justify-between">
                      {item.display_price != null ? (
                        <span className="font-display text-sm font-bold text-sky-700">
                          ₹{Number(item.display_price).toLocaleString("en-IN")}
                        </span>
                      ) : (
                        <Badge variant="default">Price on Enquiry</Badge>
                      )}
                    </div>
                  </div>
                </div>

                {(canInbox || canWhatsapp) && (
                  <div className="flex gap-1.5 px-3 pb-3">
                    {itemQty > 0 ? (
                      <CatalogueQtyStepper
                        qty={itemQty}
                        label={item.name}
                        onChange={(next) => setItemQty(item.product_id, next)}
                      />
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 !px-2 !text-[11px] active:scale-95"
                        onClick={() => addItem(item)}
                      >
                        <Plus className="h-3.5 w-3.5" /> Add
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="flex-1 !px-2 !text-[11px]"
                      onClick={() => enquireNow(item)}
                    >
                      <Send className="h-3 w-3" /> Enquire
                    </Button>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
          </main>
        </div>
      </div>

      <Dialog
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`Send Enquiry to ${tenantName}`}
      >
        {submitted ? (
          <div className="space-y-4 py-4 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
            <div>
              <p className="text-sm font-bold text-slate-900">Enquiry Sent!</p>
              <p className="mt-1 text-xs text-slate-600">
                Your enquiry has been delivered to {tenantName}&apos;s team. They will contact you shortly.
              </p>
            </div>
            {canWhatsapp && (
              <a
                href={buildWhatsappUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> Continue on WhatsApp
              </a>
            )}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setCart([]);
                setMessage("");
                setModalOpen(false);
              }}
            >
              Done
            </Button>
          </div>
        ) : (
          <Form onSubmit={handleSubmit} className="space-y-3">
            {cart.length > 0 && (
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Selected Items ({totalCount})
                </p>
                {cart.map((c, idx) => (
                  <div
                    key={c.product_id}
                    className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-1.5 text-xs last:border-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-slate-900">{c.name}</p>
                      <p className="text-[11px] text-slate-500">
                        {c.model_code}
                        {c.price != null ? ` • ₹${Number(c.price).toLocaleString("en-IN")}` : ""}
                      </p>
                    </div>
                    <CatalogueQtyStepper
                      qty={c.qty}
                      label={c.name}
                      variant="light"
                      onChange={(next) => setItemQty(c.product_id, next)}
                    />
                    <button
                      type="button"
                      onClick={() => setCart((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                      aria-label={`Remove ${c.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

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
                    placeholder="e.g. Rajesh Kumar"
                    required
                  />
                </div>
                <div>
                  <Label>Phone Number or Email *</Label>
                  <Input
                    value={customerContact}
                    onChange={(e) => setCustomerContact(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    required
                  />
                </div>
              </>
            )}

            <div>
              <Label>Message / Requirement</Label>
              <Input
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Sizes, quantities, or delivery location..."
              />
            </div>

            {submitError && (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {submitError}
              </p>
            )}

            {canInbox && canWhatsapp ? (
              <Button type="submit" disabled={submitting} className="w-full !bg-emerald-600 hover:!bg-emerald-700">
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
                href={buildWhatsappUrl()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> Send Enquiry on WhatsApp
              </a>
            ) : (
              <p className="text-xs text-amber-700">Enquiries are not configured for this catalogue yet.</p>
            )}
          </Form>
        )}
      </Dialog>
    </div>
  );
}
