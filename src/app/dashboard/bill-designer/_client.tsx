"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, Check, Package, Printer, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBillTemplateAction, saveBillTemplateAction, savePosScreenLayoutAction } from "@/actions/billing";
import { InvoiceRenderer, type InvoicePreviewData } from "@/components/billing/invoice-renderer";
import {
  GST_TEMPLATE_PRESETS,
  NORMAL_TEMPLATE_PRESETS,
  buildDefaultConfigForCategory,
  inferTemplateCategory,
  resolveSellerProfile,
  selectTemplateForBill,
  type BillTemplatePreset,
} from "@/lib/billing/seller-profile";
import { Alert, Button, Card, CardContent, CardHeader, Input, Label, Select, Switch, Tabs } from "@/components/ui/primitives";
import type { BillCategory, BillDesignStyle, BillFormat, BillTemplateConfig, BillTemplateRow, BranchRow, TenantRow } from "@/types/database";

const SAMPLE_POS_PRODUCTS = [
  { name: "Ladies Ortho Art No : 101", attrs: "Size 6-9 · Black", sku: "ART-101", hsn: "64039110", gst: 5, price: 100, stock: 120, qty: 2 },
  { name: "Gents Ortho Art No : 201", attrs: "Size 7-10 · Brown", sku: "ART-201", hsn: "64039110", gst: 5, price: 150, stock: 40, qty: 1 },
  { name: "Ladies Ortho Art No : 105", attrs: "Size 5-8 · Tan", sku: "ART-105", hsn: "64039110", gst: 5, price: 110, stock: 95, qty: 0 },
  { name: "Gents Art No : 211", attrs: "Size 6-10 · Black", sku: "ART-211", hsn: "64039110", gst: 5, price: 102, stock: 72, qty: 0 },
];

