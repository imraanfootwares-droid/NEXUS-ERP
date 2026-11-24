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
              `SELECT c.*,
                      COALESCE((SELECT SUM(i.grand_total) FROM public.invoices i WHERE i.customer_id = c.id AND i.status NOT IN ('draft','cancelled') AND i.invoice_type = 'sale'), 0)::text AS total_spent,
                      COALESCE((SELECT EXTRACT(DAY FROM (now() - MIN(i.created_at)))::int FROM public.invoices i WHERE i.customer_id = c.id AND i.due_amount > 0 AND i.status NOT IN ('draft','cancelled')), 0) AS oldest_due_days
               FROM public.customers c
               WHERE c.tenant_id = $1 AND c.is_active = true
               ORDER BY c.current_due DESC, c.name ASC`,
              [ctx.tenant!.id]
            )
          : Promise.resolve({ rows: [] as Array<CustomerRow & { total_spent: string; oldest_due_days: number }> }),
        suppliersEnabled
          ? client.query<SupplierLedgerRow>(
              `SELECT s.id, s.name, s.phone, s.gstin, s.state_code, s.address, s.material_type,
                      COALESCE(s.supplied_products, '{}'::text[]) AS supplied_products,
                      COALESCE((SELECT array_agg(p.name || ' (' || p.model_code || ')' ORDER BY p.name)
                                FROM public.products p
                                WHERE p.supplier_id = s.id AND p.tenant_id = s.tenant_id AND p.is_active = true), '{}'::text[]) AS linked_products,
                      s.current_due::text,
                      COALESCE((SELECT SUM(po.total_amount) FROM public.purchase_orders po WHERE po.supplier_id = s.id AND po.tenant_id = s.tenant_id), 0)::text AS total_purchased,
                      COALESCE((SELECT COUNT(*)::int FROM public.purchase_orders po WHERE po.supplier_id = s.id AND po.tenant_id = s.tenant_id), 0) AS bill_count
               FROM public.suppliers s
               WHERE s.tenant_id = $1
               ORDER BY s.current_due DESC, s.name ASC`,
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
        <h1>Customer &amp; Supplier Ledgers</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Track retail &amp; wholesale customer dues alongside raw-material &amp; vendor payables in separate tabs.
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
