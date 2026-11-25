import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { getPublicAssetUrl } from "@/lib/storage/s3-client";
import type { BillTemplateRow } from "@/types/database";
import { BillDesignerClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function BillDesignerPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (!canAccess(ctx, "bill_designer.manage").allowed) {
    return <TierLockOverlay featureKey="bill_designer" />;
  }

  const templates = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<BillTemplateRow>(
        "SELECT * FROM public.bill_templates WHERE tenant_id = $1 ORDER BY is_default DESC, created_at ASC",
        [ctx.tenant!.id]
      );
      return res.rows;
    }
  );

  const defaultBranch = ctx.branches.find((b) => b.is_default) ?? ctx.branches[0] ?? null;
  const logoUrl =
    ctx.tenant.brand_config?.logo_pdf_data_url ||
    (ctx.tenant.brand_config?.logo_key ? getPublicAssetUrl(ctx.tenant.brand_config.logo_key) : null);

  return (
    <div className="space-y-4">
      <div>
        <h1>Bill Designs</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Choose from 5 Normal Bill designs and 5 GST Bill designs. Your shop address, GST number &amp; bank details come automatically from My Profile.
        </p>
      </div>
      <BillDesignerClient
        tenant={ctx.tenant}
        defaultBranch={defaultBranch}
        logoUrl={logoUrl}
        templates={templates}
      />
    </div>
  );
}
