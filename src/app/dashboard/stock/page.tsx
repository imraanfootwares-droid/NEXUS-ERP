import { getBranchScope } from "@/lib/auth/active-branch";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { deriveThumbKey, getPublicAssetUrl } from "@/lib/storage/s3-client";
import type { CustomFieldRow, HsnCodeRow, VariantAxisRow } from "@/types/database";
import { StockHubClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function StockPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (!canAccess(ctx, "stock.view").allowed) {
    return <TierLockOverlay featureKey="dynamic_stock_matrix" />;
  }

  const scope = await getBranchScope(ctx);
  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [axes, fields, hsn, uoms, variants, ledger] = await Promise.all([
        client.query<VariantAxisRow>(
          "SELECT * FROM public.variant_axis_definitions WHERE tenant_id = $1 ORDER BY sort_order",
          [ctx.tenant!.id]
        ),
        client.query<CustomFieldRow>(
          "SELECT * FROM public.custom_field_definitions WHERE tenant_id = $1 ORDER BY sort_order",
          [ctx.tenant!.id]
        ),
        client.query<HsnCodeRow>(
          "SELECT * FROM public.hsn_codes WHERE tenant_id IS NULL OR tenant_id = $1 ORDER BY code",
          [ctx.tenant!.id]
        ),
        client.query<{ code: string }>(
          "SELECT code FROM public.uoms WHERE tenant_id = $1 ORDER BY code",
          [ctx.tenant!.id]
        ),
        client.query<{
          variant_id: string;
          product_id: string;
          model_code: string;
          product_name: string;
          category: string | null;
          brand: string | null;
          hsn_code: string | null;
          gst_rate: string;
          is_active: boolean;
          primary_image_key: string | null;
          uom: string;
          sku: string;
          barcode: string | null;
          attributes: Record<string, string>;
          cost_price: string;
          mrp: string;
          selling_price: string;
          wholesale_price: string;
          low_stock_threshold: string;
          branch_id: string | null;
          branch_name: string | null;
          quantity: string | null;
        }>(
          `SELECT pv.id AS variant_id, p.id AS product_id, p.model_code, p.name AS product_name,
                  p.category, p.brand, p.hsn_code, p.gst_rate::text, p.is_active,
                  p.primary_image_key, p.uom,
                  pv.sku, pv.barcode, pv.attributes, pv.cost_price::text, pv.mrp::text,
                  pv.selling_price::text, pv.wholesale_price::text,
                  pv.low_stock_threshold::text, b.id AS branch_id, b.name AS branch_name,
                  COALESCE(bs.quantity, 0)::text AS quantity
           FROM public.product_variants pv
           JOIN public.products p ON p.id = pv.product_id
           LEFT JOIN public.branch_stock bs ON bs.variant_id = pv.id AND bs.branch_id = ANY($2::uuid[])
           LEFT JOIN public.branches b ON b.id = bs.branch_id
           WHERE pv.tenant_id = $1
           ORDER BY p.is_active DESC, p.model_code, pv.sku
           LIMIT 500`,
          [ctx.tenant!.id, scope.ids]
        ),
        ctx.enabledFeatures.multi_branch_ledgers
          ? client.query<{
              id: string;
              branch_name: string;
              sku: string;
              change_qty: string;
              balance_after: string;
              reason: string;
              notes: string | null;
              created_at: string;
              actor_name: string | null;
              actor_login: string | null;
              actor_role: string | null;
            }>(
              `SELECT sl.id, b.name AS branch_name, pv.sku, sl.change_qty::text, sl.balance_after::text,
                      sl.reason, sl.notes, sl.created_at,
                      p.full_name AS actor_name, COALESCE(p.username, p.email) AS actor_login, p.role AS actor_role
               FROM public.stock_ledger sl
               JOIN public.branches b ON b.id = sl.branch_id
               JOIN public.product_variants pv ON pv.id = sl.variant_id
               LEFT JOIN public.profiles p ON p.id = sl.created_by
               WHERE sl.tenant_id = $1 AND sl.branch_id = ANY($2::uuid[])
               ORDER BY sl.created_at DESC
               LIMIT 100`,
              [ctx.tenant!.id, scope.ids]
            )
          : Promise.resolve({ rows: [] }),
      ]);
      return {
        axes: axes.rows,
        fields: fields.rows,
        hsn: hsn.rows,
        uoms: uoms.rows.map((u) => u.code),
        variants: variants.rows.map((v) => ({
          ...v,
          thumb_url: v.primary_image_key ? getPublicAssetUrl(deriveThumbKey(v.primary_image_key)) : null,
        })),
        ledger: ledger.rows,
      };
    }
  );

  return (
    <StockHubClient
      key={scope.activeId}
      initialBranch={scope.activeId === "all" ? "ALL" : scope.activeId}
      tenant={ctx.tenant}
      branches={scope.ordered}
      axes={data.axes}
      customFields={data.fields}
      hsnList={data.hsn}
      uoms={data.uoms}
      variants={data.variants}
      ledger={data.ledger}
      canManage={canAccess(ctx, "stock.manage").allowed}
      canAdjust={canAccess(ctx, "stock.record_incoming").allowed}
      canBulkImport={canAccess(ctx, "stock.bulk_import").allowed}
      ledgerEnabled={canAccess(ctx, "stock.view_ledger").allowed}
    />
  );
}
