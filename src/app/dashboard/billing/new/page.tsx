import { getBranchScope } from "@/lib/auth/active-branch";
import { PosTerminal, type PosVariantItem } from "@/components/billing/pos-terminal";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";
import type { BillTemplateRow, CustomerRow, HsnCodeRow, RatioPreset, VariantAxisRow } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function PosNewBillPage({
  searchParams,
}: {
  searchParams: Promise<{ draft?: string; edit?: string }>;
}) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (!canAccess(ctx, "billing.create").allowed) {
    return <TierLockOverlay featureKey="gst_billing_pdf" />;
  }

  const { draft, edit } = await searchParams;
  if (edit && !canAccess(ctx, "billing.history", { isMutation: true }).allowed) {
    return <TierLockOverlay featureKey="bill_edit_history" />;
  }
  const stockEnabled = ctx.enabledFeatures.dynamic_stock_matrix;
  const crmEnabled = ctx.enabledFeatures.customer_crm;
  const discountsEnabled = ctx.enabledFeatures.discounts_returns_payments;

  const scope = await getBranchScope(ctx);
  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const defaultBranchId = scope.ordered[0]?.id;
      const [varsRes, custRes, custCountRes, hsnRes, axesRes, tplRes] = await Promise.all([
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
              `SELECT id, tenant_id, name, phone, email, gstin, state_code, address, customer_type,
                      default_discount_pct, credit_limit, credit_days, current_due, credit_balance, is_active, updated_at
               FROM public.customers WHERE tenant_id = $1 AND is_active = true ORDER BY name LIMIT 100`,
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [] as CustomerRow[] }),
        crmEnabled
          ? client.query<{ cnt: string }>(
              "SELECT COUNT(*)::text AS cnt FROM public.customers WHERE tenant_id = $1 AND is_active = true",
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [{ cnt: "0" }] }),
        client.query<HsnCodeRow>(
          `SELECT id, tenant_id, code, description, category, rate_rule_type, threshold_amount,
                  rate_below_threshold, rate_above_threshold, default_gst_rate
           FROM public.hsn_codes WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY code`,
          [ctx.tenant!.id]
        ),
        client.query<VariantAxisRow>(
          "SELECT id, tenant_id, name, preset_values, ratio_presets, sort_order FROM public.variant_axis_definitions WHERE tenant_id = $1 ORDER BY sort_order",
          [ctx.tenant!.id]
        ),
        client.query<BillTemplateRow>(
          "SELECT id, tenant_id, name, format, is_default, config FROM public.bill_templates WHERE tenant_id = $1 ORDER BY is_default DESC, created_at ASC",
          [ctx.tenant!.id]
        ),
      ]);

      let draftToEdit = null;
      const targetInvoiceId = edit || draft;
      if (targetInvoiceId) {
        const isFinalizedEdit = Boolean(edit);
        const dInv = await client.query(
          isFinalizedEdit
            ? "SELECT * FROM public.invoices WHERE id = $1 AND tenant_id = $2 AND status <> 'cancelled' AND invoice_type <> 'return_credit_note'"
            : "SELECT * FROM public.invoices WHERE id = $1 AND tenant_id = $2 AND status = 'draft'",
          [targetInvoiceId, ctx.tenant!.id]
        );
        if (dInv.rows.length > 0) {
          const row = dInv.rows[0];
          const dItems = await client.query(
            "SELECT * FROM public.invoice_items WHERE invoice_id = $1 AND tenant_id = $2 ORDER BY id ASC",
            [targetInvoiceId, ctx.tenant!.id]
          );
          const dPays = await client.query<{ mode: string; amount: string }>(
            "SELECT mode, amount::text FROM public.invoice_payments WHERE invoice_id = $1 AND tenant_id = $2",
            [targetInvoiceId, ctx.tenant!.id]
          );
          draftToEdit = {
            id: row.id,
            invoice_number: row.invoice_number as string | null,
            is_finalized: row.status !== "draft",
            branch_id: row.branch_id,
            customer_id: row.customer_id,
            customer_snapshot: row.customer_snapshot ?? null,
            invoice_type: row.invoice_type,
            tax_mode: row.tax_mode,
            discount_type: (row.discount_type as "percent" | "flat" | null) ?? null,
            discount_value: Number(row.discount_value || 0),
            credit_redeemed: Number(row.credit_redeemed || 0),
            eway_bill_no: (row.eway_bill_no as string | null) ?? "",
            payments: dPays.rows.map((p) => ({ mode: p.mode, amount: Number(p.amount || 0) })),
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
              custom_gst: true,
            })),
          };
        }
      }

      const ratioPresets: RatioPreset[] = axesRes.rows.flatMap((a) => a.ratio_presets ?? []);
      const variants: PosVariantItem[] = varsRes.rows.map((v) => ({
        ...v,
        thumb_url: v.primary_image_key ? getPublicAssetUrl(deriveThumbKey(v.primary_image_key)) : null,
      }));
      return {
        variants,
        customers: custRes.rows,
        totalCustomerCount: Number(custCountRes.rows[0]?.cnt ?? custRes.rows.length),
        hsn: hsnRes.rows,
        ratioPresets,
        draftToEdit,
        billTemplates: tplRes.rows,
      };
    }
  );

  const logoUrl =
    ctx.tenant.brand_config?.logo_pdf_data_url ||
    (ctx.tenant.brand_config?.logo_key ? getPublicAssetUrl(ctx.tenant.brand_config.logo_key) : null);

  return (
    <PosTerminal
      key={scope.activeId}
      tenant={ctx.tenant}
      userId={ctx.user.id}
      branches={scope.ordered}
      branchLocked={scope.activeId !== "all"}
      initialVariants={data.variants}
      initialCustomers={data.customers}
      totalCustomerCount={data.totalCustomerCount}
      initialHsn={data.hsn}
      ratioPresets={data.ratioPresets}
      billTemplates={data.billTemplates}
      logoUrl={logoUrl}
      stockEnabled={stockEnabled}
      crmEnabled={crmEnabled}
      discountsEnabled={discountsEnabled}
      canEditDraft={canAccess(ctx, "billing.edit").allowed}
      draftToEdit={data.draftToEdit}
    />
  );
}