export function BillDesignerClient({
  tenant,
  defaultBranch,
  logoUrl,
  templates,
}: {
  tenant: TenantRow;
  defaultBranch: BranchRow | null;
  logoUrl: string | null;
  templates: BillTemplateRow[];
}) {
  const router = useRouter();
  const seller = resolveSellerProfile(tenant, defaultBranch);
  const hasProfileDetails = Boolean(seller.address || seller.phone || seller.gstin || seller.hasBankDetails);

  const [tab, setTab] = useState<"gst" | "normal" | "screen">("gst");

  const getInitialForCategory = (cat: BillCategory): {
    selectedId: string;
    name: string;
    format: BillFormat;
    config: BillTemplateConfig;
  } => {
    const saved = selectTemplateForBill(templates, cat === "gst");
    const matchesCat = saved && inferTemplateCategory(saved) === cat ? saved : null;
    const baseCfg = buildDefaultConfigForCategory(cat, seller, tenant.brand_config?.primary_color);
    return {
      selectedId: matchesCat?.id ?? "new",
      name: matchesCat?.name ?? (cat === "gst" ? "Classic Tax Grid" : "Clean Shop Bill"),
      format: matchesCat?.format ?? ("a4" as BillFormat),
      config: { ...baseCfg, ...(matchesCat?.config ?? {}), bill_category: cat },
    };
  };

  const initGst = getInitialForCategory("gst");
  const initNormal = getInitialForCategory("normal");

  const [gstState, setGstState] = useState(initGst);
  const [normalState, setNormalState] = useState(initNormal);
  const [saving, setSaving] = useState(false);

  // New Bill Screen settings
  const [posLayout, setPosLayout] = useState<"grid" | "list">(tenant.brand_config?.pos_ui?.layout ?? "grid");
  const [showThumbs, setShowThumbs] = useState(tenant.brand_config?.pos_ui?.show_thumbs ?? true);
  const [showHsnCol, setShowHsnCol] = useState(tenant.brand_config?.pos_ui?.show_hsn_col ?? true);

  const activeCategory: BillCategory = tab === "normal" ? "normal" : "gst";
  const current = activeCategory === "gst" ? gstState : normalState;
  const setCurrent = activeCategory === "gst" ? setGstState : setNormalState;
  const presets = activeCategory === "gst" ? GST_TEMPLATE_PRESETS : NORMAL_TEMPLATE_PRESETS;
  const savedForCat = templates.filter((t) => inferTemplateCategory(t) === activeCategory);

  const selectSavedTemplate = (id: string) => {
    if (id === "new") {
      setCurrent({
        selectedId: "new",
        name: activeCategory === "gst" ? "My GST Bill" : "My Normal Bill",
        format: "a4",
        config: buildDefaultConfigForCategory(activeCategory, seller, tenant.brand_config?.primary_color),
      });
      return;
    }
    const found = templates.find((t) => t.id === id);
    if (found) {
      const baseCfg = buildDefaultConfigForCategory(activeCategory, seller, tenant.brand_config?.primary_color);
      setCurrent({
        selectedId: found.id,
        name: found.name,
        format: found.format,
        config: { ...baseCfg, ...found.config, bill_category: activeCategory },
      });
    }
  };

  const applyPreset = (p: BillTemplatePreset) => {
    setCurrent((prev) => ({
      ...prev,
      name: prev.selectedId === "new" ? p.name : prev.name,
      config: {
        ...prev.config,
        bill_category: p.billCategory,
        design_style: p.design_style,
        accent_color: p.accent_color,
        show_hsn: p.show_hsn,
        show_gst_summary: p.show_gst_summary,
        show_bank_details: p.show_bank_details,
        show_ship_to: p.show_ship_to,
        show_upi_qr: p.show_upi_qr,
        header_subtitle: p.header_subtitle,
        copy_label: p.copy_label,
      },
    }));
  };

  const previewBank = seller.hasBankDetails
    ? seller.bankDetails
    : {
        account_holder: seller.businessName.toUpperCase(),
        bank_name: "J&K BANK",
        account_number: "2222010100000960",
        ifsc_code: "JAKA0PARRYS",
        upi_id: "shop@upi",
      };

  const gstPreviewData: InvoicePreviewData = {
    logoUrl,
    invoiceNumber: "220",
    invoiceType: "sale",
    dateStr: "27-06-2026",
    sellerName: seller.businessName,
    sellerAddress: seller.address || "No. 19, Kattur Sadayappan Street, Periamet, Chennai - 600003, Tamil Nadu, India",
    sellerPhone: seller.phone || "+91 7010345550",
    sellerEmail: seller.email || "yourshop@gmail.com",
    sellerGstin: seller.gstin || "33AGHPI7481E1ZG",
    signatoryName: seller.signatoryName,
    bankDetails: previewBank,
    branchName: defaultBranch?.name ?? seller.businessName,
    branchAddress: seller.address,
    branchGstin: seller.gstin,
    customerName: "POTHYS RETAIL PVT LIMITED",
    customerAddress: "JLS Godown, JLS Angu Godown No : 2, GNT Road, Sivanthi Adhithanam Street, Puzhal, Chennai - 600 066",
    customerGstin: "33AALCP2218B1ZX",
    shipToName: "POTHYS RETAIL PVT LIMITED",
    shipToAddress: "No : 81, RLDA, Madras Thiruvallur High Road, Padi, Chennai - 600 050",
    placeOfSupply: "Tamil Nadu (33)",
    subtotal: 158804,
    discountAmount: 0,
    taxableAmount: 158804,
    cgstAmount: 3970.1,
    sgstAmount: 3970.1,
    igstAmount: 0,
    roundOff: 0,
    grandTotal: 166744.2,
    paidAmount: 166744.2,
    dueAmount: 0,
    items: [
      { product_name: "LADIES ORTHO ART NO : 101", hsn_code: "64039110", qty: 120, unit_price: 100, gst_rate: 5, line_total: 12600 },
      { product_name: "LADIES ORTHO ART NO : 105", hsn_code: "64039110", qty: 120, unit_price: 110, gst_rate: 5, line_total: 13860 },
      { product_name: "GENTS ORTHO ART NO : 201", hsn_code: "64039110", qty: 40, unit_price: 150, gst_rate: 5, line_total: 6300 },
      { product_name: "GENTS ART NO : 211", hsn_code: "64039110", qty: 72, unit_price: 102, gst_rate: 5, line_total: 7711.2 },
    ],
  };

  const normalPreviewData: InvoicePreviewData = {
    logoUrl,
    invoiceNumber: "1045",
    invoiceType: "estimate_bill_of_supply",
    dateStr: "27-06-2026",
    sellerName: seller.businessName,
    sellerAddress: seller.address || "No. 19, Kattur Sadayappan Street, Periamet, Chennai - 600003",
    sellerPhone: seller.phone || "+91 7010345550",
    sellerEmail: seller.email || "yourshop@gmail.com",
    signatoryName: seller.signatoryName,
    bankDetails: previewBank,
    branchName: defaultBranch?.name ?? seller.businessName,
    customerName: "Karthik R.",
    customerPhone: "9840099887",
    customerAddress: "T. Nagar, Chennai - 600017",
    subtotal: 3400,
    discountAmount: 100,
    taxableAmount: 3300,
    cgstAmount: 0,
    sgstAmount: 0,
    igstAmount: 0,
    roundOff: 0,
    grandTotal: 3300,
    paidAmount: 3300,
    dueAmount: 0,
    items: [
      { product_name: "Ladies Comfort Sandal (Size 7)", qty: 2, unit_price: 650, gst_rate: 0, line_total: 1300 },
      { product_name: "Gents Formal Leather Shoe (Size 9)", qty: 1, unit_price: 2100, gst_rate: 0, line_total: 2100 },
    ],
  };

  return (
    <div className="space-y-4">
      {!hasProfileDetails && (
        <Alert variant="info" title="Set up your Shop & Bank Details first">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              The preview below uses sample details. Add your real Shop Address, Phone, Email, GST Number &amp; Bank Details once in My Profile.
            </span>
            <Link
              href="/dashboard/settings?tab=profile"
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#171717] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#2a2a2a]"
            >
              <Building2 className="h-3.5 w-3.5" /> Open My Profile &amp; Bank
            </Link>
          </div>
        </Alert>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Tabs
          active={tab}
          onChange={(v) => setTab(v as "gst" | "normal" | "screen")}
          tabs={[
            { id: "gst", label: "GST Bills (5 Designs)" },
            { id: "normal", label: "Normal Bills (5 Designs)" },
            { id: "screen", label: "New Bill Screen" },
          ]}
        />
        <Link
          href="/dashboard/settings?tab=profile"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Building2 className="h-3.5 w-3.5" /> Edit Shop &amp; Bank Details
        </Link>
      </div>

      {tab !== "screen" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 space-y-4">
            {/* 5 Creative Layouts Picker */}
            <div className="ui-tray">
              <div className="ui-surface p-3.5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#55555b]" />
                    <h3 className="text-[13px] font-semibold text-[#171717]">
                      {activeCategory === "gst" ? "5 GST Bill Layouts" : "5 Normal Bill Layouts"}
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#77777d]">Tap any style to preview</span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {presets.map((p, index) => {
                    const isSelected = current.config.design_style === p.design_style;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyPreset(p)}
                        className={`cursor-pointer rounded-xl border p-2.5 text-left transition-all ${
                          isSelected
                            ? "border-[#171717] bg-[#fafafa] ring-1 ring-[#171717]/15"
                            : "border-[#ececee] bg-white hover:border-slate-300 hover:bg-[#fafafa]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-2 text-xs font-semibold text-[#171717]">
                            <span
                              className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[10px] font-bold text-white"
                              style={{ backgroundColor: p.accent_color }}
                            >
                              {index + 1}
                            </span>
                            {p.name}
                          </span>
                          {isSelected && <Check className="h-4 w-4 text-[#171717]" />}
                        </div>
                        <p className="mt-1 pl-7 text-[11px] leading-snug text-[#77777d]">{p.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Simple Customization Controls */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  Customize {activeCategory === "gst" ? "GST Bill" : "Normal Bill"}
                </h3>
                <div className="flex items-center gap-1.5">
                  {current.selectedId !== "new" &&
                    !templates.find((t) => t.id === current.selectedId)?.is_default && (
                      <Button
                        size="sm"
                        variant="danger"
                        title="Delete Design"
                        onClick={async () => {
                          if (!confirm(`Delete "${current.name}"?`)) return;
                          await deleteBillTemplateAction(current.selectedId);
                          toast.success("Design deleted.");
                          selectSavedTemplate("new");
                          router.refresh();
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  <Button size="sm" variant="outline" onClick={() => selectSavedTemplate("new")}>
                    + New
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {savedForCat.length > 0 && (
                  <div>
                    <Label>Saved Designs</Label>
                    <Select value={current.selectedId} onChange={(e) => selectSavedTemplate(e.target.value)}>
                      {savedForCat.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.format.toUpperCase()}){t.is_default ? " ★ Active Default" : ""}
                        </option>
                      ))}
                      <option value="new">+ Save as a New Design...</option>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <Label>Design Name</Label>
                    <Input
                      value={current.name}
                      onChange={(e) => setCurrent((p) => ({ ...p, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label>Paper Size</Label>
                    <Select
                      value={current.format}
                      onChange={(e) => setCurrent((p) => ({ ...p, format: e.target.value as BillFormat }))}
                    >
                      <option value="a4">Full Page (A4)</option>
                      <option value="a5">Half Page (A5)</option>
                      <option value="thermal_80mm">Small Roll (80mm)</option>
                      <option value="thermal_58mm">Mini Roll (58mm)</option>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <Label>Main Color</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        className="!w-12 h-9 p-1 cursor-pointer"
                        value={current.config.accent_color}
                        onChange={(e) =>
                          setCurrent((p) => ({ ...p, config: { ...p.config, accent_color: e.target.value } }))
                        }
                      />
                      <span className="font-mono text-xs text-[#55555b]">
                        {current.config.accent_color.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  <div>
                    <Label>Copy Label (Top Right)</Label>
                    <Input
                      value={current.config.copy_label ?? "ORIGINAL"}
                      onChange={(e) =>
                        setCurrent((p) => ({ ...p, config: { ...p.config, copy_label: e.target.value } }))
                      }
                      placeholder="e.g. ORIGINAL"
                    />
                  </div>
                </div>

                <div>
                  <Label>Shop Title on Bill</Label>
                  <Input
                    value={current.config.header_title}
                    onChange={(e) =>
                      setCurrent((p) => ({ ...p, config: { ...p.config, header_title: e.target.value } }))
                    }
                  />
                </div>
                <div>
                  <Label>Small Line Under Title (Optional)</Label>
                  <Input
                    value={current.config.header_subtitle}
                    onChange={(e) =>
                      setCurrent((p) => ({ ...p, config: { ...p.config, header_subtitle: e.target.value } }))
                    }
                    placeholder="e.g. Wholesale & Retail Footwear"
                  />
                </div>
                <div>
                  <Label>Thank You Message at Bottom</Label>
                  <Input
                    value={current.config.footer_note}
                    onChange={(e) =>
                      setCurrent((p) => ({ ...p, config: { ...p.config, footer_note: e.target.value } }))
                    }
                    placeholder="e.g. THANKS FOR YOUR BUSINESS"
                  />
                </div>
                <div>
                  <Label>Return / Exchange Note (Optional)</Label>
                  <Input
                    value={current.config.terms}
                    onChange={(e) =>
                      setCurrent((p) => ({ ...p, config: { ...p.config, terms: e.target.value } }))
                    }
                    placeholder="e.g. Goods once sold will not be taken back."
                  />
                </div>

                <div className="flex flex-col gap-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                  <Switch
                    checked={current.config.show_logo}
                    onCheckedChange={(v) =>
                      setCurrent((p) => ({ ...p, config: { ...p.config, show_logo: v } }))
                    }
                    label="Show Shop Logo"
                  />
                  <Switch
                    checked={current.config.show_bank_details ?? true}
                    onCheckedChange={(v) =>
                      setCurrent((p) => ({ ...p, config: { ...p.config, show_bank_details: v } }))
                    }
                    label="Show Bank Details (from My Profile)"
                  />
                  {activeCategory === "gst" && (
                    <>
                      <Switch
                        checked={current.config.show_hsn}
                        onCheckedChange={(v) =>
                          setCurrent((p) => ({ ...p, config: { ...p.config, show_hsn: v } }))
                        }
                        label="Show HSN Code Column"
                      />
                      <Switch
                        checked={current.config.show_ship_to ?? true}
                        onCheckedChange={(v) =>
                          setCurrent((p) => ({ ...p, config: { ...p.config, show_ship_to: v } }))
                        }
                        label="Show Delivery Address (Ship To) Box"
                      />
                    </>
                  )}
                  <Switch
                    checked={current.config.show_upi_qr}
                    onCheckedChange={(v) =>
                      setCurrent((p) => ({ ...p, config: { ...p.config, show_upi_qr: v } }))
                    }
                    label="Show UPI ID on Bill"
                  />
                </div>

                <Button
                  className="w-full"
                  disabled={saving}
                  onClick={async () => {
                    setSaving(true);
                    try {
                      const configToSave: BillTemplateConfig = {
                        ...current.config,
                        bill_category: activeCategory,
                        show_gst_summary: activeCategory === "gst",
                      };
                      await saveBillTemplateAction({
                        id: current.selectedId === "new" ? undefined : current.selectedId,
                        name: current.name.trim() || (activeCategory === "gst" ? "GST Bill" : "Normal Bill"),
                        format: current.format,
                        isDefault: true,
                        config: configToSave,
                      });
                      toast.success(
                        activeCategory === "gst"
                          ? "Saved as your default GST Bill design!"
                          : "Saved as your default Normal Bill design!"
                      );
                      router.refresh();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Could not save design.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                >
                  {saving
                    ? "Saving..."
                    : activeCategory === "gst"
                    ? "Save as Default GST Bill"
                    : "Save as Default Normal Bill"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-7">
            <div className="sticky top-4 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-[#77777d]">
                  Live {activeCategory === "gst" ? "GST Bill" : "Normal Bill"} Preview ({current.format.replace("_", " ").toUpperCase()})
                </span>
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Updates Live
                </span>
              </div>
              <InvoiceRenderer
                format={current.format}
                config={{
                  ...current.config,
                  bill_category: activeCategory,
                  show_gst_summary: activeCategory === "gst",
                }}
                data={activeCategory === "gst" ? gstPreviewData : normalPreviewData}
              />
            </div>
          </div>
        </div>
      ) : (
        /* New Bill Screen Layout */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-5 h-fit">
            <CardHeader>
              <h3 className="text-sm font-semibold">New Bill Screen Look</h3>
              <p className="mt-0.5 text-xs text-[#77777d]">
                Choose how products look while you are making a new bill.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>How to Show Products</Label>
                <Select
                  value={posLayout}
                  onChange={(e) => setPosLayout(e.target.value as "grid" | "list")}
                >
                  <option value="grid">Card Grid (Best for Phones &amp; Tablets)</option>
                  <option value="list">Simple List (Best for Fast Counter Billing)</option>
                </Select>
              </div>
              <div className="space-y-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                <Switch
                  checked={showThumbs}
                  onCheckedChange={setShowThumbs}
                  label="Show Product Photos"
                />
                <Switch
                  checked={showHsnCol}
                  onCheckedChange={setShowHsnCol}
                  label="Show HSN & GST % in Bill"
                />
              </div>
              <Button
                className="w-full"
                onClick={async () => {
                  await savePosScreenLayoutAction({
                    layout: posLayout,
                    show_thumbs: showThumbs,
                    show_hsn_col: showHsnCol,
                    quick_pay_modes: ["cash", "upi", "card"],
                  });
                  toast.success("New Bill screen look saved!");
                  router.refresh();
                }}
              >
                Save Screen Look
              </Button>
            </CardContent>
          </Card>

          <div className="lg:col-span-7 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-[#77777d]">
                Live Preview ({posLayout === "grid" ? "Card Grid" : "Simple List"})
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
              </span>
            </div>

            <div className="ui-tray">
              <div className="ui-surface p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                  <div className="xl:col-span-7 space-y-2.5">
                    <div className="flex items-center gap-2 rounded-lg border border-[#ececee] bg-[#fafafa] px-2.5 py-1.5 text-[11px] text-[#a3a3a8]">
                      <Search className="h-3.5 w-3.5" />
                      <span>Search product name, item code, or scan barcode...</span>
                    </div>

                    {posLayout === "grid" ? (
                      <div className="grid grid-cols-2 gap-2">
                        {SAMPLE_POS_PRODUCTS.map((item) => (
                          <div
                            key={item.sku}
                            className={`rounded-xl border p-2.5 text-xs transition-all ${
                              item.qty > 0
                                ? "border-[#171717] bg-white shadow-2xs"
                                : "border-[#ececee] bg-white"
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {showThumbs && (
                                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#ececee] bg-[#fafafa]">
                                  <Package className="h-4 w-4 text-[#a3a3a8]" />
                                  {item.qty > 0 && (
                                    <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#171717] px-1 font-mono text-[9px] font-bold text-white">
                                      {item.qty}
                                    </span>
                                  )}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-semibold text-[#171717] text-[11.5px]">
                                  {item.name}
                                </p>
                                <p className="truncate text-[10px] text-[#77777d]">{item.attrs}</p>
                                <div className="mt-1 flex items-center justify-between">
                                  <span className="font-mono text-[11px] font-bold text-[#171717]">
                                    ₹{item.price.toLocaleString("en-IN")}
                                  </span>
                                  <span className="text-[9.5px] text-emerald-700">{item.stock} left</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="overflow-hidden rounded-xl border border-[#ececee] bg-white">
                        <table className="w-full text-left text-[11px]">
                          <thead className="border-b border-[#ececee] bg-[#fafafa] font-mono text-[9.5px] uppercase text-[#77777d]">
                            <tr>
                              <th className="px-2.5 py-1.5">Product</th>
                              <th className="px-2 py-1.5 text-right">Stock</th>
                              <th className="px-2.5 py-1.5 text-right">Price</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f1f1f2]">
                            {SAMPLE_POS_PRODUCTS.map((item) => (
                              <tr key={item.sku} className={item.qty > 0 ? "bg-[#fafafa]" : ""}>
                                <td className="px-2.5 py-2">
                                  <div className="flex items-center gap-2">
                                    {showThumbs && (
                                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[#ececee] bg-[#fafafa]">
                                        <Package className="h-3.5 w-3.5 text-[#a3a3a8]" />
                                      </span>
                                    )}
                                    <div className="min-w-0">
                                      <p className="truncate font-semibold text-[#171717]">{item.name}</p>
                                      <p className="text-[9.5px] text-[#77777d]">{item.attrs}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-right font-mono text-[10px] text-emerald-700">
                                  {item.stock}
                                </td>
                                <td className="px-2.5 py-2 text-right font-mono font-semibold text-[#171717]">
                                  ₹{item.price.toLocaleString("en-IN")}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  <div className="xl:col-span-5 flex flex-col justify-between rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between border-b border-[#ececee] pb-1.5">
                        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-[#77777d]">
                          Current Bill
                        </span>
                        <span className="rounded-full bg-[#171717] px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white">
                          3
                        </span>
                      </div>

                      {SAMPLE_POS_PRODUCTS.filter((p) => p.qty > 0).map((item) => (
                        <div
                          key={item.sku}
                          className="rounded-lg border border-[#ececee] bg-white p-2 text-[11px]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="font-semibold text-[#171717] leading-tight">
                              {item.name}
                            </span>
                            <span className="font-mono font-bold text-[#171717] whitespace-nowrap">
                              ₹{(item.price * item.qty).toLocaleString("en-IN")}
                            </span>
                          </div>
                          <div className="mt-0.5 text-[10px] text-[#77777d]">
                            ₹{item.price} × {item.qty}
                            {showHsnCol && (
                              <span className="ml-1.5 font-mono text-[#55555b]">
                                · HSN {item.hsn} · GST {item.gst}%
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 space-y-2 border-t border-[#ececee] pt-2.5">
                      <div className="flex items-center justify-between rounded-lg bg-[#171717] px-3 py-2 text-white">
                        <div>
                          <p className="text-[9.5px] text-white/70">3 items</p>
                          <p className="text-[11px] font-semibold">Grand Total</p>
                        </div>
                        <span className="font-mono text-sm font-bold">₹350</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 text-[11px] font-semibold text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
                        <Printer className="h-3 w-3" /> Save &amp; Print
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
