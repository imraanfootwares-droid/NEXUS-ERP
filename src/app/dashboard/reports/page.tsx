import { getBranchScope } from "@/lib/auth/active-branch";
import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { ReportsAndDayEndClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  if (!canAccess(ctx, "reports.export_gst").allowed && !canAccess(ctx, "analytics.view_sales").allowed) {
    return <TierLockOverlay featureKey="data_exports_gst" />;
  }

  const scope = await getBranchScope(ctx);
  const data = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [expenses, closes] = await Promise.all([
        client.query<{ id: string; category: string; amount: string; mode: string; expense_date: string; note: string | null }>(
          "SELECT id, category, amount::text, mode, expense_date::text, note FROM public.expenses WHERE tenant_id = $1 ORDER BY expense_date DESC, created_at DESC LIMIT 50",
          [ctx.tenant!.id]
        ),
        client.query<{
          id: string;
          close_date: string;
          expected_cash: string;
          counted_cash: string;
          variance_cash: string;
          upi_total: string;
          card_total: string;
        }>(
          "SELECT id, close_date::text, expected_cash::text, counted_cash::text, variance_cash::text, upi_total::text, card_total::text FROM public.day_closes WHERE tenant_id = $1 ORDER BY close_date DESC LIMIT 30",
          [ctx.tenant!.id]
        ),
      ]);
      return { expenses: expenses.rows, closes: closes.rows };
    }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1>GST &amp; Reports</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Download GST files for your CA, record shop expenses, and close daily cash.
        </p>
      </div>
      <ReportsAndDayEndClient
        key={scope.activeId}
        branches={scope.ordered}
        expenses={data.expenses}
        dayCloses={data.closes}
        canExport={canAccess(ctx, "reports.export_gst").allowed}
        canCloseDay={canAccess(ctx, "billing.cancel").allowed}
      />
    </div>
  );
}
