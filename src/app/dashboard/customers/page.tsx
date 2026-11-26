import { redirect } from "next/navigation";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { CustomerRow } from "@/types/database";
import { CustomersClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const sp = await searchParams;
  if (sp.tab === "suppliers") {
    redirect("/dashboard/suppliers");
  }

  const customersEnabled = canAccess(ctx, "customers.view").allowed;
  if (!customersEnabled) {
    return <TierLockOverlay featureKey="customer_crm" />;
  }

  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const customersRes = await client.query<CustomerRow & { total_spent: string; oldest_due_days: number }>(
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
      );
      return { customers: customersRes.rows };
    }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1>Customers</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Track everyone who buys from you, pending dues, and customer payments.
        </p>
      </div>
      <CustomersClient
        customers={data.customers}
        suppliers={[]}
        catalogProducts={[]}
        customersEnabled={customersEnabled}
        suppliersEnabled={false}
        canManage={canAccess(ctx, "customers.manage").allowed}
        canManageSuppliers={false}
        initialTab="customers"
        mode="customers"
        tenantName={ctx.tenant.name}
      />
    </div>
  );
}
