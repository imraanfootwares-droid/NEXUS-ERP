import { notFound } from "next/navigation";
import { StorefrontClient, type StorefrontProductItem } from "@/components/storefront/whatsapp-cart";
import { isDevPreviewAllowed } from "@/lib/dev/preview";
import { isConfigured } from "@/lib/env";
import { query } from "@/lib/db";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";

export const revalidate = 120;

export default async function PublicStorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isConfigured.db && !isDevPreviewAllowed()) notFound();
  const { slug } = await params;

  const tRes = slug === "_host"
    ? { rows: [] }
    : await query("SELECT * FROM public.resolve_public_catalogue($1)", [slug]);

  const tenant = tRes.rows[0];
  if (!tenant || tenant.status !== "active" || !tenant.website_enabled) {
    notFound();
  }

  const pRes = await query<{
    product_id: string;
    model_code: string;
    name: string;
    category: string | null;
    brand: string | null;
    uom: string;
    description: string | null;
    custom_fields: Record<string, unknown>;
    is_new_arrival: boolean;
    primary_image_key: string | null;
    gallery_keys: string[];
    variants: StorefrontProductItem["variants"];
  }>("SELECT * FROM public.storefront_products($1, false)", [tenant.id]);

  const items: StorefrontProductItem[] = pRes.rows.map((p) => {
    const imgKey = p.primary_image_key || p.gallery_keys?.[0] || null;
    return {
      product_id: p.product_id,
      model_code: p.model_code,
      name: p.name,
      category: p.category,
      brand: p.brand,
      uom: p.uom,
      description: p.description,
      custom_fields: p.custom_fields,
      is_new_arrival: p.is_new_arrival,
      thumb_url: imgKey ? getPublicAssetUrl(deriveThumbKey(imgKey)) : null,
      full_url: imgKey ? getPublicAssetUrl(imgKey) : null,
      variants: p.variants ?? [],
    };
  });

  const sfCfg = tenant.storefront_config ?? {};
  const logoUrl =
    tenant.brand_config?.logo_pdf_data_url ||
    (tenant.brand_config?.logo_key ? getPublicAssetUrl(tenant.brand_config.logo_key) : null);

  return (
    <StorefrontClient
      slug={tenant.slug}
      tenantName={tenant.name}
      logoUrl={logoUrl}
      whatsappNumber={sfCfg.whatsapp_number ?? ""}
      enquiryChannel={sfCfg.enquiry_channel ?? (sfCfg.whatsapp_number ? "both" : "inbox")}
      enquiriesEnabled={Boolean(tenant.enquiries_enabled)}
      catalogueEnabled={Boolean(tenant.catalogue_enabled)}
      heroTitle={sfCfg.hero_title ?? "New Arrivals"}
      heroSubtitle={sfCfg.hero_subtitle ?? ""}
      showSizes={sfCfg.show_sizes ?? true}
      showBrand={sfCfg.show_brand ?? true}
      showDescription={sfCfg.show_description ?? true}
      showCartonInfo={sfCfg.show_carton_info ?? true}
      products={items}
    />
  );
}
