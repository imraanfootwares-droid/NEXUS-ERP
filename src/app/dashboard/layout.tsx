import React from "react";
import { redirect } from "next/navigation";
import { AccessBlockedScreen } from "@/components/access/access-blocked-screen";
import { ErpShell } from "@/components/erp/erp-shell";
import { getBranchScope } from "@/lib/auth/active-branch";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getServerSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.tenant) redirect("/platform");
  if (ctx.tenant.status === "suspended" && !ctx.impersonation) {
    redirect("/suspended");
  }

  if (ctx.accessBlock) {
    return <AccessBlockedScreen block={ctx.accessBlock} tenantId={ctx.tenant.id} userId={ctx.user.id} />;
  }

  const scope = await getBranchScope(ctx);
  let lowStockCount = 0;
  let newEnquiryCount = 0;
  if (ctx.enabledFeatures.auto_stock_and_alerts) {
    lowStockCount = await withTenantTx(
      { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
      async (client) => {
        const res = await client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM public.branch_stock bs
           JOIN public.product_variants pv ON pv.id = bs.variant_id
           WHERE bs.tenant_id = $1 AND bs.branch_id = ANY($2::uuid[]) AND bs.quantity <= pv.low_stock_threshold AND pv.is_active = true`,
          [ctx.tenant!.id, scope.ids]
        );
        return Number(res.rows[0]?.cnt ?? 0);
      }
    );
  }
  if (ctx.enabledFeatures.customer_enquiries) {
    try {
      newEnquiryCount = await withTenantTx(
        { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
        async (client) => {
          const res = await client.query<{ cnt: string }>(
            `SELECT COUNT(*)::text AS cnt
             FROM public.tenant_enquiries
             WHERE tenant_id = $1 AND status = 'new'`,
            [ctx.tenant!.id]
          );
          return Number(res.rows[0]?.cnt ?? 0);
        }
      );
    } catch {
      newEnquiryCount = 0;
    }
  }

  return (
    <ErpShell
      ctx={ctx}
      lowStockCount={lowStockCount}
      newEnquiryCount={newEnquiryCount}
      branchOptions={scope.allowed}
      initialBranchId={scope.activeId}
    >
      {children}
    </ErpShell>
  );
}
