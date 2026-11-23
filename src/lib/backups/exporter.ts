import crypto from "crypto";
import zlib from "zlib";
import { isConfigured } from "@/lib/env";
import { withPlatformTx } from "@/lib/db";
import { deleteObject, uploadBuffer } from "@/lib/storage/s3-client";

const BACKUP_TABLES = [
  "tenants",
  "branches",
  "devices",
  "profiles",
  "user_branch_assignments",
  "tenant_role_permissions",
  "uoms",
  "variant_axis_definitions",
  "custom_field_definitions",
  "products",
  "product_variants",
  "branch_stock",
  "bill_templates",
  "customers",
  "suppliers",
  "invoices",
  "invoice_items",
  "invoice_payments",
  "expenses",
  "day_closes",
  "purchase_orders",
  "purchase_items",
  "supplier_payments",
  "production_batches",
  "production_batch_items",
  "stock_transfers",
  "stock_transfer_items",
  "stock_ledger",
] as const;

export async function runTenantBackup(
  tenantId: string,
  triggerType: "scheduled" | "manual",
  actorId: string | null = null
): Promise<{ skipped: boolean; key?: string; sizeBytes: number; checksum: string }> {
  if (!isConfigured.storage) {
    throw new Error("Cloudflare R2 / S3 storage is not configured.");
  }

  const snapshot: Record<string, unknown[]> = {};
  await withPlatformTx(async (client) => {
    for (const table of BACKUP_TABLES) {
      const col = table === "tenants" ? "id" : "tenant_id";
      const res = await client.query(`SELECT * FROM public.${table} WHERE ${col} = $1`, [tenantId]);
      snapshot[table] = res.rows;
    }
  });

  const jsonBytes = Buffer.from(JSON.stringify(snapshot), "utf8");
  const checksum = crypto.createHash("sha256").update(jsonBytes).digest("hex");

  // Skip upload if SHA-256 matches previous snapshot (zero R2 waste on quiet days)
  const lastChecksum = await withPlatformTx(async (client) => {
    const res = await client.query<{ checksum_sha256: string }>(
      "SELECT checksum_sha256 FROM public.tenant_backups WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1",
      [tenantId]
    );
    return res.rows[0]?.checksum_sha256 ?? null;
  });

  if (triggerType === "scheduled" && lastChecksum === checksum) {
    return { skipped: true, sizeBytes: 0, checksum };
  }

  const gz = zlib.gzipSync(jsonBytes, { level: 9 });
  const dateStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `private/${tenantId}/backups/${dateStamp}.json.gz`;

  await uploadBuffer("private", key, gz, "application/gzip");

  await withPlatformTx(async (client) => {
    await client.query(
      `INSERT INTO public.tenant_backups (tenant_id, s3_key, file_size_bytes, checksum_sha256, trigger_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, key, gz.length, checksum, triggerType, actorId]
    );

    // Prune beyond latest 14 snapshots per tenant
    const oldRes = await client.query<{ id: string; s3_key: string }>(
      `SELECT id, s3_key FROM public.tenant_backups
       WHERE tenant_id = $1
       ORDER BY created_at DESC
       OFFSET 14`,
      [tenantId]
    );
    for (const old of oldRes.rows) {
      await deleteObject("private", old.s3_key).catch(() => undefined);
      await client.query("DELETE FROM public.tenant_backups WHERE id = $1", [old.id]);
    }
  });

  return { skipped: false, key, sizeBytes: gz.length, checksum };
}

/** Sweeps unconfirmed pending_uploads older than 24h and archives audit_logs > 180 days. */
export async function runHousekeeping(): Promise<{ sweptUploads: number; archivedAudits: number }> {
  let sweptUploads = 0;
  let archivedAudits = 0;

  await withPlatformTx(async (client) => {
    const stale = await client.query<{ id: string; bucket: "public" | "private"; key: string }>(
      "SELECT id, bucket, key FROM public.pending_uploads WHERE created_at < now() - interval '24 hours' LIMIT 100"
    );
    for (const row of stale.rows) {
      await deleteObject(row.bucket, row.key).catch(() => undefined);
      await client.query("DELETE FROM public.pending_uploads WHERE id = $1", [row.id]);
      sweptUploads++;
    }

    const oldAudits = await client.query(
      "SELECT * FROM public.audit_logs WHERE created_at < now() - interval '180 days' ORDER BY created_at ASC LIMIT 2000"
    );
    if (oldAudits.rows.length > 0 && isConfigured.storage) {
      const gz = zlib.gzipSync(Buffer.from(JSON.stringify(oldAudits.rows), "utf8"));
      await uploadBuffer(
        "private",
        `private/platform/audit-archive-${new Date().toISOString().slice(0, 10)}.json.gz`,
        gz,
        "application/gzip"
      );
      const ids = oldAudits.rows.map((r) => r.id);
      await client.query("DELETE FROM public.audit_logs WHERE id = ANY($1::uuid[])", [ids]);
      archivedAudits = ids.length;
    }
  });

  return { sweptUploads, archivedAudits };
}
