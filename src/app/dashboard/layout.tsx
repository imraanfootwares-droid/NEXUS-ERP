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
  const checkLowStock = Boolean(ctx.enabledFeatures.auto_stock_and_alerts);
  const checkEnquiries = Boolean(ctx.enabledFeatures.customer_enquiries);
  if (checkLowStock || checkEnquiries) {
    try {
      const counts = await withTenantTx(
        { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
        async (client) => {
          const res = await client.query<{ low_stock: string; new_enquiries: string }>(
            `SELECT
               CASE WHEN $3::boolean THEN (
                 SELECT COUNT(*)::text
                 FROM public.branch_stock bs
                 JOIN public.product_variants pv ON pv.id = bs.variant_id
                 WHERE bs.tenant_id = $1 AND bs.branch_id = ANY($2::uuid[])
                   AND bs.quantity <= pv.low_stock_threshold AND pv.is_active = true
               ) ELSE '0' END AS low_stock,
               CASE WHEN $4::boolean THEN (
                 SELECT COUNT(*)::text
                 FROM public.tenant_enquiries
                 WHERE tenant_id = $1 AND status = 'new'
               ) ELSE '0' END AS new_enquiries`,
            [ctx.tenant!.id, scope.ids, checkLowStock, checkEnquiries]
          );
          return {
            lowStock: Number(res.rows[0]?.low_stock ?? 0),
            newEnquiries: Number(res.rows[0]?.new_enquiries ?? 0),
          };
        }
      );
      lowStockCount = counts.lowStock;
      newEnquiryCount = counts.newEnquiries;
    } catch {
      lowStockCount = 0;
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
