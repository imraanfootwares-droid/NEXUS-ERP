import React from "react";
import { redirect } from "next/navigation";
import { ErpShell } from "@/components/erp/erp-shell";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getServerSessionContext();
  if (!ctx) redirect("/login");
  if (!ctx.tenant) redirect("/platform");
  if (ctx.tenant.status === "suspended" && !ctx.impersonation) {
    redirect("/suspended");
  }

  let lowStockCount = 0;
  if (ctx.enabledFeatures.auto_stock_and_alerts) {
    lowStockCount = await withTenantTx(
      { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
      async (client) => {
        const res = await client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM public.branch_stock bs
           JOIN public.product_variants pv ON pv.id = bs.variant_id
           WHERE bs.tenant_id = $1 AND bs.quantity <= pv.low_stock_threshold AND pv.is_active = true`,
          [ctx.tenant!.id]
        );
        return Number(res.rows[0]?.cnt ?? 0);
      }
    );
  }

  return (
    <ErpShell ctx={ctx} lowStockCount={lowStockCount}>
      {children}
    </ErpShell>
  );
}
