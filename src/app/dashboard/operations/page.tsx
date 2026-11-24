import { getBranchScope } from "@/lib/auth/active-branch";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { RatioPreset, VariantAxisRow } from "@/types/database";
import { OperationsHubClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const prodEnabled = ctx.enabledFeatures.supplier_and_production;
  const transferEnabled = ctx.enabledFeatures.stock_transfers;
  if (!prodEnabled && !transferEnabled) {
    return <TierLockOverlay featureKey="stock_transfers" />;
  }

  const scope = await getBranchScope(ctx);
  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [variants, suppliers, batches, transfers, axes] = await Promise.all([
        client.query<{
          id: string;
          sku: string;
          model_code: string;
          product_name: string;
          attributes: Record<string, string>;
          avg_cost: string;
          gst_rate: string;
        }>(
          `SELECT pv.id, pv.sku, p.model_code, p.name AS product_name, pv.attributes, pv.avg_cost::text, p.gst_rate::text
           FROM public.product_variants pv
           JOIN public.products p ON p.id = pv.product_id
           WHERE pv.tenant_id = $1 AND pv.is_active = true
           ORDER BY p.name, pv.sku LIMIT 250`,
          [ctx.tenant!.id]
        ),
        client.query<{ id: string; name: string; phone: string | null; material_type: string | null; current_due: string }>(
          "SELECT id, name, phone, material_type, current_due::text FROM public.suppliers WHERE tenant_id = $1 ORDER BY name",
          [ctx.tenant!.id]
        ),
        client.query<{ id: string; batch_number: string; stage: string; karigar_unit_name: string | null; total_units: string; is_stocked: boolean; created_at: string }>(
          "SELECT id, batch_number, stage, karigar_unit_name, total_units::text, is_stocked, created_at FROM public.production_batches WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 30",
          [ctx.tenant!.id]
        ),
        client.query<{
          id: string;
          doc_type: string;
          doc_number: string;
          from_name: string;
          to_name: string;
          status: string;
          transfer_value: string;
          igst_amount: string;
          created_at: string;
        }>(
          `SELECT st.id, st.doc_type, st.doc_number, fb.name AS from_name, tb.name AS to_name,
                  st.status, st.transfer_value::text, st.igst_amount::text, st.created_at
           FROM public.stock_transfers st
           JOIN public.branches fb ON fb.id = st.from_branch_id
           JOIN public.branches tb ON tb.id = st.to_branch_id
           WHERE st.tenant_id = $1
           ORDER BY st.created_at DESC LIMIT 50`,
          [ctx.tenant!.id]
        ),
        client.query<VariantAxisRow>(
          "SELECT * FROM public.variant_axis_definitions WHERE tenant_id = $1 ORDER BY sort_order",
          [ctx.tenant!.id]
        ),
      ]);
      const ratioPresets: RatioPreset[] = axes.rows.flatMap((a) => a.ratio_presets ?? []);
      return {
        variants: variants.rows,
        suppliers: suppliers.rows,
        batches: batches.rows,
        transfers: transfers.rows,
        ratioPresets,
      };
    }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1>Send Stock Between Branches</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Pick products in cartons or pairs, add transport / LR / vehicle details, and send stock to another branch.
        </p>
      </div>
      <OperationsHubClient
        key={scope.activeId}
        branches={[...scope.ordered, ...ctx.branches.filter((b) => !scope.allowed.some((a) => a.id === b.id))]}
        variants={data.variants}
        suppliers={data.suppliers}
        batches={data.batches}
        transfers={data.transfers}
        ratioPresets={data.ratioPresets}
        prodEnabled={prodEnabled && canAccess(ctx, "production.record").allowed}
        suppliersEnabled={prodEnabled && canAccess(ctx, "suppliers.manage").allowed}
        transfersEnabled={transferEnabled}
        canDispatch={canAccess(ctx, "transfers.dispatch").allowed}
        canReceive={canAccess(ctx, "transfers.receive").allowed}
      />
    </div>
  );
}
