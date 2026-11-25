import { notFound } from "next/navigation";
import {
  PublicCatalogueClient,
  type PublicCatalogueItem,
} from "@/components/storefront/public-catalogue-client";
import { isDevPreviewAllowed } from "@/lib/dev/preview";
import { isConfigured } from "@/lib/env";
import { query } from "@/lib/db";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";
import type { EnquiryChannel, PriceDisplayMode, StorefrontConfig } from "@/types/database";

export const revalidate = 120;

export default async function PublicCataloguePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ new_only?: string; price?: string; title?: string }>;
}) {
  if (!isConfigured.db && !isDevPreviewAllowed()) notFound();
  const { slug } = await params;
  const sp = await searchParams;

  const tRes = await query<{
    id: string;
    name: string;
    slug: string;
    status: string;
    storefront_config: StorefrontConfig | null;
    website_enabled: boolean;
    catalogue_enabled: boolean;
    enquiries_enabled: boolean;
  }>("SELECT * FROM public.resolve_public_catalogue($1)", [slug]);

  const tenant = tRes.rows[0];
  if (!tenant || tenant.status !== "active" || (!tenant.catalogue_enabled && !tenant.website_enabled)) {
    notFound();
  }

  const onlyNew = sp.new_only === "1";
  const rawPrice = sp.price || tenant.storefront_config?.catalogue_price_display || "retail";
  const priceMode: PriceDisplayMode =
    rawPrice === "wholesale" || rawPrice === "hide" ? rawPrice : "retail";
  const title = sp.title || `${tenant.name} — Product Catalogue`;

  const pRes = await query<{
    product_id: string;
    model_code: string;
    name: string;
    category: string | null;
    brand: string | null;
    description: string | null;
    is_new_arrival: boolean;
    primary_image_key: string | null;
    display_price: string | null;
  }>(
    "SELECT product_id, model_code, name, category, brand, description, is_new_arrival, primary_image_key, display_price FROM public.public_catalogue_products($1, $2, $3)",
    [tenant.id, onlyNew, priceMode]
  );

  const items: PublicCatalogueItem[] = pRes.rows.map((p) => ({
    product_id: p.product_id,
    model_code: p.model_code,
    name: p.name,
    category: p.category,
    brand: p.brand,
    description: p.description,
    is_new_arrival: p.is_new_arrival,
    thumb_url: p.primary_image_key ? getPublicAssetUrl(deriveThumbKey(p.primary_image_key)) : null,
    display_price: p.display_price != null ? Number(p.display_price) : null,
  }));

  const wa = tenant.storefront_config?.whatsapp_number ?? "";
  const enquiryChannel: EnquiryChannel =
    tenant.storefront_config?.enquiry_channel ?? (wa ? "both" : "inbox");

  const pdfParams = new URLSearchParams({
    new_only: onlyNew ? "1" : "0",
    price: priceMode,
    title,
    download: "1",
  });

  return (
    <PublicCatalogueClient
      slug={tenant.slug}
      tenantName={tenant.name}
      title={title}
      pdfUrl={`/api/public/catalogue/${encodeURIComponent(tenant.slug)}?${pdfParams.toString()}`}
      whatsappNumber={wa}
      enquiryChannel={enquiryChannel}
      enquiriesEnabled={tenant.enquiries_enabled}
      items={items}
    />
  );
}
