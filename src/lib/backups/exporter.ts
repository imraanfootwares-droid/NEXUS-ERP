import crypto from "crypto";
import zlib from "zlib";
import type { PoolClient, QueryResult } from "pg";
import { isConfigured } from "@/lib/env";
import { withPlatformTx, withTenantTx } from "@/lib/db";
import { buildWorkbook, collectExport } from "@/lib/exports/full-export";
import { deleteObject, headObject, uploadBuffer } from "@/lib/storage/s3-client";
import { backupsToPrune } from "./retention";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

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
  "hsn_codes",
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

export const excelKeyFor = (jsonKey: string) => jsonKey.replace(/\.json\.gz$/, ".xlsx");

/** Row order is not guaranteed by SQL, so rows are sorted to keep checksums stable. */
function stableRows(rows: unknown[]): unknown[] {
  return rows
    .map((row) => ({ row, text: JSON.stringify(row) }))
    .sort((a, b) => (a.text < b.text ? -1 : a.text > b.text ? 1 : 0))
    .map((entry) => entry.row);
}

const sha256 = (data: Buffer) => crypto.createHash("sha256").update(data).digest("hex");

/** Compresses and proves the file can be read back before it counts as a backup. */
function packVerified(json: Buffer, checksum: string): Buffer {
  const gz = zlib.gzipSync(json, { level: 9 });
  if (sha256(zlib.gunzipSync(gz)) !== checksum) throw new Error("Backup failed its integrity check.");
  return gz;
}

async function uploadVerified(key: string, body: Buffer, type: string): Promise<void> {
  await uploadBuffer("private", key, body, type);
  const stored = await headObject("private", key);
  if (!stored.exists || stored.contentLength !== body.length) {
    await deleteObject("private", key).catch(() => undefined);
    throw new Error("Backup upload could not be verified.");
  }
}

/** Row counts plus Postgres row versions: changes on any insert, edit or delete. */
async function readFingerprint(client: PoolClient, tenantId: string): Promise<string> {
  const parts = BACKUP_TABLES.map((table) => {
    const col = table === "tenants" ? "id" : "tenant_id";
    return `SELECT '${table}' AS t, count(*)::text AS c, coalesce(sum(xmin::text::bigint), 0)::text AS v FROM public.${table} WHERE ${col} = $1`;
  });
  const res = await client.query<{ t: string; c: string; v: string }>(parts.join(" UNION ALL "), [tenantId]);
  const text = res.rows.map((r) => `${r.t}:${r.c}:${r.v}`).sort().join("|");
  return crypto.createHash("sha256").update(text).digest("hex");
}

async function rememberFingerprint(tenantId: string, fingerprint: string): Promise<void> {
  await withPlatformTx((client) =>
    client.query(
      `INSERT INTO public.platform_settings (key, value)
       VALUES ('backup_fingerprints', jsonb_build_object($1::text, $2::text))
       ON CONFLICT (key) DO UPDATE
       SET value = public.platform_settings.value || EXCLUDED.value, updated_at = now()`,
      [tenantId, fingerprint]
    )
  );
}

