import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { CustomerRow } from "@/types/database";
import { CustomersClient, type SupplierLedgerRow } from "./_client";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const customersEnabled = canAccess(ctx, "customers.view").allowed;
  const suppliersEnabled = canAccess(ctx, "suppliers.manage").allowed;

  if (!customersEnabled && !suppliersEnabled) {
    return <TierLockOverlay featureKey="customer_crm" />;
  }

  const sp = await searchParams;
  const initialTab =
    sp.tab === "suppliers" || (!customersEnabled && suppliersEnabled)
      ? "suppliers"
      : "customers";

  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [customersRes, suppliersRes, catalogProductsRes] = await Promise.all([
        customersEnabled
          ? client.query<CustomerRow & { total_spent: string; oldest_due_days: number }>(
              `WITH inv_stats AS (
                 SELECT customer_id,
                        COALESCE(SUM(grand_total) FILTER (WHERE invoice_type = 'sale'), 0) AS total_spent,
                        MIN(created_at) FILTER (WHERE due_amount > 0) AS oldest_due_at
                 FROM public.invoices
                 WHERE tenant_id = $1 AND customer_id IS NOT NULL AND status NOT IN ('draft','cancelled')
                 GROUP BY customer_id
               )
               SELECT c.id, c.tenant_id, c.name, c.phone, c.email, c.gstin, c.state_code, c.address,
                      c.customer_type, c.default_discount_pct, c.credit_limit, c.credit_days,
                      c.current_due, c.credit_balance, c.is_active, c.updated_at,
                      COALESCE(s.total_spent, 0)::text AS total_spent,
                      COALESCE(EXTRACT(DAY FROM (now() - s.oldest_due_at))::int, 0) AS oldest_due_days
               FROM public.customers c
               LEFT JOIN inv_stats s ON s.customer_id = c.id
               WHERE c.tenant_id = $1 AND c.is_active = true
               ORDER BY c.current_due DESC, c.name ASC
               LIMIT 500`,
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [] as Array<CustomerRow & { total_spent: string; oldest_due_days: number }> }),
        suppliersEnabled
          ? client.query<SupplierLedgerRow>(
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
            )
          : Promise.resolve({ rows: [] as SupplierLedgerRow[] }),
        suppliersEnabled
          ? client.query<{ name: string; model_code: string }>(
              `SELECT name, model_code
               FROM public.products
               WHERE tenant_id = $1 AND is_active = true
               ORDER BY name ASC
               LIMIT 200`,
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [] as Array<{ name: string; model_code: string }> }),
      ]);
      return {
        customers: customersRes.rows,
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
        <h1>Customers &amp; Suppliers</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          See who owes you money and who you need to pay.
        </p>
      </div>
      <CustomersClient
        customers={data.customers}
        suppliers={data.suppliers}
        catalogProducts={data.catalogProducts}
        customersEnabled={customersEnabled}
        suppliersEnabled={suppliersEnabled}
        canManage={canAccess(ctx, "customers.manage").allowed}
        canManageSuppliers={canAccess(ctx, "suppliers.manage", { isMutation: true }).allowed}
        initialTab={initialTab}
        tenantName={ctx.tenant.name}
      />
    </div>
  );
}
