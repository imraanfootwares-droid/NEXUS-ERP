import { getBranchScope } from "@/lib/auth/active-branch";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { CustomFieldRow, VariantAxisRow } from "@/types/database";
import { StockImportClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function StockImportPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (!canAccess(ctx, "stock.bulk_import").allowed) {
    return <TierLockOverlay featureKey="bulk_excel_import" />;
  }

  const schema = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [axes, fields] = await Promise.all([
        client.query<VariantAxisRow>(
          "SELECT * FROM public.variant_axis_definitions WHERE tenant_id = $1 ORDER BY sort_order",
          [ctx.tenant!.id]
        ),
        client.query<CustomFieldRow>(
          "SELECT * FROM public.custom_field_definitions WHERE tenant_id = $1 ORDER BY sort_order",
          [ctx.tenant!.id]
        ),
      ]);
      return { axes: axes.rows, fields: fields.rows };
    }
  );

  const scope = await getBranchScope(ctx);
  return (
    <div className="space-y-4">
      <div>
        <h1>Upload Products from Excel</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Download the Excel template, fill in your products and stock, and upload it in one step.
        </p>
      </div>
      <StockImportClient
        branches={scope.ordered}
        axisNames={schema.axes.map((a) => a.name)}
        customFieldKeys={schema.fields.map((f) => f.field_key)}
      />
    </div>
  );
}
