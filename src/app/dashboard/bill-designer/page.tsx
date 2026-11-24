import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
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

  return (
    <div className="space-y-4">
      <div>
        <h1>
          Custom Bill Design &amp; Print Studio
        </h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Pick from ready-made A4, A5 &amp; Small Bill templates and preview your POS billing screen live.
        </p>
      </div>
      <BillDesignerClient
        tenant={ctx.tenant}
        templates={templates}
      />
    </div>
  );
}
