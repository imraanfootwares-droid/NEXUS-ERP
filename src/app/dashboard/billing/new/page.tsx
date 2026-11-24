import { getBranchScope } from "@/lib/auth/active-branch";
import { PosTerminal, type PosVariantItem } from "@/components/billing/pos-terminal";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";
import type { CustomerRow, HsnCodeRow, RatioPreset, VariantAxisRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function PosNewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string }>;
}) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (!canAccess(ctx, "billing.create").allowed) {
    return <TierLockOverlay featureKey="gst_billing_pdf" />;
  }

  const { draft } = await searchParams;
  const stockEnabled = ctx.enabledFeatures.dynamic_stock_matrix;
  const crmEnabled = ctx.enabledFeatures.customer_crm;
  const discountsEnabled = ctx.enabledFeatures.discounts_returns_payments;

  const scope = await getBranchScope(ctx);
  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const defaultBranchId = scope.ordered[0]?.id;
      const [varsRes, custRes, hsnRes, axesRes] = await Promise.all([
        stockEnabled && defaultBranchId
          ? client.query<PosVariantItem & { primary_image_key: string | null }>(
              `SELECT pv.id AS variant_id, p.id AS product_id, p.name AS product_name, p.model_code,
                      p.primary_image_key,
                      pv.sku, pv.barcode, p.hsn_code, p.gst_rate, pv.attributes,
                      pv.selling_price, pv.wholesale_price, pv.mrp,
                      COALESCE(bs.quantity, 0) AS stock_qty
               FROM public.product_variants pv
               JOIN public.products p ON p.id = pv.product_id
               LEFT JOIN public.branch_stock bs ON bs.variant_id = pv.id AND bs.branch_id = $2
               WHERE pv.tenant_id = $1 AND pv.is_active = true AND p.is_active = true
               ORDER BY p.name, pv.sku
               LIMIT 250`,
              [ctx.tenant!.id, defaultBranchId]
            )
          : Promise.resolve({ rows: [] as Array<PosVariantItem & { primary_image_key: string | null }> }),
        crmEnabled
          ? client.query<CustomerRow>(
              "SELECT * FROM public.customers WHERE tenant_id = $1 AND is_active = true ORDER BY name LIMIT 200",
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [] as CustomerRow[] }),
        client.query<HsnCodeRow>(
          "SELECT * FROM public.hsn_codes WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY code",
          [ctx.tenant!.id]
        ),
        client.query<VariantAxisRow>(
          "SELECT * FROM public.variant_axis_definitions WHERE tenant_id = $1 ORDER BY sort_order",
          [ctx.tenant!.id]
        ),
      ]);

      let draftToEdit = null;
      if (draft) {
        const dInv = await client.query("SELECT * FROM public.invoices WHERE id = $1 AND tenant_id = $2 AND status = 'draft'", [
          draft,
          ctx.tenant!.id,
        ]);
        if (dInv.rows.length > 0) {
          const dItems = await client.query("SELECT * FROM public.invoice_items WHERE invoice_id = $1 AND tenant_id = $2", [
            draft,
            ctx.tenant!.id,
          ]);
          draftToEdit = {
            id: dInv.rows[0].id,
            branch_id: dInv.rows[0].branch_id,
            customer_id: dInv.rows[0].customer_id,
            customer_snapshot: dInv.rows[0].customer_snapshot ?? null,
            invoice_type: dInv.rows[0].invoice_type,
            tax_mode: dInv.rows[0].tax_mode,
            items: dItems.rows.map((it) => ({
              key: it.id,
              variant_id: it.variant_id,
              product_name: it.product_name,
              sku: it.sku,
              hsn_code: it.hsn_code,
              qty: Number(it.qty),
              unit_price: Number(it.unit_price),
              line_discount_amount: Number(it.discount_amount),
              fallback_gst_rate: Number(it.gst_rate),
            })),
          };
        }
      }

      const ratioPresets: RatioPreset[] = axesRes.rows.flatMap((a) => a.ratio_presets ?? []);
      const variants: PosVariantItem[] = varsRes.rows.map((v) => ({
        ...v,
        thumb_url: v.primary_image_key ? getPublicAssetUrl(deriveThumbKey(v.primary_image_key)) : null,
      }));
      return { variants, customers: custRes.rows, hsn: hsnRes.rows, ratioPresets, draftToEdit };
    }
  );

  return (
    <PosTerminal
      key={scope.activeId}
      tenant={ctx.tenant}
      userId={ctx.user.id}
      branches={scope.ordered}
      branchLocked={scope.activeId !== "all"}
      initialVariants={data.variants}
      initialCustomers={data.customers}
      initialHsn={data.hsn}
      ratioPresets={data.ratioPresets}
      stockEnabled={stockEnabled}
      crmEnabled={crmEnabled}
      discountsEnabled={discountsEnabled}
      canEditDraft={canAccess(ctx, "billing.edit").allowed}
      draftToEdit={data.draftToEdit}
    />
  );
}
