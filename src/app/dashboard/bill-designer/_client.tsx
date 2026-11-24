"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Package, Plus, Printer, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBillTemplateAction, saveBillTemplateAction, savePosScreenLayoutAction } from "@/actions/billing";
import { InvoiceRenderer } from "@/components/billing/invoice-renderer";
import { Button, Card, CardContent, CardHeader, Input, Label, Select, Switch, Tabs } from "@/components/ui/primitives";
import type { BillDesignStyle, BillFormat, BillTemplateConfig, BillTemplateRow, TenantRow } from "@/types/database";

type PresetCategory = "a4" | "a5" | "small";

interface BillTemplatePreset {
  id: string;
  category: PresetCategory;
  name: string;
  desc: string;
  format: BillFormat;
  design_style: BillDesignStyle;
  accent_color: string;
  show_hsn: boolean;
  show_gst_summary: boolean;
  show_upi_qr: boolean;
  header_subtitle: string;
}

const TEMPLATE_PRESETS: BillTemplatePreset[] = [
  // A4 Full Page (5 templates)
  {
    id: "a4-gst-full",
    category: "a4",
    name: "A4 Full GST Tax Invoice",
    desc: "Complete Indian GST layout: HSN, Taxable, CGST/SGST & Signatory",
    format: "a4",
    design_style: "gst_full",
    accent_color: "#0f172a",
    show_hsn: true,
    show_gst_summary: true,
    show_upi_qr: true,
    header_subtitle: "GST Registered Supplier · Tax Invoice",
  },
  {
    id: "a4-classic",
    category: "a4",
    name: "A4 Classic GST",
    desc: "Clean accent line & structured tax invoice",
    format: "a4",
    design_style: "classic",
    accent_color: "#0284c7",
    show_hsn: true,
    show_gst_summary: true,
    show_upi_qr: true,
    header_subtitle: "GST Tax Invoice",
  },
  {
    id: "a4-modern",
    category: "a4",
    name: "A4 Modern Banner",
    desc: "Colored top banner & shaded summary card",
    format: "a4",
    design_style: "modern",
    accent_color: "#0f172a",
    show_hsn: true,
    show_gst_summary: true,
    show_upi_qr: true,
    header_subtitle: "Official Retail & Wholesale Invoice",
  },
  {
    id: "a4-minimal",
    category: "a4",
    name: "A4 Minimalist Retail",
    desc: "Ultra-clean monochrome showroom bill",
    format: "a4",
    design_style: "minimal",
    accent_color: "#171717",
    show_hsn: false,
    show_gst_summary: true,
    show_upi_qr: false,
    header_subtitle: "Retail Showroom",
  },
  {
    id: "a4-wholesale",
    category: "a4",
    name: "A4 Wholesale Ledger",
    desc: "Bordered trade invoice with signatory box",
    format: "a4",
    design_style: "bordered",
    accent_color: "#1e3a8a",
    show_hsn: true,
    show_gst_summary: true,
    show_upi_qr: true,
    header_subtitle: "Wholesale & Distribution Invoice",
  },

  // A5 Half Page (3 templates)
  {
    id: "a5-standard",
    category: "a5",
    name: "A5 Standard Bill",
    desc: "Compact half-page bill, saves paper",
    format: "a5",
    design_style: "classic",
    accent_color: "#0284c7",
    show_hsn: true,
    show_gst_summary: true,
    show_upi_qr: true,
    header_subtitle: "Half-Page Tax Invoice",
  },
  {
    id: "a5-modern",
    category: "a5",
    name: "A5 Modern Slip",
    desc: "Bold colored header with shaded rows",
    format: "a5",
    design_style: "modern",
    accent_color: "#0f766e",
    show_hsn: false,
    show_gst_summary: true,
    show_upi_qr: true,
    header_subtitle: "Direct Counter Invoice",
  },
  {
    id: "a5-cashmemo",
    category: "a5",
    name: "A5 Simple Cash Memo",
    desc: "Clean non-GST cash memo / trade slip",
    format: "a5",
    design_style: "bordered",
    accent_color: "#171717",
    show_hsn: false,
    show_gst_summary: false,
    show_upi_qr: false,
    header_subtitle: "Cash / Credit Memo",
  },

  // Small Bills — 80mm & 58mm Thermal (3 templates)
  {
    id: "small-80-classic",
    category: "small",
    name: "80mm Classic Receipt",
    desc: "Standard thermal counter roll with dashed lines",
    format: "thermal_80mm",
    design_style: "classic",
    accent_color: "#171717",
    show_hsn: false,
    show_gst_summary: true,
    show_upi_qr: true,
    header_subtitle: "Counter Receipt",
  },
  {
    id: "small-80-bold",
    category: "small",
    name: "80mm Bold Header",
    desc: "Inverted dark header & large bold total",
    format: "thermal_80mm",
    design_style: "bold",
    accent_color: "#171717",
    show_hsn: false,
    show_gst_summary: true,
    show_upi_qr: true,
    header_subtitle: "Express Retail Bill",
  },
  {
    id: "small-58-mini",
    category: "small",
    name: "58mm Mini Pocket",
    desc: "Narrow 2-inch receipt with stacked item lines",
    format: "thermal_58mm",
    design_style: "minimal",
    accent_color: "#171717",
    show_hsn: false,
    show_gst_summary: false,
    show_upi_qr: false,
    header_subtitle: "Quick Receipt",
  },
];

