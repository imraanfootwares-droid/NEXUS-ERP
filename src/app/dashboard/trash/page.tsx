import { Lock } from "lucide-react";
import { canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { purgeExpiredTrashForTenant, type TrashItemRow } from "@/lib/trash/service";
import { Card, CardContent } from "@/components/ui/primitives";
import { TrashClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function TrashPage() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) return null;

  const access = canAccess(ctx, "trash.manage");
  if (!access.allowed) {
    return (
      <div className="space-y-4">
        <div>
          <h1>Trash</h1>
          <p className="mt-0.5 text-[12.5px] text-[#77777d]">
            Recover accidentally deleted bills, purchases, and expenses within 15 days.
          </p>
        </div>
        <Card>
          <CardContent className="py-12 text-center space-y-2.5">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f4f4f5] text-[#171717]">
              <Lock className="h-5 w-5" />
            </div>
            <h2 className="text-base font-semibold text-[#171717]">15-Day Trash Bin is available on Tier 3 &amp; Tier 4</h2>
            <p className="mx-auto max-w-md text-xs text-[#77777d]">
              Keep deleted bills, purchase bills, and expenses safely for 15 days with 1-click restore. Contact your administrator to upgrade or unlock this add-on.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const items = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      // Lazily sweep any items older than 15 days before reading
      await purgeExpiredTrashForTenant(client, ctx.tenant!.id);

      const res = await client.query<{
        id: string;
        tenant_id: string;
        entity_type: TrashItemRow["entity_type"];
        entity_id: string;
        title: string;
        subtitle: string | null;
        amount: string;
        deleted_by_name: string | null;
        deleted_at: string;
        expires_at: string;
      }>(
        `SELECT id, tenant_id, entity_type, entity_id, title, subtitle,
                amount::text, deleted_by_name, deleted_at, expires_at
         FROM public.trash_items
         WHERE tenant_id = $1 AND expires_at > now()
         ORDER BY deleted_at DESC
         LIMIT 100`,
        [ctx.tenant!.id]
      );

      return res.rows.map((r) => ({
        ...r,
        amount: Number(r.amount || 0),
        snapshot: {},
      }));
    }
  );

  return (
    <div className="space-y-4">
      <div>
        <h1>Trash</h1>
        <p className="mt-0.5 text-[12.5px] text-[#77777d]">
          Deleted bills, purchases, and expenses stay here for 15 days and then clear automatically.
        </p>
      </div>
      <TrashClient items={items} />
    </div>
  );
}
