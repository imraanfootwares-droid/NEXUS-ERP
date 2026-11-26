import { getBranchScope } from "@/lib/auth/active-branch";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import {
  loadPeriodProfitSummary,
  loadStockValuation,
} from "@/lib/analytics/stock-valuation";
import { withTenantTx } from "@/lib/db";
import { StockValuationPanel } from "@/components/analytics/stock-valuation-panel";

export const dynamic = "force-dynamic";

export default async function StockValuationPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const scope = await getBranchScope(ctx);
  const showCostAndProfit =
    ctx.user.role === "owner" ||
    ctx.user.role === "branch_admin" ||
    canAccess(ctx, "analytics.view_profit").allowed;

  const { report, periodProfit } = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [valuation, profit] = await Promise.all([
        loadStockValuation(client, ctx.tenant!.id, scope.ids),
        loadPeriodProfitSummary(client, ctx.tenant!.id, scope.ids),
      ]);
      return { report: valuation, periodProfit: profit };
    }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1>Stock Value &amp; Profit</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          See how much your stock is worth and how much profit you earned.
        </p>
      </div>
      <StockValuationPanel
        report={report}
        periodProfit={periodProfit}
        showCostAndProfit={showCostAndProfit}
      />
    </div>
  );
}
