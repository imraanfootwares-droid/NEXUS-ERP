import { getBranchScope } from "@/lib/auth/active-branch";
import Link from "next/link";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { BillingLedgerClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function BillingLedgerPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (!canAccess(ctx, "billing.view").allowed) {
    return <TierLockOverlay featureKey="gst_billing_pdf" />;
  }

  const scope = await getBranchScope(ctx);
  const invoices = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<{
        id: string;
        invoice_number: string | null;
        invoice_type: string;
        branch_name: string;
        customer_name: string;
        grand_total: string;
        paid_amount: string;
        due_amount: string;
        status: string;
        has_oversold: boolean;
        created_at: string;
        creator_name: string | null;
        creator_login: string | null;
        creator_role: string | null;
      }>(
        `SELECT i.id, i.invoice_number, i.invoice_type, b.name AS branch_name,
                COALESCE(i.customer_snapshot->>'name', 'Walk-In') AS customer_name,
                i.grand_total::text, i.paid_amount::text, i.due_amount::text,
                i.status, i.has_oversold, i.created_at,
                p.full_name AS creator_name,
                COALESCE(p.username, p.email) AS creator_login,
                p.role AS creator_role
         FROM public.invoices i
         JOIN public.branches b ON b.id = i.branch_id
         LEFT JOIN public.profiles p ON p.id = i.created_by
         WHERE i.tenant_id = $1 AND i.branch_id = ANY($2::uuid[])
         ORDER BY i.created_at DESC
         LIMIT 200`,
        [ctx.tenant!.id, scope.ids]
      );
      return res.rows;
    }
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1>All Bills</h1>
          <p className="mt-0.5 text-[12.5px] text-[#77777d]">
            View, edit, print, return, or check edit history &amp; revert any bill.
          </p>
        </div>
        {canAccess(ctx, "billing.create").allowed && (
          <Link
            href="/dashboard/billing/new"
            className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700"
          >
            + New Bill
          </Link>
        )}
      </div>

      <BillingLedgerClient
        invoices={invoices}
        canEdit={canAccess(ctx, "billing.edit").allowed}
        canCancel={canAccess(ctx, "billing.cancel").allowed}
        canReturn={canAccess(ctx, "billing.process_return").allowed}
        canUseHistory={canAccess(ctx, "billing.history").allowed}
      />
    </div>
  );
}
