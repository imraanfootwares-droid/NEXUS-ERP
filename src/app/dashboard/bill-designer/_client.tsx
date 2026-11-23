"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deleteBillTemplateAction, saveBillTemplateAction, savePosScreenLayoutAction } from "@/actions/billing";
import { InvoiceRenderer } from "@/components/billing/invoice-renderer";
import { Button, Card, CardContent, CardHeader, Input, Label, Select, Switch, Tabs } from "@/components/ui/primitives";
import type { BillTemplateConfig, BillTemplateRow, TenantRow } from "@/types/database";

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
  const [format, setFormat] = useState<"a4" | "thermal_80mm" | "thermal_58mm">(initial?.format ?? "a4");
  const [name, setName] = useState(initial?.name ?? "Standard Invoice");
  const [config, setConfig] = useState<BillTemplateConfig>(initial?.config ?? defaultCfg);

  const selectTemplate = (id: string) => {
    setSelectedId(id);
    if (id === "new") {
      setName("Thermal 80mm Receipt");
      setFormat("thermal_80mm");
      setConfig(defaultCfg);
      return;
    }
    const found = templates.find((t) => t.id === id);
    if (found) {
      setName(found.name);
      setFormat(found.format);
      setConfig({ ...defaultCfg, ...found.config });
    }
  };

  // Billing screen layout customizer state
  const [posLayout, setPosLayout] = useState<"grid" | "list">(tenant.brand_config?.pos_ui?.layout ?? "grid");
  const [showThumbs, setShowThumbs] = useState(tenant.brand_config?.pos_ui?.show_thumbs ?? true);
  const [showHsnCol, setShowHsnCol] = useState(tenant.brand_config?.pos_ui?.show_hsn_col ?? true);

  return (
    <div className="space-y-4">
      <Tabs
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "print", label: "Print Layout Designer (A4 / Thermal)" },
          { id: "screen", label: "Billing Screen Layout" },
        ]}
      />

      {tab === "print" ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          <Card className="lg:col-span-5">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Layout Controls</h3>
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
                  + New Template
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {templates.length > 0 && (
                <div>
                  <Label>Select Saved Template</Label>
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
                  <Label>Paper Format</Label>
                  <Select value={format} onChange={(e) => setFormat(e.target.value as typeof format)}>
                    <option value="a4">A4 Tax Invoice</option>
                    <option value="thermal_80mm">80mm Thermal Receipt</option>
                    <option value="thermal_58mm">58mm Thermal Receipt</option>
                  </Select>
                </div>
              </div>
              <div><Label>Header Title</Label><Input value={config.header_title} onChange={(e) => setConfig({ ...config, header_title: e.target.value })} /></div>
              <div><Label>Subtitle / Branch Tag</Label><Input value={config.header_subtitle} onChange={(e) => setConfig({ ...config, header_subtitle: e.target.value })} /></div>
              <div><Label>Accent Color</Label><Input type="color" className="h-11 p-1" value={config.accent_color} onChange={(e) => setConfig({ ...config, accent_color: e.target.value })} /></div>
              <div><Label>Terms &amp; Conditions</Label><Input value={config.terms} onChange={(e) => setConfig({ ...config, terms: e.target.value })} /></div>
              <div><Label>Footer Note</Label><Input value={config.footer_note} onChange={(e) => setConfig({ ...config, footer_note: e.target.value })} /></div>
              <div className="flex flex-col gap-2.5 pt-2">
                <Switch checked={config.show_hsn} onCheckedChange={(v) => setConfig({ ...config, show_hsn: v })} label="Show HSN Column" />
                <Switch checked={config.show_gst_summary} onCheckedChange={(v) => setConfig({ ...config, show_gst_summary: v })} label="Show GST Tax Breakdown" />
                <Switch checked={config.show_upi_qr} onCheckedChange={(v) => setConfig({ ...config, show_upi_qr: v })} label="Show UPI Payment Block" />
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

          <div className="lg:col-span-7">
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
                taxableAmount: 2094.29,
                cgstAmount: 52.35,
                sgstAmount: 52.36,
                igstAmount: 0,
                roundOff: 0,
                grandTotal: 2199,
                paidAmount: 2199,
                dueAmount: 0,
                items: [
                  { product_name: "Oxford Classic Derby (UK 8 / Black)", sku: "IMR-101-UK8-BLA", hsn_code: "6403", qty: 1, unit_price: 2199, gst_rate: 5, line_total: 2199 },
                ],
              }}
            />
          </div>
        </div>
      ) : (
        <Card className="max-w-xl">
          <CardHeader><h3 className="text-sm font-semibold">POS Billing Screen Appearance</h3></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Product Picker Layout</Label>
              <Select value={posLayout} onChange={(e) => setPosLayout(e.target.value as "grid" | "list")}>
                <option value="grid">Touch Card Grid (Best for Tablets &amp; Phones)</option>
                <option value="list">Compact Table List (Best for Fast Barcode Counters)</option>
              </Select>
            </div>
            <Switch checked={showThumbs} onCheckedChange={setShowThumbs} label="Show Product Thumbnails in POS" />
            <Switch checked={showHsnCol} onCheckedChange={setShowHsnCol} label="Show HSN & GST% Column in Cart" />
            <Button
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
      )}
    </div>
  );
}
