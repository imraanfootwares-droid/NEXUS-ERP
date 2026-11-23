import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertAccess, canAccess } from "@/lib/auth/access";
import { isSameOriginRequest } from "@/lib/auth/crypto";
import { getServerSessionContext } from "@/lib/auth/session";
import { isDevPreviewAllowed } from "@/lib/dev/preview";
import { isConfigured } from "@/lib/env";
import { withTenantTx } from "@/lib/db";
import { getPresignedUploadUrl } from "@/lib/storage/s3-client";

export const runtime = "nodejs";

const presignSchema = z.object({
  purpose: z.enum(["product_full", "product_thumb", "brand_logo"]),
  hash: z.string().min(4).max(32),
  contentLength: z.number().int().positive(),
  contentType: z.enum(["image/webp", "image/png", "image/jpeg"]),
});

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }

  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = presignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid upload parameters." }, { status: 400 });
  }

  const { purpose, hash, contentLength, contentType } = parsed.data;

  try {
    if (purpose === "brand_logo") {
      assertAccess(ctx, "settings.tax_and_hsn", { isMutation: true });
      if (contentLength > 200 * 1024) {
        return NextResponse.json({ error: "Logo must be <= 200 KB." }, { status: 400 });
      }
    } else {
      const canStock = canAccess(ctx, "stock.manage", { isMutation: true }).allowed;
      const canWeb = canAccess(ctx, "website.manage", { isMutation: true }).allowed;
      if (!canStock && !canWeb) {
        assertAccess(ctx, "stock.manage", { isMutation: true });
      }
      if (contentLength > 500 * 1024) {
        return NextResponse.json({ error: "Product image must be <= 500 KB." }, { status: 400 });
      }
    }
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Forbidden" }, { status: 403 });
  }

  if (!isConfigured.storage) {
    if (isDevPreviewAllowed()) {
      return NextResponse.json({ devFallback: true, key: "dev-local" });
    }
    return NextResponse.json({ error: "Cloudflare R2 storage is not configured." }, { status: 503 });
  }

  const maxBytes = ctx.tenant.max_storage_mb * 1024 * 1024;
  if (ctx.tenant.storage_used_bytes + contentLength > maxBytes) {
    return NextResponse.json(
      { error: `Storage quota exceeded (${ctx.tenant.max_storage_mb} MB).` },
      { status: 403 }
    );
  }

  const key =
    purpose === "brand_logo"
      ? `public/${ctx.tenant.id}/branding/logo-${hash}.webp`
      : purpose === "product_thumb"
      ? `public/${ctx.tenant.id}/products/${hash}_thumb.webp`
      : `public/${ctx.tenant.id}/products/${hash}.webp`;

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `INSERT INTO public.pending_uploads (tenant_id, bucket, key, expected_bytes)
         VALUES ($1, 'public', $2, $3)
         ON CONFLICT (key) DO UPDATE SET expected_bytes = EXCLUDED.expected_bytes, created_at = now()`,
        [ctx.tenant!.id, key, contentLength]
      );
    }
  );

  const uploadUrl = await getPresignedUploadUrl({
    kind: "public",
    key,
    contentType,
    contentLength,
  });

  return NextResponse.json({ uploadUrl, key });
}
