"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Globe,
  Package,
  Plus,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  confirmProductImageAction,
  createQuickCatalogueItemAction,
  removeProductImageAction,
  toggleProductWebFlagsAction,
  updateStorefrontConfigAction,
} from "@/actions/storefront";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import { Form,
  Badge,
  Button,
  Dialog,
  Input,
  Label,
  Select,
  Switch,
} from "@/components/ui/primitives";
import { uploadProductPhotoToStorage } from "@/lib/storage/image-compress";
import { WhatsAppPhoneInput } from "@/components/ui/whatsapp-phone-input";
import type { EnquiryChannel, PriceDisplayMode, TenantRow } from "@/types/database";

type StorefrontProductRow = {
  id: string;
  model_code: string;
  name: string;
  category: string | null;
  brand: string | null;
  is_published_web: boolean;
  is_new_arrival: boolean;
  retail_price: number;
  wholesale_price: number;
  variant_count: number;
  gallery_urls: Array<{ key: string; thumbUrl: string | null }>;
};

export function StorefrontHubClient({
  tenant,
  products,
  webEnabled,
  catEnabled,
}: {
  tenant: TenantRow;
  products: StorefrontProductRow[];
  webEnabled: boolean;
  catEnabled: boolean;
}) {
  const router = useRouter();
  const cfg = tenant.storefront_config;

  const [priceDisplay, setPriceDisplay] = useState<PriceDisplayMode>(cfg?.price_display ?? "retail");
  const [catPriceDisplay, setCatPriceDisplay] = useState<PriceDisplayMode>(cfg?.catalogue_price_display ?? "retail");
  const [whatsapp, setWhatsapp] = useState(cfg?.whatsapp_number ?? "");
  const [enquiryChannel, setEnquiryChannel] = useState<EnquiryChannel>(
    cfg?.enquiry_channel ?? (cfg?.whatsapp_number ? "both" : "inbox")
  );
  const [heroTitle, setHeroTitle] = useState(cfg?.hero_title ?? "New Arrivals");
  const [heroSubtitle, setHeroSubtitle] = useState(cfg?.hero_subtitle ?? "");
  const [showSizes, setShowSizes] = useState(cfg?.show_sizes ?? true);
  const [showBrand, setShowBrand] = useState(cfg?.show_brand ?? true);
  const [showDescription, setShowDescription] = useState(cfg?.show_description ?? true);
  const [showCartonInfo, setShowCartonInfo] = useState(cfg?.show_carton_info ?? true);
  const [savingConfig, setSavingConfig] = useState(false);

  const [catTitle, setCatTitle] = useState(`${tenant.name} — Catalogue`);
  const [newOnly, setNewOnly] = useState(false);
  const [origin, setOrigin] = useState("");
  const [copiedTarget, setCopiedTarget] = useState<"web" | "catalogue" | null>(null);

  // Folded panels (collapsed by default so the page stays clean and focused)
  const [openPanel, setOpenPanel] = useState<"none" | "website" | "pdf">("none");

  // Table filter using our custom Select dropdown
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "shown" | "hidden" | "new">("all");

  // Quick Add Item modal
  const [quickOpen, setQuickOpen] = useState(false);
  const [qCode, setQCode] = useState("");
  const [qName, setQName] = useState("");
  const [qRetail, setQRetail] = useState("");
  const [qWhole, setQWhole] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const catQuery = new URLSearchParams({
    new_only: newOnly ? "1" : "0",
    price: catPriceDisplay,
    title: catTitle,
  }).toString();

  const webPath = `/s/${tenant.slug}`;
  const publicCataloguePath = `/s/${tenant.slug}/catalogue?${catQuery}`;
  const publicPdfPath = `/api/public/catalogue/${encodeURIComponent(tenant.slug)}?${catQuery}`;

  const webUrl = origin ? `${origin}${webPath}` : webPath;
  const publicCatalogueUrl = origin ? `${origin}${publicCataloguePath}` : publicCataloguePath;

  const copySnippet = async (text: string, target: "web" | "catalogue") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedTarget(target);
      toast.success(target === "web" ? "Website link copied!" : "Catalogue link copied!");
      window.setTimeout(() => setCopiedTarget((cur) => (cur === target ? null : cur)), 2000);
    } catch {
      toast.error("Could not copy link.");
    }
  };

  const uploadPhoto = async (productId: string, file: File) => {
    try {
      const { fullKey } = await uploadProductPhotoToStorage(file);
      await confirmProductImageAction(productId, fullKey);
      toast.success("Photo uploaded!");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  const publishedCount = products.filter((p) => p.is_published_web).length;
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (visibilityFilter === "shown") return p.is_published_web;
      if (visibilityFilter === "hidden") return !p.is_published_web;
      if (visibilityFilter === "new") return p.is_new_arrival;
      return true;
    });
  }, [products, visibilityFilter]);

  const columns: ColumnDef<StorefrontProductRow>[] = [
    {
      key: "product",
      header: "Product",
      mobilePrimary: true,
      sortValue: (p) => p.name.toLowerCase(),
      render: (p) => {
        const cover = p.gallery_urls[0]?.thumbUrl ?? null;
        return (
          <div className="flex items-center gap-3">
            {/* POS-inspired clean product thumbnail */}
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-[#ececee] bg-[#fafafa]">
              {cover ? (
                <img src={cover} alt={p.name} className="h-full w-full object-contain p-1" />
              ) : (
                <Package className="h-4 w-4 text-[#a3a3a8]" />
              )}
              {p.gallery_urls.length > 0 && webEnabled && (
                <button
                  type="button"
                  title="Remove cover photo"
                  onClick={async () => {
                    await removeProductImageAction(p.id, p.gallery_urls[0].key);
                    toast.success("Photo removed.");
                    router.refresh();
                  }}
                  className="absolute right-0.5 top-0.5 cursor-pointer rounded bg-black/65 p-0.5 text-white opacity-80 hover:opacity-100"
                >
                  <Trash2 className="h-2.5 w-2.5" />
                </button>
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="truncate font-semibold text-[#171717]">{p.name}</span>
                {p.is_new_arrival && <Badge variant="info">New</Badge>}
              </div>
              <div className="mt-0.5 text-[11px] text-[#77777d]">
                <span className="font-mono">{p.model_code}</span>
                {p.category ? ` · ${p.category}` : ""}
                {p.brand ? ` · ${p.brand}` : ""}
                {p.gallery_urls.length > 1 ? ` · ${p.gallery_urls.length} photos` : ""}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "price",
      header: "Price",
      sortValue: (p) => p.retail_price,
      render: (p) => (
        <div className="font-mono text-xs">
          <div className="font-semibold text-[#171717]">
            ₹{p.retail_price.toLocaleString("en-IN")}
            <span className="ml-1 font-sans text-[10px] font-normal text-[#77777d]">Retail</span>
          </div>
          {p.wholesale_price > 0 && (
            <div className="text-[11px] text-[#77777d]">
              ₹{p.wholesale_price.toLocaleString("en-IN")}
              <span className="ml-1 font-sans text-[10px]">Wholesale</span>
            </div>
          )}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      sortValue: (p) => (p.is_published_web ? 1 : 0),
      render: (p) => (
        <Badge variant={p.is_published_web ? "success" : "default"}>
          {p.is_published_web ? "Live" : "Hidden"}
        </Badge>
      ),
    },
    ...(webEnabled
      ? ([
          {
            key: "website",
            header: "Show on Website",
            render: (p: StorefrontProductRow) => (
              <Switch
                checked={p.is_published_web}
                onCheckedChange={async (v) => {
                  await toggleProductWebFlagsAction(p.id, { is_published_web: v });
                  router.refresh();
                }}
              />
            ),
          },
          {
            key: "new_arrival",
            header: "New Arrival",
            render: (p: StorefrontProductRow) => (
              <Switch
                checked={p.is_new_arrival}
                onCheckedChange={async (v) => {
                  await toggleProductWebFlagsAction(p.id, { is_new_arrival: v });
                  router.refresh();
                }}
              />
            ),
          },
          {
            key: "photo",
            header: "Photo",
            render: (p: StorefrontProductRow) => (
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-[#27272a] shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.08)] transition-colors hover:bg-[#fafafa]">
                <Upload className="h-3.5 w-3.5 text-[#55555b]" />
                {p.gallery_urls.length > 0 ? "Add Photo" : "Upload"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadPhoto(p.id, f);
                  }}
                />
              </label>
            ),
          },
        ] as ColumnDef<StorefrontProductRow>[])
      : []),
  ];

  return (
    <div className="space-y-4">
      {/* Compact Quick-Action Bar (POS-inspired clean tray) */}
      <div className="ui-tray">
        <div className="ui-surface flex flex-wrap items-center justify-between gap-2.5 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            {webEnabled && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => copySnippet(webUrl, "web")}
              >
                {copiedTarget === "web" ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                Copy Website Link
              </Button>
            )}
            {catEnabled && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copySnippet(publicCatalogueUrl, "catalogue")}
                >
                  {copiedTarget === "catalogue" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  Copy Catalogue Link
                </Button>
                <a
                  href={`${publicPdfPath}&download=1`}
                  className="inline-flex min-h-[30px] items-center gap-1.5 rounded-lg bg-[#171717] px-3 text-xs font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,.25)] transition-colors hover:bg-[#2a2a2a]"
                >
                  <Download className="h-3.5 w-3.5" /> Download PDF
                </a>
              </>
            )}
          </div>

          {/* Folded Settings & PDF Options Triggers */}
          <div className="flex flex-wrap items-center gap-2">
            {webEnabled && (
              <Button
                size="sm"
                variant={openPanel === "website" ? "secondary" : "outline"}
                onClick={() => setOpenPanel((p) => (p === "website" ? "none" : "website"))}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Website Settings
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${openPanel === "website" ? "rotate-180" : ""}`}
                />
              </Button>
            )}
            {catEnabled && (
              <Button
                size="sm"
                variant={openPanel === "pdf" ? "secondary" : "outline"}
                onClick={() => setOpenPanel((p) => (p === "pdf" ? "none" : "pdf"))}
              >
                <FileText className="h-3.5 w-3.5" />
                PDF Options
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${openPanel === "pdf" ? "rotate-180" : ""}`}
                />
              </Button>
            )}
          </div>
        </div>

        {/* Folded Panel 1: Website Settings */}
        {openPanel === "website" && webEnabled && (
          <div className="ui-surface mt-[3px] space-y-4 p-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#ececee] pb-2.5">
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-[#55555b]" />
                <div>
                  <h3 className="text-[13px] font-semibold text-[#171717]">Website Settings</h3>
                  <p className="text-[11.5px] text-[#77777d]">
                    Choose your title, prices, and where customer enquiries go.
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                disabled={savingConfig}
                onClick={async () => {
                  setSavingConfig(true);
                  try {
                    await updateStorefrontConfigAction({
                      price_display: priceDisplay,
                      catalogue_price_display: catPriceDisplay,
                      whatsapp_number: whatsapp,
                      enquiry_channel: enquiryChannel,
                      hero_title: heroTitle,
                      hero_subtitle: heroSubtitle,
                      show_sizes: showSizes,
                      show_brand: showBrand,
                      show_description: showDescription,
                      show_carton_info: showCartonInfo,
                    });
                    toast.success("Website settings saved!");
                    setOpenPanel("none");
                    router.refresh();
                  } finally {
                    setSavingConfig(false);
                  }
                }}
              >
                {savingConfig ? "Saving..." : "Save Settings"}
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label>Website Heading</Label>
                <Input
                  value={heroTitle}
                  onChange={(e) => setHeroTitle(e.target.value)}
                  placeholder="e.g. New Arrivals"
                />
              </div>
              <div>
                <Label>Short Subtitle (Optional)</Label>
                <Input
                  value={heroSubtitle}
                  onChange={(e) => setHeroSubtitle(e.target.value)}
                  placeholder="e.g. Direct Factory Wholesale"
                />
              </div>
              <div>
                <Label>WhatsApp Number</Label>
                <WhatsAppPhoneInput
                  value={whatsapp}
                  onChange={setWhatsapp}
                  placeholder="9876543210"
                />
              </div>
              <div>
                <Label>Show Prices on Website</Label>
                <Select
                  value={priceDisplay}
                  onChange={(e) => setPriceDisplay(e.target.value as PriceDisplayMode)}
                >
                  <option value="retail">Show Retail Price</option>
                  <option value="wholesale">Show Wholesale Price</option>
                  <option value="hide">Hide Prices (Enquiry Only)</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Where should customer enquiries go?</Label>
                <Select
                  value={enquiryChannel}
                  onChange={(e) => setEnquiryChannel(e.target.value as EnquiryChannel)}
                >
                  <option value="both">Both (Enquiries Inbox + WhatsApp)</option>
                  <option value="inbox">Enquiries Inbox Only</option>
                  <option value="whatsapp">WhatsApp Only</option>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl bg-[#fafafa] px-3.5 py-2.5 border border-[#ececee]">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#77777d]">
                Show on Website:
              </span>
              <Switch checked={showSizes} onCheckedChange={setShowSizes} label="Available Sizes" />
              <Switch checked={showBrand} onCheckedChange={setShowBrand} label="Brand Name" />
              <Switch checked={showCartonInfo} onCheckedChange={setShowCartonInfo} label="Pcs per Carton" />
              <Switch checked={showDescription} onCheckedChange={setShowDescription} label="Description" />
            </div>
          </div>
        )}

        {/* Folded Panel 2: PDF & Catalogue Options */}
        {openPanel === "pdf" && catEnabled && (
          <div className="ui-surface mt-[3px] space-y-3 p-4">
            <div className="flex items-center justify-between gap-2 border-b border-[#ececee] pb-2.5">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#55555b]" />
                <div>
                  <h3 className="text-[13px] font-semibold text-[#171717]">PDF &amp; Catalogue Options</h3>
                  <p className="text-[11.5px] text-[#77777d]">
                    Customize what appears when you download or share your catalogue.
                  </p>
                </div>
              </div>
              <a
                href={publicCataloguePath}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-[#171717] hover:bg-slate-50"
              >
                Preview Catalogue <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:items-end">
              <div>
                <Label>Catalogue Title</Label>
                <Input value={catTitle} onChange={(e) => setCatTitle(e.target.value)} />
              </div>
              <div>
                <Label>Prices in PDF</Label>
                <Select
                  value={catPriceDisplay}
                  onChange={(e) => setCatPriceDisplay(e.target.value as PriceDisplayMode)}
                >
                  <option value="retail">Retail Price</option>
                  <option value="wholesale">Wholesale Price</option>
                  <option value="hide">Hide Prices</option>
                </Select>
              </div>
              <div className="pb-1.5">
                <Switch checked={newOnly} onCheckedChange={setNewOnly} label="Only New Arrivals" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Main Products Table (Reusing Dashboard DataTable styling) */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
          <p className="text-xs text-[#77777d]">
            <strong className="font-semibold text-[#171717]">{publishedCount}</strong> of{" "}
            <strong className="font-semibold text-[#171717]">{products.length}</strong> products are
            live on your website. Turn the switch ON to show a product.
          </p>
        </div>

        <DataTable
          data={filteredProducts}
          columns={columns}
          rowKey={(p) => p.id}
          searchPlaceholder="Search product name, model code, category..."
          searchFilter={(p, q) =>
            p.name.toLowerCase().includes(q) ||
            p.model_code.toLowerCase().includes(q) ||
            (p.category ?? "").toLowerCase().includes(q) ||
            (p.brand ?? "").toLowerCase().includes(q)
          }
          emptyMessage="No products match this filter."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-44">
                <Select
                  aria-label="Filter products"
                  value={visibilityFilter}
                  onChange={(e) =>
                    setVisibilityFilter(e.target.value as "all" | "shown" | "hidden" | "new")
                  }
                >
                  <option value="all">All Products ({products.length})</option>
                  <option value="shown">Shown on Website ({publishedCount})</option>
                  <option value="hidden">Hidden ({products.length - publishedCount})</option>
                  <option value="new">
                    New Arrivals ({products.filter((p) => p.is_new_arrival).length})
                  </option>
                </Select>
              </div>
              {webEnabled && (
                <Button size="sm" onClick={() => setQuickOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> Add Product
                </Button>
              )}
            </div>
          }
        />
      </div>

      {/* Quick Add Item Modal */}
      <Dialog
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        title="Quick Add Website Product"
        subtitle="Add a product directly to your website and PDF catalogue."
      >
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            await createQuickCatalogueItemAction({
              modelCode: qCode,
              name: qName,
              retailPrice: Number(qRetail || 0),
              wholesalePrice: Number(qWhole || 0),
            });
            setQCode("");
            setQName("");
            setQRetail("");
            setQWhole("");
            setQuickOpen(false);
            toast.success("Product added & shown on your website!");
            router.refresh();
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <div>
              <Label>Model Code *</Label>
              <Input
                value={qCode}
                onChange={(e) => setQCode(e.target.value.toUpperCase())}
                placeholder="e.g. DON-6X9"
                required
              />
            </div>
            <div>
              <Label>Product Name *</Label>
              <Input
                value={qName}
                onChange={(e) => setQName(e.target.value)}
                placeholder="e.g. Don Slipper"
                required
              />
            </div>
            <div>
              <Label>Retail Price ₹</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={qRetail}
                onChange={(e) => setQRetail(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
              />
            </div>
            <div>
              <Label>Wholesale Price ₹</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={qWhole}
                onChange={(e) => setQWhole(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setQuickOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              <Plus className="h-3.5 w-3.5" /> Add &amp; Show on Website
            </Button>
          </div>
        </Form>
      </Dialog>
    </div>
  );
}
