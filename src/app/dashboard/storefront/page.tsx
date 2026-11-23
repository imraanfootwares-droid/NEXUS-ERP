import Link from "next/link";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess, isFeatureEnabled } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";
import { StorefrontHubClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function StorefrontManagePage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const webEnabled = isFeatureEnabled(ctx.tenant, "public_website_cms") && canAccess(ctx, "website.manage").allowed;
  const catEnabled = isFeatureEnabled(ctx.tenant, "pdf_catalogue_export") && canAccess(ctx, "catalogue.export").allowed;

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
        is_published_web: boolean;
        is_new_arrival: boolean;
        primary_image_key: string | null;
        gallery_keys: string[];
      }>(
        `SELECT id, model_code, name, category, is_published_web, is_new_arrival, primary_image_key, gallery_keys
         FROM public.products
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY is_new_arrival DESC, updated_at DESC`,
        [ctx.tenant!.id]
      );
      return res.rows.map((p) => ({
        ...p,
        gallery_urls: p.gallery_keys.map((k) => ({
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
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Live Website &amp; 1-Click PDF Catalogue
          </h1>
          <p className="text-sm text-slate-600">
            Upload WebP shoe photos to Cloudflare R2, curate New Arrivals &amp; export WhatsApp PDF catalogues.
          </p>
        </div>
        <Link
          href={`/s/${ctx.tenant.slug}`}
          target="_blank"
          className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
        >
          Open Live Website →
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
