import { NextResponse, type NextRequest } from "next/server";
import { query, withTenantTx } from "@/lib/db";
import { isConfigured } from "@/lib/env";
import { renderCataloguePdfBuffer } from "@/lib/pdf/documents";
import { fetchImageForPdf } from "@/lib/pdf/image-helper";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";
import type { BrandConfig, PriceDisplayMode, StorefrontConfig } from "@/types/database";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  if (!isConfigured.db) {
    return NextResponse.json({ error: "Catalogue unavailable." }, { status: 503 });
  }

  const { slug } = await context.params;
  const tRes = await query<{
    id: string;
    name: string;
    slug: string;
    status: string;
    storefront_config: StorefrontConfig | null;
    website_enabled: boolean;
    catalogue_enabled: boolean;
  }>("SELECT * FROM public.resolve_public_catalogue($1)", [slug]);

  const tenant = tRes.rows[0];
  if (!tenant || tenant.status !== "active" || (!tenant.catalogue_enabled && !tenant.website_enabled)) {
    return NextResponse.json({ error: "Catalogue not found." }, { status: 404 });
  }

  const cfg = tenant.storefront_config;
  const onlyNew = request.nextUrl.searchParams.get("new_only") === "1";
  const rawPrice = request.nextUrl.searchParams.get("price") || cfg?.catalogue_price_display || "retail";
  const priceMode: PriceDisplayMode =
    rawPrice === "wholesale" || rawPrice === "hide" ? rawPrice : "retail";
  const title = request.nextUrl.searchParams.get("title") || cfg?.hero_title || `${tenant.name} - Product Catalogue`;
  const download = request.nextUrl.searchParams.get("download") === "1";

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

  // Load tenant logo, carton info, and available sizes per product
  const extra = await withTenantTx(
    { tenantId: tenant.id, isPlatformAdmin: false },
    async (client) => {
      const [brandRes, metaRes] = await Promise.all([
        client.query<{ brand_config: BrandConfig | null }>(
          "SELECT brand_config FROM public.tenants WHERE id = $1",
          [tenant.id]
        ),
        client.query<{
          product_id: string;
          custom_fields: Record<string, unknown> | null;
          sizes: string[];
        }>(
          `SELECT p.id AS product_id,
                  p.custom_fields,
                  COALESCE(
                    ARRAY_AGG(DISTINCT NULLIF(TRIM(pv.attributes->>'size'), ''))
                      FILTER (WHERE NULLIF(TRIM(pv.attributes->>'size'), '') IS NOT NULL),
                    '{}'::text[]
                  ) AS sizes
           FROM public.products p
           LEFT JOIN public.product_variants pv ON pv.product_id = p.id AND pv.is_active = true
           WHERE p.tenant_id = $1 AND p.is_active = true
           GROUP BY p.id`,
          [tenant.id]
        ),
      ]);

      const metaMap = new Map<string, { sizes: string[]; pcsPerCarton: number | null }>();
      for (const row of metaRes.rows) {
        const rawCarton = Number(row.custom_fields?.pcs_per_carton ?? 0);
        metaMap.set(row.product_id, {
          sizes: Array.isArray(row.sizes) ? row.sizes : [],
          pcsPerCarton: Number.isFinite(rawCarton) && rawCarton > 0 ? rawCarton : null,
        });
      }
      return {
        brandConfig: brandRes.rows[0]?.brand_config ?? null,
        metaMap,
      };
    }
  );

  // Convert tenant logo & product images (WebP -> JPEG/PNG data URI) in parallel
  // so @react-pdf/renderer always embeds every photo cleanly.
  const logoRaw =
    extra.brandConfig?.logo_pdf_data_url ||
    (extra.brandConfig?.logo_key ? getPublicAssetUrl(extra.brandConfig.logo_key) : null);
  const [logoDataUri, productImages] = await Promise.all([
    fetchImageForPdf(logoRaw, { format: "png", maxDim: 160 }),
    Promise.all(
      pRes.rows.slice(0, 150).map(async (r) => {
        if (!r.primary_image_key) return null;
        const thumbUrl = getPublicAssetUrl(deriveThumbKey(r.primary_image_key));
        const converted = await fetchImageForPdf(thumbUrl, { format: "jpeg", maxDim: 420 });
        if (converted) return converted;
        const fullUrl = getPublicAssetUrl(r.primary_image_key);
        return fetchImageForPdf(fullUrl, { format: "jpeg", maxDim: 420 });
      })
    ),
  ]);

  const showSizes = cfg?.show_sizes ?? true;
  const showBrand = cfg?.show_brand ?? true;
  const showDescription = cfg?.show_description ?? true;
  const showCartonInfo = cfg?.show_carton_info ?? true;

  const origin = request.nextUrl.origin;
  const catalogueUrl = `${origin}/s/${tenant.slug}`;

  const pdf = await renderCataloguePdfBuffer({
    tenantName: tenant.name,
    logoUrl: logoDataUri,
    title: title.replace(/\u2014/g, "-"),
    subtitle: (cfg?.hero_subtitle || "").replace(/\u2014/g, "-"),
    whatsapp: cfg?.whatsapp_number || "",
    catalogueUrl,
    priceLabel: priceMode === "wholesale" ? "Wholesale" : priceMode === "hide" ? "Hide" : "Retail",
    items: pRes.rows.slice(0, 150).map((r, idx) => {
      const meta = extra.metaMap.get(r.product_id);
      const sizesList = showSizes && meta?.sizes?.length ? meta.sizes.slice(0, 8).join(", ") : undefined;
      return {
        name: r.name,
        modelCode: r.model_code,
        category: r.category,
        brand: showBrand ? r.brand : null,
        description: showDescription ? r.description : null,
        isNewArrival: r.is_new_arrival,
        pcsPerCarton: showCartonInfo ? meta?.pcsPerCarton ?? null : null,
        imageUrl: productImages[idx] ?? null,
        price: priceMode === "hide" || r.display_price == null ? null : Number(r.display_price),
        sizes: sizesList,
      };
    }),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${tenant.slug}-catalogue.pdf"`,
      "Cache-Control": "public, s-maxage=120, max-age=120, stale-while-revalidate=300",
    },
  });
}
