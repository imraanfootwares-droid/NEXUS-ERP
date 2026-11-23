"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { assertAccess, canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { isDevPreviewAllowed } from "@/lib/dev/preview";
import { withTenantTx } from "@/lib/db";
import { isConfigured } from "@/lib/env";
import { deleteObject, deriveThumbKey, headObject } from "@/lib/storage/s3-client";
import type { StorefrontConfig } from "@/types/database";

export async function updateStorefrontConfigAction(config: StorefrontConfig) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "website.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("UPDATE public.tenants SET storefront_config = $1 WHERE id = $2", [
        JSON.stringify(config),
        ctx.tenant.id,
      ]);
    }
  );

  revalidateTag(`sf:${ctx.tenant.id}`, "max");
  revalidatePath("/dashboard/storefront");
}

export async function toggleProductWebFlagsAction(
  productId: string,
  flags: { is_published_web?: boolean; is_new_arrival?: boolean }
) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "website.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `UPDATE public.products
         SET is_published_web = COALESCE($1, is_published_web),
             is_new_arrival = COALESCE($2, is_new_arrival)
         WHERE id = $3 AND tenant_id = $4`,
        [flags.is_published_web ?? null, flags.is_new_arrival ?? null, productId, ctx.tenant.id]
      );
    }
  );

  revalidateTag(`sf:${ctx.tenant.id}`, "max");
  revalidatePath("/dashboard/storefront");
}

export async function confirmProductImageAction(
  productId: string,
  fullKey: string,
  replacePrimary = true
) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) throw new Error("Unauthorized");
  if (
    !canAccess(ctx, "website.manage", { isMutation: true }).allowed &&
    !canAccess(ctx, "stock.manage", { isMutation: true }).allowed
  ) {
    assertAccess(ctx, "stock.manage", { isMutation: true });
  }

  const isDevDataUrl = fullKey.startsWith("data:") && isDevPreviewAllowed() && !isConfigured.storage;
  const thumbKey = deriveThumbKey(fullKey);
  let addedBytes = 0;

  if (!isDevDataUrl) {
    const [fullHead, thumbHead] = await Promise.all([
      headObject("public", fullKey),
      headObject("public", thumbKey),
    ]);
    addedBytes = (fullHead.exists ? fullHead.contentLength : 0) + (thumbHead.exists ? thumbHead.contentLength : 0);
  } else {
    addedBytes = Math.round(fullKey.length * 0.75);
  }

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `UPDATE public.products
         SET primary_image_key = ${replacePrimary ? "$1" : "COALESCE(primary_image_key, $1)"},
             gallery_keys = array_append(gallery_keys, $1)
         WHERE id = $2 AND tenant_id = $3`,
        [fullKey, productId, ctx.tenant!.id]
      );

      await client.query(
        `UPDATE public.tenants
         SET storage_used_bytes = storage_used_bytes + $1
         WHERE id = $2`,
        [addedBytes, ctx.tenant!.id]
      );

      await client.query(
        "DELETE FROM public.pending_uploads WHERE key = ANY($1::text[]) AND tenant_id = $2",
        [[fullKey, thumbKey], ctx.tenant!.id]
      );
    }
  );

  revalidateTag(`sf:${ctx.tenant.id}`, "max");
  revalidatePath("/dashboard/storefront");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard/billing/new");
}

export async function removeProductImageAction(productId: string, fullKey: string) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) throw new Error("Unauthorized");
  if (
    !canAccess(ctx, "website.manage", { isMutation: true }).allowed &&
    !canAccess(ctx, "stock.manage", { isMutation: true }).allowed
  ) {
    assertAccess(ctx, "stock.manage", { isMutation: true });
  }

  const isDevDataUrl = fullKey.startsWith("data:");
  const thumbKey = deriveThumbKey(fullKey);
  let removedBytes = 0;

  if (!isDevDataUrl && isConfigured.storage) {
    const [fullHead, thumbHead] = await Promise.all([
      headObject("public", fullKey).catch(() => ({ exists: false, contentLength: 0 })),
      headObject("public", thumbKey).catch(() => ({ exists: false, contentLength: 0 })),
    ]);
    removedBytes = fullHead.contentLength + thumbHead.contentLength;

    await Promise.all([
      deleteObject("public", fullKey).catch(() => undefined),
      deleteObject("public", thumbKey).catch(() => undefined),
    ]);
  }

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `UPDATE public.products
         SET gallery_keys = array_remove(gallery_keys, $1),
             primary_image_key = CASE WHEN primary_image_key = $1 THEN NULL ELSE primary_image_key END
         WHERE id = $2 AND tenant_id = $3`,
        [fullKey, productId, ctx.tenant!.id]
      );
      await client.query(
        "UPDATE public.tenants SET storage_used_bytes = GREATEST(0, storage_used_bytes - $1) WHERE id = $2",
        [removedBytes, ctx.tenant!.id]
      );
    }
  );

  revalidateTag(`sf:${ctx.tenant.id}`, "max");
  revalidatePath("/dashboard/storefront");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard/billing/new");
}

/** Standalone Quick Catalogue Item creator (supports Tier 1 + Tier 4 override without Stock module). */
export async function createQuickCatalogueItemAction(input: {
  modelCode: string;
  name: string;
  category?: string;
  retailPrice: number;
  wholesalePrice: number;
  description?: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "website.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const pRes = await client.query<{ id: string }>(
        `INSERT INTO public.products (tenant_id, model_code, name, category, description, is_published_web, is_new_arrival)
         VALUES ($1, $2, $3, $4, $5, true, true) RETURNING id`,
        [ctx.tenant.id, input.modelCode.trim().toUpperCase(), input.name.trim(), input.category || null, input.description || null]
      );
      await client.query(
        `INSERT INTO public.product_variants (tenant_id, product_id, sku, mrp, selling_price, wholesale_price)
         VALUES ($1, $2, $3, $4, $4, $5)`,
        [ctx.tenant.id, pRes.rows[0].id, input.modelCode.trim().toUpperCase(), input.retailPrice, input.wholesalePrice]
      );
    }
  );

  revalidateTag(`sf:${ctx.tenant.id}`, "max");
  revalidatePath("/dashboard/storefront");
}
