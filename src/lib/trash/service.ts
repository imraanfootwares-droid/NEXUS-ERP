import type { PoolClient } from "pg";

export type TrashEntityType = "invoice" | "purchase" | "expense" | "ledger_entry";

export interface TrashItemRow {
  id: string;
  tenant_id: string;
  entity_type: TrashEntityType;
  entity_id: string;
  title: string;
  subtitle: string | null;
  amount: number;
  snapshot: Record<string, unknown>;
  deleted_by_name: string | null;
  deleted_at: string;
  expires_at: string;
}

/**
 * Lazily purges expired trash items (>15 days old) for this tenant.
 * Uses the composite index (tenant_id, expires_at DESC) so it completes in <1ms
 * with zero background polling or extra cron load.
 */
export async function purgeExpiredTrashForTenant(client: PoolClient, tenantId: string): Promise<number> {
  const res = await client.query(
    "DELETE FROM public.trash_items WHERE tenant_id = $1 AND expires_at <= now()",
    [tenantId]
  );
  return res.rowCount ?? 0;
}

/**
 * Moves a deleted bill, purchase bill, expense, or ledger entry into the 15-day Trash Bin.
 */
export async function moveItemToTrash(
  client: PoolClient,
  params: {
    tenantId: string;
    entityType: TrashEntityType;
    entityId: string;
    title: string;
    subtitle?: string | null;
    amount: number;
    snapshot: unknown;
    deletedBy: string;
    deletedByName: string;
  }
) {
  await purgeExpiredTrashForTenant(client, params.tenantId);
  await client.query(
    `INSERT INTO public.trash_items
       (tenant_id, entity_type, entity_id, title, subtitle, amount, snapshot, deleted_by, deleted_by_name, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9, now() + interval '15 days')`,
    [
      params.tenantId,
      params.entityType,
      params.entityId,
      params.title,
      params.subtitle ?? null,
      Number(params.amount || 0),
      JSON.stringify(params.snapshot ?? {}),
      params.deletedBy,
      params.deletedByName,
    ]
  );
}
