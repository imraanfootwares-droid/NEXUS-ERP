import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { CustomersClient, type SupplierLedgerRow } from "@/app/dashboard/customers/_client";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const suppliersEnabled = canAccess(ctx, "suppliers.manage").allowed;
  if (!suppliersEnabled) {
    return <TierLockOverlay featureKey="supplier_and_production" />;
  }

  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [suppliersRes, catalogProductsRes] = await Promise.all([
        client.query<SupplierLedgerRow>(
          `WITH po_stats AS (
             SELECT supplier_id,
                    COALESCE(SUM(total_amount), 0) AS total_purchased,
                    COUNT(*)::int AS bill_count
             FROM public.purchase_orders
             WHERE tenant_id = $1
             GROUP BY supplier_id
           ),
           prod_links AS (
             SELECT supplier_id,
                    array_agg(name || ' (' || model_code || ')' ORDER BY name) AS linked_products
             FROM public.products
             WHERE tenant_id = $1 AND supplier_id IS NOT NULL AND is_active = true
             GROUP BY supplier_id
           )
           SELECT s.id, s.name, s.phone, s.gstin, s.state_code, s.address, s.material_type,
                  COALESCE(s.supplied_products, '{}'::text[]) AS supplied_products,
                  COALESCE(pl.linked_products, '{}'::text[]) AS linked_products,
                  s.current_due::text,
                  COALESCE(ps.total_purchased, 0)::text AS total_purchased,
                  COALESCE(ps.bill_count, 0) AS bill_count
           FROM public.suppliers s
           LEFT JOIN po_stats ps ON ps.supplier_id = s.id
           LEFT JOIN prod_links pl ON pl.supplier_id = s.id
           WHERE s.tenant_id = $1
           ORDER BY s.current_due DESC, s.name ASC
           LIMIT 500`,
          [ctx.tenant!.id]
        ),
        client.query<{ name: string; model_code: string }>(
          `SELECT name, model_code
           FROM public.products
           WHERE tenant_id = $1 AND is_active = true
           ORDER BY name ASC
           LIMIT 200`,
          [ctx.tenant!.id]
        ),
      ]);

      return {
        suppliers: suppliersRes.rows,
        catalogProducts: catalogProductsRes.rows.map((p) =>
          p.model_code ? `${p.name} (${p.model_code})` : p.name
        ),
      };
    }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1>Suppliers</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Track companies you buy from, enter purchase bills, and record supplier payments.
        </p>
      </div>
      <CustomersClient
        customers={[]}
        suppliers={data.suppliers}
        catalogProducts={data.catalogProducts}
        customersEnabled={false}
        suppliersEnabled={suppliersEnabled}
        canManage={false}
        canManageSuppliers={canAccess(ctx, "suppliers.manage", { isMutation: true }).allowed}
        initialTab="suppliers"
        mode="suppliers"
        tenantName={ctx.tenant.name}
      />
    </div>
  );
}
