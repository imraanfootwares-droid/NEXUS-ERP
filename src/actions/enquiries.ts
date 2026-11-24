"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { assertAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { EnquiryChannel, StorefrontConfig } from "@/types/database";

const VALID_STATUSES = new Set(["new", "contacted", "closed"]);
const VALID_CHANNELS = new Set<EnquiryChannel>(["inbox", "whatsapp", "both"]);

export async function setTenantEnquiryStatusAction(
  enquiryId: string,
  status: "new" | "contacted" | "closed"
) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "enquiries.manage", { isMutation: true });

  if (!VALID_STATUSES.has(status)) {
    throw new Error("Invalid enquiry status.");
  }

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        "UPDATE public.tenant_enquiries SET status = $1 WHERE id = $2 AND tenant_id = $3",
        [status, enquiryId, ctx.tenant.id]
      );
    }
  );

  revalidatePath("/dashboard/enquiries");
}

export async function updateEnquirySettingsAction(input: {
  whatsappNumber: string;
  enquiryChannel: EnquiryChannel;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "enquiries.manage", { isMutation: true });

  if (!VALID_CHANNELS.has(input.enquiryChannel)) {
    throw new Error("Invalid enquiry delivery channel.");
  }

  const cleanedWa = input.whatsappNumber.replace(/[^\d+]/g, "").slice(0, 20);
  if ((input.enquiryChannel === "whatsapp" || input.enquiryChannel === "both") && cleanedWa.replace(/\D/g, "").length < 10) {
    throw new Error("Enter a valid WhatsApp number (with country code, e.g. 919876543210).");
  }

  const nextConfig: StorefrontConfig = {
    price_display: ctx.tenant.storefront_config?.price_display ?? "retail",
    hero_title: ctx.tenant.storefront_config?.hero_title ?? "New Arrivals",
    hero_subtitle: ctx.tenant.storefront_config?.hero_subtitle ?? "",
    catalogue_price_display: ctx.tenant.storefront_config?.catalogue_price_display ?? "retail",
    whatsapp_number: cleanedWa,
    enquiry_channel: input.enquiryChannel,
  };

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("UPDATE public.tenants SET storefront_config = $1 WHERE id = $2", [
        JSON.stringify(nextConfig),
        ctx.tenant.id,
      ]);
    }
  );

  revalidateTag(`sf:${ctx.tenant.id}`, "max");
  revalidatePath("/dashboard/enquiries");
  revalidatePath("/dashboard/storefront");
  revalidatePath(`/s/${ctx.tenant.slug}`);
  revalidatePath(`/s/${ctx.tenant.slug}/catalogue`);
}
