import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";
import { StorefrontHubClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function StorefrontManagePage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const webEnabled = ctx.enabledFeatures.public_website_cms && canAccess(ctx, "website.manage").allowed;
  const catEnabled = ctx.enabledFeatures.pdf_catalogue_export && canAccess(ctx, "catalogue.export").allowed;

  if (!webEnabled && !catEnabled) {
    return <TierLockOverlay featureKey="public_website_cms" />;
  }

  const products = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<{
        id: string;
        model_code: string;
        name: string;
        category: string | null;
        brand: string | null;
        is_published_web: boolean;
        is_new_arrival: boolean;
        primary_image_key: string | null;
        gallery_keys: string[];
        retail_price: string | null;
        wholesale_price: string | null;
        variant_count: number;
      }>(
        `SELECT p.id, p.model_code, p.name, p.category, p.brand,
                p.is_published_web, p.is_new_arrival, p.primary_image_key, p.gallery_keys,
                MIN(pv.selling_price)::text AS retail_price,
                MIN(pv.wholesale_price)::text AS wholesale_price,
                COUNT(pv.id)::int AS variant_count
         FROM public.products p
         LEFT JOIN public.product_variants pv ON pv.product_id = p.id AND pv.is_active = true
         WHERE p.tenant_id = $1 AND p.is_active = true
         GROUP BY p.id
         ORDER BY p.is_published_web DESC, p.is_new_arrival DESC, p.updated_at DESC`,
        [ctx.tenant!.id]
      );
      return res.rows.map((p) => ({
        id: p.id,
        model_code: p.model_code,
        name: p.name,
        category: p.category,
        brand: p.brand,
        is_published_web: p.is_published_web,
        is_new_arrival: p.is_new_arrival,
        retail_price: Number(p.retail_price || 0),
        wholesale_price: Number(p.wholesale_price || 0),
        variant_count: p.variant_count,
        gallery_urls: (p.gallery_keys ?? []).map((k) => ({
          key: k,
          thumbUrl: getPublicAssetUrl(deriveThumbKey(k)),
        })),
      }));
    }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1>Your Online Website &amp; PDF Catalogue</h1>
          <p className="mt-0.5 text-[12.5px] text-[#77777d]">
            Choose which products appear on your website, upload photos, and share your PDF catalogue link on WhatsApp.
          </p>
        </div>
        <Link
          href={`/s/${ctx.tenant.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg bg-[#171717] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#2a2a2a]"
        >
          Open Live Website <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>

      <StorefrontHubClient
        tenant={ctx.tenant}
        products={products}
        webEnabled={webEnabled}
        catEnabled={catEnabled}
      />
    </div>
  );
}
