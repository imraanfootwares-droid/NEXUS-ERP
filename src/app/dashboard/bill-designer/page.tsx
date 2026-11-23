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
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Custom Bill Design &amp; Print Studio
        </h1>
        <p className="text-sm text-slate-600">
          Customize A4 / Thermal 80mm / 58mm print layouts and your POS billing screen layout.
        </p>
      </div>
      <BillDesignerClient
        tenant={ctx.tenant}
        templates={templates}
      />
    </div>
  );
}
