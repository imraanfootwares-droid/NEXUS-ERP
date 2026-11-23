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

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Bulk Stock &amp; Price Import</h1>
        <p className="text-sm text-slate-600">
          Download your dynamic Excel template, validate rows client-side &amp; commit atomically in 500-row chunks.
        </p>
      </div>
      <StockImportClient
        branches={ctx.branches}
        axisNames={schema.axes.map((a) => a.name)}
        customFieldKeys={schema.fields.map((f) => f.field_key)}
      />
    </div>
  );
}
