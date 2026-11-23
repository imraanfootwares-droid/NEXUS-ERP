import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import fs from "fs";
import zlib from "zlib";
import { Pool } from "pg";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Restore a tenant snapshot from a gzipped JSON backup (local file or R2 private bucket key).
 * Usage: npm run restore:tenant -- --file=./backup.json.gz [--dry-run]
 *    or: npm run restore:tenant -- --r2-key=private/<tenant_id>/backups/2026-11-23.json.gz [--dry-run]
 */
async function readBackupJson(args: string[]): Promise<Record<string, Array<Record<string, unknown>>>> {
  const fileArg = args.find((a) => a.startsWith("--file="))?.split("=")[1];
  const r2Arg = args.find((a) => a.startsWith("--r2-key="))?.split("=")[1];

  let gzBuf: Buffer;
  if (fileArg) {
    gzBuf = fs.readFileSync(fileArg);
  } else if (r2Arg) {
    const client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
      forcePathStyle: true,
    });
    const res = await client.send(
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET_PRIVATE || "nexus-private", Key: r2Arg })
    );
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    gzBuf = Buffer.concat(chunks);
  } else {
    throw new Error("Provide --file=<path> or --r2-key=<key>");
  }

  const jsonStr = zlib.gunzipSync(gzBuf).toString("utf8");
  return JSON.parse(jsonStr);
}

const RESTORE_ORDER = [
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

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const snapshot = await readBackupJson(args);

  console.log(`Loaded snapshot tables: ${Object.keys(snapshot).length}`);
  if (dryRun) {
    for (const table of RESTORE_ORDER) {
      const rows = snapshot[table] ?? [];
      console.log(`  [DRY RUN] ${table}: ${rows.length} rows`);
    }
    return;
  }

  const url =
    process.env.DATABASE_URL_MIGRATE ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL_MIGRATE is required.");

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const table of RESTORE_ORDER) {
      const rows = snapshot[table] ?? [];
      if (rows.length === 0) continue;
      const cols = Object.keys(rows[0]);
      for (const row of rows) {
        const vals = cols.map((c) => {
          const v = row[c];
          return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v) : v;
        });
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(",");
        await client.query(
          `INSERT INTO public.${table} (${cols.join(",")}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
          vals
        );
      }
      console.log(`✓ Restored ${table}: ${rows.length} rows`);
    }
    await client.query("COMMIT");
    console.log("✓ Tenant restore completed.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Restore failed:", err);
  process.exit(1);
});
