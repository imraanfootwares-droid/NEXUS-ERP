"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Download, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  confirmProductImageAction,
  createQuickCatalogueItemAction,
  removeProductImageAction,
  toggleProductWebFlagsAction,
  updateStorefrontConfigAction,
} from "@/actions/storefront";
import { Button, Card, CardContent, CardHeader, Input, Label, Select, Switch } from "@/components/ui/primitives";
import { uploadProductPhotoToStorage } from "@/lib/storage/image-compress";
import type { PriceDisplayMode, TenantRow } from "@/types/database";

export function StorefrontHubClient({
  tenant,
  products,
  webEnabled,
  catEnabled,
}: {
  tenant: TenantRow;
  products: Array<{
    id: string;
    model_code: string;
    name: string;
    category: string | null;
    is_published_web: boolean;
    is_new_arrival: boolean;
    gallery_urls: Array<{ key: string; thumbUrl: string | null }>;
  }>;
  webEnabled: boolean;
  catEnabled: boolean;
}) {
  const router = useRouter();
  const [priceDisplay, setPriceDisplay] = useState<PriceDisplayMode>(tenant.storefront_config?.price_display ?? "retail");
  const [catPriceDisplay, setCatPriceDisplay] = useState<PriceDisplayMode>(tenant.storefront_config?.catalogue_price_display ?? "retail");
  const [whatsapp, setWhatsapp] = useState(tenant.storefront_config?.whatsapp_number ?? "");
  const [heroTitle, setHeroTitle] = useState(tenant.storefront_config?.hero_title ?? "New Arrivals");
  const [catTitle, setCatTitle] = useState("New Arrivals — Footwear Catalogue");
  const [newOnly, setNewOnly] = useState(true);

  const [qCode, setQCode] = useState("");
  const [qName, setQName] = useState("");
  const [qRetail, setQRetail] = useState(0);
  const [qWhole, setQWhole] = useState(0);

  const uploadPhoto = async (productId: string, file: File) => {
    try {
      const { fullKey, via } = await uploadProductPhotoToStorage(file);
      await confirmProductImageAction(productId, fullKey);
      toast.success(
        via === "r2"
          ? "WebP photo uploaded to Cloudflare R2!"
          : "WebP photo uploaded (Dev Preview mode)!"
      );
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {webEnabled && (
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">Website Settings</h3></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Website Price Display</Label>
                  <Select value={priceDisplay} onChange={(e) => setPriceDisplay(e.target.value as PriceDisplayMode)}>
                    <option value="retail">Show Retail Price</option>
                    <option value="wholesale">Show Wholesale Price</option>
                    <option value="hide">Hide Prices (Enquiry Only)</option>
                  </Select>
                </div>
                <div>
                  <Label>WhatsApp Number (91...)</Label>
                  <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="919876543210" />
                </div>
              </div>
              <div><Label>Hero Title</Label><Input value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} /></div>
              <Button
                size="sm"
                onClick={async () => {
                  await updateStorefrontConfigAction({
                    price_display: priceDisplay,
                    catalogue_price_display: catPriceDisplay,
                    whatsapp_number: whatsapp,
                    hero_title: heroTitle,
                    hero_subtitle: tenant.storefront_config?.hero_subtitle ?? "",
                  });
                  toast.success("Storefront config saved.");
                }}
              >
                Save Website Settings
              </Button>
            </CardContent>
          </Card>
        )}

        {catEnabled && (
          <Card>
            <CardHeader><h3 className="text-sm font-semibold">1-Click WhatsApp PDF Catalogue</h3></CardHeader>
            <CardContent className="space-y-3">
              <div><Label>Catalogue Cover Title</Label><Input value={catTitle} onChange={(e) => setCatTitle(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-2 items-center">
                <div>
                  <Label>Price Display in PDF</Label>
                  <Select value={catPriceDisplay} onChange={(e) => setCatPriceDisplay(e.target.value as PriceDisplayMode)}>
                    <option value="retail">Retail Price</option>
                    <option value="wholesale">Wholesale Price</option>
                    <option value="hide">Hide Prices</option>
                  </Select>
                </div>
                <div className="pt-4">
                  <Switch checked={newOnly} onCheckedChange={setNewOnly} label="New Arrivals Only" />
                </div>
              </div>
              <a
                href={`/api/documents/catalogue/export?new_only=${newOnly ? "1" : "0"}&price=${catPriceDisplay}&title=${encodeURIComponent(catTitle)}`}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-sky-700"
              >
                <Download className="h-4 w-4" /> Export PDF Catalogue for WhatsApp
              </a>
            </CardContent>
          </Card>
        )}
      </div>

      {webEnabled && (
        <Card>
          <CardHeader><h3 className="text-sm font-semibold">Quick Catalogue Item (Works Even Without Stock Module)</h3></CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await createQuickCatalogueItemAction({
                  modelCode: qCode,
                  name: qName,
                  retailPrice: qRetail,
                  wholesalePrice: qWhole,
                });
                setQCode(""); setQName(""); setQRetail(0); setQWhole(0);
                toast.success("Item added & published.");
                router.refresh();
              }}
              className="grid grid-cols-2 sm:grid-cols-6 gap-2 items-end"
            >
              <div><Label>Code</Label><Input value={qCode} onChange={(e) => setQCode(e.target.value)} required /></div>
              <div className="sm:col-span-2"><Label>Name</Label><Input value={qName} onChange={(e) => setQName(e.target.value)} required /></div>
              <div><Label>Retail ₹</Label><Input type="number" min={0} value={qRetail} onChange={(e) => setQRetail(Number(e.target.value))} /></div>
              <div><Label>Wholesale ₹</Label><Input type="number" min={0} value={qWhole} onChange={(e) => setQWhole(Number(e.target.value))} /></div>
              <Button type="submit"><Plus className="h-4 w-4" /> Add</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {products.map((p) => (
          <Card key={p.id}>
            <CardContent className="p-4 space-y-3 text-xs">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-bold text-slate-900">{p.name}</p>
                  <p className="text-slate-500">{p.model_code}</p>
                </div>
                {webEnabled && (
                  <label className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 cursor-pointer hover:bg-slate-50">
                    <Upload className="h-3.5 w-3.5" /> Add Photo
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
                )}
              </div>

              {p.gallery_urls.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {p.gallery_urls.map((g) => (
                    <div key={g.key} className="relative h-16 w-16 shrink-0 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                      {g.thumbUrl && <img src={g.thumbUrl} alt={p.name} className="h-full w-full object-cover" />}
                      <button
                        type="button"
                        onClick={async () => {
                          await removeProductImageAction(p.id, g.key);
                          toast.success("Image deleted from R2.");
                          router.refresh();
                        }}
                        className="absolute top-0.5 right-0.5 rounded bg-black/60 p-0.5 text-white"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {webEnabled && (
                <div className="flex gap-4 pt-2 border-t border-slate-100">
                  <Switch
                    checked={p.is_published_web}
                    onCheckedChange={async (v) => {
                      await toggleProductWebFlagsAction(p.id, { is_published_web: v });
                      router.refresh();
                    }}
                    label="Published"
                  />
                  <Switch
                    checked={p.is_new_arrival}
                    onCheckedChange={async (v) => {
                      await toggleProductWebFlagsAction(p.id, { is_new_arrival: v });
                      router.refresh();
                    }}
                    label="New Arrival"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
