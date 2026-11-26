import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { isDevPreviewAllowed } from "@/lib/dev/preview";
import { isConfigured } from "@/lib/env";
import { query } from "@/lib/db";
import { getPublicAssetUrl } from "@/lib/storage/s3-client";

export const revalidate = 300;

export default async function PublicProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>;
}) {
  if (!isConfigured.db && !isDevPreviewAllowed()) notFound();
  const { slug, id } = await params;

  const tRes = slug.includes(".")
    ? await query("SELECT * FROM public.resolve_tenant_host($1)", [slug])
    : await query("SELECT * FROM public.resolve_tenant_slug($1)", [slug]);
  const tenant = tRes.rows[0];
  if (!tenant || tenant.status !== "active" || !tenant.website_enabled) notFound();

  const pRes = await query<{
    product_id: string;
    model_code: string;
    name: string;
    category: string | null;
    description: string | null;
    primary_image_key: string | null;
    gallery_keys: string[];
    variants: Array<{
      id: string;
      sku: string;
      attributes: Record<string, string>;
      display_price: number | null;
      in_stock: boolean;
    }>;
  }>("SELECT * FROM public.storefront_products($1, false) WHERE product_id = $2", [tenant.id, id]);

  const product = pRes.rows[0];
  if (!product) notFound();

  const mainUrl = product.primary_image_key
    ? getPublicAssetUrl(product.primary_image_key)
    : product.gallery_keys[0]
    ? getPublicAssetUrl(product.gallery_keys[0])
    : null;

  const waPhone = String(tenant.storefront_config?.whatsapp_number ?? "").replace(/\D/g, "");
  const waMsg = encodeURIComponent(
    `Hello ${tenant.name}, I want to enquire about ${product.name} (${product.model_code}).`
  );

  return (
    <div className="min-h-screen bg-slate-50 py-6 px-4">
      <div className="mx-auto max-w-4xl space-y-4">
        <Link href={`/s/${slug}`} className="text-xs font-semibold text-sky-600 hover:underline">
          ← Back to {tenant.name}
        </Link>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="aspect-square rounded-xl bg-slate-100 overflow-hidden flex items-center justify-center">
            {mainUrl ? (
              <img src={mainUrl} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-sm text-slate-400">{product.model_code}</span>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-xs font-bold uppercase text-sky-600">{product.category || product.model_code}</p>
              <h1 className="font-display text-2xl font-bold text-slate-900 mt-1">{product.name}</h1>
              {product.description && <p className="text-sm text-slate-600 mt-2">{product.description}</p>}
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-500">Available Variants</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {product.variants.map((v) => (
                  <div key={v.id} className="rounded-lg border border-slate-200 p-2.5 text-xs flex justify-between items-center">
                    <div>
                      <p className="font-semibold">{Object.values(v.attributes).join(" / ") || v.sku}</p>
                      {v.display_price != null && (
                        <p className="text-sky-700 font-bold">₹{Number(v.display_price).toLocaleString("en-IN")}</p>
                      )}
                    </div>
                    <Badge variant={v.in_stock ? "success" : "default"}>
                      {v.in_stock ? "In Stock" : "Enquire"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {waPhone && (
              <a
                href={`https://wa.me/${waPhone}?text=${waMsg}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white hover:bg-emerald-700"
              >
                <MessageCircle className="h-4 w-4" /> Enquire on WhatsApp
              </a>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