const SAMPLE_POS_PRODUCTS = [
  { name: "Oxford Classic Derby", attrs: "UK 8 · Black", sku: "IMR-101-UK8", hsn: "6403", gst: 5, price: 2199, stock: 24, qty: 1 },
  { name: "Comfort Slide Pro", attrs: "UK 10 · Black", sku: "IMR-301-UK10", hsn: "6402", gst: 5, price: 599, stock: 40, qty: 2 },
  { name: "AeroStride Runner", attrs: "UK 9 · Navy", sku: "IMR-201-UK9", hsn: "6404", gst: 5, price: 1599, stock: 16, qty: 0 },
  { name: "Milan Tan Loafer", attrs: "UK 8 · Tan", sku: "IMR-102-UK8", hsn: "6403", gst: 12, price: 2999, stock: 12, qty: 0 },
];

export function BillDesignerClient({
  tenant,
  templates,
}: {
  tenant: TenantRow;
  templates: BillTemplateRow[];
}) {
  const router = useRouter();
  const defaultCfg: BillTemplateConfig = {
    header_title: tenant.name.toUpperCase(),
    header_subtitle: "GST Tax Invoice",
    footer_note: "Thank you for your business!",
    terms: "7-day exchange with original bill.",
    accent_color: tenant.brand_config?.primary_color ?? "#0284c7",
    design_style: "classic",
    show_logo: true,
    show_hsn: true,
    show_gst_summary: true,
    show_discount: true,
    show_custom_fields: false,
    show_upi_qr: true,
  };
  const initial = templates[0];
  const [tab, setTab] = useState("print");
  const [selectedId, setSelectedId] = useState<string>(initial?.id ?? "new");
  const [format, setFormat] = useState<BillFormat>(initial?.format ?? "a4");
  const [name, setName] = useState(initial?.name ?? "Standard Invoice");
  const [config, setConfig] = useState<BillTemplateConfig>({ ...defaultCfg, ...initial?.config });
  const [presetCat, setPresetCat] = useState<PresetCategory>(
    initial?.format === "a5"
      ? "a5"
      : initial?.format === "thermal_80mm" || initial?.format === "thermal_58mm"
      ? "small"
      : "a4"
  );
  const [activePresetId, setActivePresetId] = useState<string | null>(null);

  const selectTemplate = (id: string) => {
    setSelectedId(id);
    setActivePresetId(null);
    if (id === "new") {
      setName("New Bill Template");
      setFormat("a4");
      setPresetCat("a4");
      setConfig(defaultCfg);
      return;
    }
    const found = templates.find((t) => t.id === id);
    if (found) {
      setName(found.name);
      setFormat(found.format);
      setPresetCat(
        found.format === "a5"
          ? "a5"
          : found.format === "thermal_80mm" || found.format === "thermal_58mm"
          ? "small"
          : "a4"
      );
      setConfig({ ...defaultCfg, ...found.config });
    }
  };

  const applyPreset = (p: BillTemplatePreset) => {
    setActivePresetId(p.id);
    setFormat(p.format);
    if (selectedId === "new") {
      setName(p.name);
    }
    setConfig((prev) => ({
      ...prev,
      design_style: p.design_style,
      accent_color: p.accent_color,
      show_hsn: p.show_hsn,
      show_gst_summary: p.show_gst_summary,
      show_upi_qr: p.show_upi_qr,
      header_subtitle: p.header_subtitle,
    }));
  };

  // Billing screen layout customizer state
  const [posLayout, setPosLayout] = useState<"grid" | "list">(tenant.brand_config?.pos_ui?.layout ?? "grid");
  const [showThumbs, setShowThumbs] = useState(tenant.brand_config?.pos_ui?.show_thumbs ?? true);
  const [showHsnCol, setShowHsnCol] = useState(tenant.brand_config?.pos_ui?.show_hsn_col ?? true);

  const visiblePresets = TEMPLATE_PRESETS.filter((p) => p.category === presetCat);

  return (
    <div className="space-y-4">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "print", label: "Print Layout Designer (A4 / A5 / Small)" },
          { id: "screen", label: "Billing Screen Layout" },
        ]}
      />

      {tab === "print" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-5 space-y-4">
            {/* Ready-to-Use Template Gallery by Category */}
            <div className="ui-tray">
              <div className="ui-surface p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-[#55555b]" />
                    <h3 className="text-[13px] font-semibold text-[#171717]">Ready-Made Bill Templates</h3>
                  </div>
                  <div className="inline-flex rounded-full bg-[#f1f1f2] p-[2px] text-[11px]">
                    {(
                      [
                        { id: "a4", label: "A4 (5)" },
                        { id: "a5", label: "A5 (3)" },
                        { id: "small", label: "Small (3)" },
                      ] as const
                    ).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setPresetCat(c.id)}
                        className={`cursor-pointer rounded-full px-2.5 py-1 font-semibold transition-all ${
                          presetCat === c.id
                            ? "bg-white text-[#171717] shadow-2xs"
                            : "text-[#77777d] hover:text-[#171717]"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {visiblePresets.map((p) => {
                    const isSelected = activePresetId === p.id;
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
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#171717]">
                            <span
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: p.accent_color }}
                            />
                            {p.name}
                          </span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-[#171717]" />}
                        </div>
                        <p className="mt-1 text-[10.5px] leading-snug text-[#77777d]">{p.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Fine-Tune Controls */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Customize Selected Template</h3>
                <div className="flex items-center gap-1.5">
                  {selectedId !== "new" && !templates.find((t) => t.id === selectedId)?.is_default && (
                    <Button
                      size="sm"
                      variant="danger"
                      title="Delete Template"
                      onClick={async () => {
                        if (!confirm(`Delete template "${name}"?`)) return;
                        await deleteBillTemplateAction(selectedId);
                        toast.success("Template deleted.");
                        selectTemplate(templates[0]?.id ?? "new");
                        router.refresh();
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button size="sm" variant="outline" onClick={() => selectTemplate("new")}>
                    + New
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {templates.length > 0 && (
                  <div>
                    <Label>Your Saved Templates</Label>
                    <Select value={selectedId} onChange={(e) => selectTemplate(e.target.value)}>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.format}){t.is_default ? " ★ Default" : ""}
                        </option>
                      ))}
                      <option value="new">+ Create New Template...</option>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label>Template Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div>
                    <Label>Paper Size</Label>
                    <Select
                      value={format}
                      onChange={(e) => {
                        const f = e.target.value as BillFormat;
                        setFormat(f);
                        setPresetCat(f === "a5" ? "a5" : f === "a4" ? "a4" : "small");
                      }}
                    >
                      <option value="a4">A4 Full Page</option>
                      <option value="a5">A5 Half Page</option>
                      <option value="thermal_80mm">80mm Small Bill (Thermal)</option>
                      <option value="thermal_58mm">58mm Mini Bill (Thermal)</option>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label>Design Style</Label>
                    <Select
                      value={config.design_style ?? "classic"}
                      onChange={(e) =>
                        setConfig({ ...config, design_style: e.target.value as BillDesignStyle })
                      }
                    >
                      <option value="gst_full">Full GST Tax Invoice (Indian Format)</option>
                      <option value="classic">Classic Clean</option>
                      <option value="modern">Modern Banner</option>
                      <option value="minimal">Minimalist</option>
                      <option value="bordered">Wholesale Bordered</option>
                      <option value="bold">Bold Dark Header</option>
                    </Select>
                  </div>
                  <div>
                    <Label>Accent Color</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="color"
                        className="!w-12 h-9 p-1 cursor-pointer"
                        value={config.accent_color}
                        onChange={(e) => setConfig({ ...config, accent_color: e.target.value })}
                      />
                      <span className="font-mono text-xs text-[#55555b]">
                        {config.accent_color.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
                <div>
                  <Label>Header Title</Label>
                  <Input
                    value={config.header_title}
                    onChange={(e) => setConfig({ ...config, header_title: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Subtitle / Branch Tag</Label>
                  <Input
                    value={config.header_subtitle}
                    onChange={(e) => setConfig({ ...config, header_subtitle: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Terms &amp; Conditions</Label>
                  <Input
                    value={config.terms}
                    onChange={(e) => setConfig({ ...config, terms: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Footer Note</Label>
                  <Input
                    value={config.footer_note}
                    onChange={(e) => setConfig({ ...config, footer_note: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5 pt-1">
                  <Switch
                    checked={config.show_hsn}
                    onCheckedChange={(v) => setConfig({ ...config, show_hsn: v })}
                    label="Show HSN Column on Bill"
                  />
                  <Switch
                    checked={config.show_gst_summary}
                    onCheckedChange={(v) => setConfig({ ...config, show_gst_summary: v })}
                    label="Show GST, GSTIN & Tax Details on Bill"
                  />
                  <Switch
                    checked={config.show_upi_qr}
                    onCheckedChange={(v) => setConfig({ ...config, show_upi_qr: v })}
                    label="Show UPI Payment Block"
                  />
                </div>
                <Button
                  className="w-full"
                  onClick={async () => {
                    await saveBillTemplateAction({
                      id: selectedId === "new" ? undefined : selectedId,
                      name: name.trim() || "Invoice Template",
                      format,
                      isDefault: true,
                      config,
                    });
                    toast.success("Bill template saved & set as default.");
                    router.refresh();
                  }}
                >
                  Save Print Layout as Default
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="lg:col-span-7">
            <div className="sticky top-4 space-y-2">
              <div className="flex items-center justify-between px-1">
                <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-[#77777d]">
                  Live Bill Preview ({format.replace("_", " ").toUpperCase()} · {config.design_style ?? "classic"})
                </span>
              </div>
              <InvoiceRenderer
                format={format}
                config={config}
                data={{
                  invoiceNumber: "CHN/26-27/0042",
                  invoiceType: "sale",
                  dateStr: "23/11/2026, 05:30 PM",
                  branchName: "Chennai Retail Shop",
                  branchAddress: "T. Nagar Main Road, Chennai",
                  branchGstin: "33AABCI1234F1Z2",
                  customerName: "Karthik R.",
                  customerPhone: "9840099887",
                  taxableAmount: 3235.24,
                  cgstAmount: 80.88,
                  sgstAmount: 80.88,
                  igstAmount: 0,
                  roundOff: 0,
                  grandTotal: 3397,
                  paidAmount: 3397,
                  dueAmount: 0,
                  items: [
                    {
                      product_name: "Oxford Classic Derby (UK 8 / Black)",
                      sku: "IMR-101-UK8-BLA",
                      hsn_code: "6403",
                      qty: 1,
                      unit_price: 2199,
                      gst_rate: 5,
                      line_total: 2199,
                    },
                    {
                      product_name: "Comfort Slide Pro (UK 10 / Black)",
                      sku: "IMR-301-UK10-BLA",
                      hsn_code: "6402",
                      qty: 2,
                      unit_price: 599,
                      gst_rate: 5,
                      line_total: 1198,
                    },
                  ],
                }}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Billing Screen Layout + Live POS Preview */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-5 h-fit">
            <CardHeader>
              <h3 className="text-sm font-semibold">POS Billing Screen Appearance</h3>
              <p className="mt-0.5 text-xs text-[#77777d]">
                Change any setting below and watch the live POS screen preview update instantly.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Product Picker Layout</Label>
                <Select
                  value={posLayout}
                  onChange={(e) => setPosLayout(e.target.value as "grid" | "list")}
                >
                  <option value="grid">Touch Card Grid (Best for Tablets &amp; Phones)</option>
                  <option value="list">Compact Table List (Best for Fast Barcode Counters)</option>
                </Select>
              </div>
              <div className="space-y-2 rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                <Switch
                  checked={showThumbs}
                  onCheckedChange={setShowThumbs}
                  label="Show Product Thumbnails in POS"
                />
                <Switch
                  checked={showHsnCol}
                  onCheckedChange={setShowHsnCol}
                  label="Show HSN & GST% in Cart"
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
                  toast.success("Billing screen layout updated.");
                  router.refresh();
                }}
              >
                Save Screen Layout
              </Button>
            </CardContent>
          </Card>

          {/* Live POS Screen Preview */}
          <div className="lg:col-span-7 space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.05em] text-[#77777d]">
                Live POS Screen Preview ({posLayout === "grid" ? "Touch Card Grid" : "Compact List"})
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Live
              </span>
            </div>

            <div className="ui-tray">
              <div className="ui-surface p-3 sm:p-4">
                <div className="grid grid-cols-1 gap-3 xl:grid-cols-12">
                  {/* Left: Simulated POS Product Picker */}
                  <div className="xl:col-span-7 space-y-2.5">
                    <div className="flex items-center gap-2 rounded-lg border border-[#ececee] bg-[#fafafa] px-2.5 py-1.5 text-[11px] text-[#a3a3a8]">
                      <Search className="h-3.5 w-3.5" />
                      <span>Search product name, SKU, or scan barcode...</span>
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

                  {/* Right: Simulated Current Bill Cart */}
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
                        <span className="font-mono text-sm font-bold">₹3,397</span>
                      </div>
                      <div className="flex items-center justify-center gap-1.5 rounded-lg bg-white py-1.5 text-[11px] font-semibold text-[#171717] shadow-[0_0_0_1px_rgba(0,0,0,.08)]">
                        <Printer className="h-3 w-3" /> Finalize &amp; Print
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
