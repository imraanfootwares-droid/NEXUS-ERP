import { notFound } from "next/navigation";
import { StorefrontClient, type StorefrontProductItem } from "@/components/storefront/whatsapp-cart";
import { isDevPreviewAllowed } from "@/lib/dev/preview";
import { isConfigured } from "@/lib/env";
import { query } from "@/lib/db";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";

export const revalidate = 300;

export default async function PublicStorefrontPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isConfigured.db && !isDevPreviewAllowed()) notFound();
  const { slug } = await params;

  const tRes = slug === "_host"
    ? { rows: [] }
    : slug.includes(".")
    ? await query("SELECT * FROM public.resolve_tenant_host($1)", [slug])
    : await query("SELECT * FROM public.resolve_tenant_slug($1)", [slug]);

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

  return (
    <StorefrontClient
      slug={tenant.slug}
      tenantName={tenant.name}
      whatsappNumber={tenant.storefront_config?.whatsapp_number ?? ""}
      heroTitle={tenant.storefront_config?.hero_title ?? "New Arrivals"}
      heroSubtitle={tenant.storefront_config?.hero_subtitle ?? ""}
      products={items}
    />
  );
}
