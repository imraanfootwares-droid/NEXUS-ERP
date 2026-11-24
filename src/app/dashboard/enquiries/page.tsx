import { TierLockOverlay } from "@/components/ui/kpi-grid";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { TenantEnquiryRow } from "@/types/database";
import { DashboardEnquiriesClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function DashboardEnquiriesPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const access = canAccess(ctx, "enquiries.view");
  if (!access.allowed) {
    if (access.reason === "FEATURE_DISABLED") {
      return <TierLockOverlay featureKey="customer_enquiries" />;
    }
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
        You do not have permission to view customer enquiries.
      </div>
    );
  }

  const enquiries = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<TenantEnquiryRow>(
        `SELECT id, tenant_id, branch_id, customer_name, customer_contact, message, items, source, channel, status, created_at
         FROM public.tenant_enquiries
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT 500`,
        [ctx.tenant!.id]
      );
      return res.rows;
    }
  );

  const canManage = canAccess(ctx, "enquiries.manage", { isMutation: true }).allowed;

  return (
    <DashboardEnquiriesClient
      tenant={ctx.tenant}
      enquiries={enquiries}
      canManage={canManage}
    />
  );
}