export async function runTenantBackup(
  tenantId: string,
  triggerType: "scheduled" | "manual",
  actorId: string | null = null
): Promise<{ skipped: boolean; key?: string; sizeBytes: number; checksum: string }> {
  if (!isConfigured.storage) {
    throw new Error("Cloudflare R2 / S3 storage is not configured.");
  }

  // One read-only snapshot: consistent across tables and does not block billing.
  const prepared = await withTenantTx(
    { tenantId: null, isPlatformAdmin: true },
    async (client) => {
      // A tiny summary decides first, so an unchanged business transfers no row data.
      const fingerprint = await readFingerprint(client, tenantId);
      const saved = await client.query<{ value: Record<string, string> }>(
        "SELECT value FROM public.platform_settings WHERE key = 'backup_fingerprints'"
      );
      if (triggerType === "scheduled" && saved.rows[0]?.value?.[tenantId] === fingerprint) {
        return { unchanged: true as const, checksum: "", fingerprint };
      }

      // Each table is read once and shared by the restore file and the Excel file.
      const reads = new Map<string, QueryResult>();
      const once = {
        query: async (sql: string, params?: unknown[]) => {
          const id = `${sql}|${JSON.stringify(params ?? [])}`;
          if (!reads.has(id)) reads.set(id, await client.query(sql, params));
          return reads.get(id)!;
        },
      } as unknown as PoolClient;

      const snapshot: Record<string, unknown[]> = {};
      for (const table of BACKUP_TABLES) {
        const col = table === "tenants" ? "id" : "tenant_id";
        const res = await once.query(`SELECT * FROM public.${table} WHERE ${col} = $1`, [tenantId]);
        snapshot[table] = stableRows(res.rows);
      }
      const json = Buffer.from(JSON.stringify(snapshot), "utf8");
      const checksum = sha256(json);
      const last = await client.query<{ checksum_sha256: string }>(
        "SELECT checksum_sha256 FROM public.tenant_backups WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1",
        [tenantId]
      );
      if (triggerType === "scheduled" && last.rows[0]?.checksum_sha256 === checksum) {
        return { unchanged: true as const, checksum, fingerprint };
      }
      const workbook = buildWorkbook(await collectExport(once, tenantId));
      return { unchanged: false as const, checksum, json, workbook, fingerprint };
    },
    { snapshot: true }
  );

  if (prepared.unchanged) {
    await rememberFingerprint(tenantId, prepared.fingerprint);
    return { skipped: true, sizeBytes: 0, checksum: prepared.checksum };
  }

  const gz = packVerified(prepared.json, prepared.checksum);
  const dateStamp = new Date().toISOString().replace(/[:.]/g, "-");
  const key = `private/${tenantId}/backups/${dateStamp}.json.gz`;

  await uploadVerified(key, gz, "application/gzip");
  await uploadVerified(excelKeyFor(key), prepared.workbook, XLSX_TYPE);

  const expired = await withPlatformTx(async (client) => {
    await client.query(
      `INSERT INTO public.tenant_backups (tenant_id, s3_key, file_size_bytes, checksum_sha256, trigger_type, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, key, gz.length, prepared.checksum, triggerType, actorId]
    );
    const all = await client.query<{ id: string; s3_key: string; created_at: string }>(
      "SELECT id, s3_key, created_at FROM public.tenant_backups WHERE tenant_id = $1",
      [tenantId]
    );
    const ids = new Set(backupsToPrune(all.rows));
    if (ids.size > 0) {
      await client.query("DELETE FROM public.tenant_backups WHERE id = ANY($1::uuid[])", [[...ids]]);
    }
    return {
      removed: all.rows.filter((r) => ids.has(r.id)),
      olderKeys: all.rows.filter((r) => r.s3_key !== key).map((r) => r.s3_key),
    };
  });
  await rememberFingerprint(tenantId, prepared.fingerprint);

  // Files are removed only after the new backup is safely recorded.
  for (const old of expired.removed) {
    await deleteObject("private", old.s3_key).catch(() => undefined);
  }
  // Only the newest backup keeps an Excel copy, which saves most of the storage.
  for (const olderKey of expired.olderKeys) {
    await deleteObject("private", excelKeyFor(olderKey)).catch(() => undefined);
  }

  return { skipped: false, key, sizeBytes: gz.length, checksum: prepared.checksum };
}

interface PlatformBackupEntry {
  id: string;
  key: string;
  checksum: string;
  size: number;
  created_at: string;
}

async function readPlatformSnapshot(client: PoolClient) {
  const queries: Record<string, string> = {
    platform_settings: "SELECT * FROM public.platform_settings WHERE key NOT LIKE 'backup_%' AND key <> 'platform_backups'",
    permission_definitions: "SELECT * FROM public.permission_definitions",
    hsn_codes: "SELECT * FROM public.hsn_codes WHERE tenant_id IS NULL",
    profiles: "SELECT * FROM public.profiles WHERE is_platform_admin = true",
    landing_enquiries: "SELECT * FROM public.landing_enquiries",
  };
  const snapshot: Record<string, unknown[]> = {};
  for (const [table, sql] of Object.entries(queries)) {
    snapshot[table] = stableRows((await client.query(sql)).rows);
  }
  const history = await client.query<{ value: { items?: PlatformBackupEntry[] } }>(
    "SELECT value FROM public.platform_settings WHERE key = 'platform_backups'"
  );
  return { snapshot, items: history.rows[0]?.value?.items ?? [] };
}

/** Backs up data that belongs to no single business, such as admins and enquiries. */
export async function runPlatformBackup(): Promise<{ skipped: boolean }> {
  if (!isConfigured.storage) throw new Error("Cloudflare R2 / S3 storage is not configured.");

  const { snapshot, items } = await withTenantTx(
    { tenantId: null, isPlatformAdmin: true },
    readPlatformSnapshot,
    { snapshot: true }
  );
  const json = Buffer.from(JSON.stringify(snapshot), "utf8");
  const checksum = sha256(json);
  const latest = [...items].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (latest?.checksum === checksum) return { skipped: true };

  const gz = packVerified(json, checksum);
  const createdAt = new Date().toISOString();
  const key = `private/platform/backups/${createdAt.replace(/[:.]/g, "-")}.json.gz`;
  await uploadVerified(key, gz, "application/gzip");

  const next = [...items, { id: key, key, checksum, size: gz.length, created_at: createdAt }];
  const remove = new Set(backupsToPrune(next));
  await withPlatformTx((client) =>
    client.query(
      `INSERT INTO public.platform_settings (key, value) VALUES ('platform_backups', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify({ items: next.filter((b) => !remove.has(b.id)) })]
    )
  );
  for (const id of remove) await deleteObject("private", id).catch(() => undefined);
  return { skipped: false };
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
