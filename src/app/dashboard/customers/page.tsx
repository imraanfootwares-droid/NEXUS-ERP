import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { CustomerRow } from "@/types/database";
import { CustomersClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (!canAccess(ctx, "customers.view").allowed) {
    return <TierLockOverlay featureKey="customer_crm" />;
  }

  const customers = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<CustomerRow & { total_spent: string; oldest_due_days: number }>(
        `SELECT c.*,
                COALESCE((SELECT SUM(i.grand_total) FROM public.invoices i WHERE i.customer_id = c.id AND i.status NOT IN ('draft','cancelled') AND i.invoice_type = 'sale'), 0)::text AS total_spent,
                COALESCE((SELECT EXTRACT(DAY FROM (now() - MIN(i.created_at)))::int FROM public.invoices i WHERE i.customer_id = c.id AND i.due_amount > 0 AND i.status NOT IN ('draft','cancelled')), 0) AS oldest_due_days
         FROM public.customers c
         WHERE c.tenant_id = $1 AND c.is_active = true
         ORDER BY c.current_due DESC, c.name ASC`,
        [ctx.tenant!.id]
      );
      return res.rows;
    }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Customer &amp; Wholesale Dealer CRM
        </h1>
        <p className="text-sm text-slate-600">
          Track retail &amp; B2B dealer profiles, aging dues, credit limits &amp; WhatsApp reminders.
        </p>
      </div>
      <CustomersClient
        customers={customers}
        canManage={canAccess(ctx, "customers.manage").allowed}
        tenantName={ctx.tenant.name}
      />
    </div>
  );
}
