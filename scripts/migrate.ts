import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Pool } from "pg";

async function main() {
  // Prefer direct (non-pooled) Neon connection for DDL migrations per Neon best practices
  const url =
    process.env.DATABASE_URL_MIGRATE ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL_MIGRATE (direct owner connection) is required to run migrations.");
  }

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        filename TEXT PRIMARY KEY,
        checksum_sha256 TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    const migrationsDir = path.resolve(process.cwd(), "db/migrations");
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const fullPath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(fullPath, "utf8");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");

      const existing = await client.query<{ checksum_sha256: string }>(
        "SELECT checksum_sha256 FROM public.schema_migrations WHERE filename = $1",
        [file]
      );

      if (existing.rows.length > 0) {
        if (existing.rows[0].checksum_sha256 !== checksum) {
          throw new Error(`Checksum mismatch for already-applied migration ${file}!`);
        }
        console.log(`✓ ${file} (already applied)`);
        continue;
      }

      console.log(`→ Applying ${file}...`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO public.schema_migrations (filename, checksum_sha256) VALUES ($1, $2)",
          [file, checksum]
        );
        await client.query("COMMIT");
        console.log(`✓ ${file} applied.`);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    // Set password on restricted nexus_app role if NEXUS_APP_DB_PASSWORD is provided
    const appPw = process.env.NEXUS_APP_DB_PASSWORD;
    if (appPw) {
      const escaped = appPw.replace(/'/g, "''");
      await client.query(`ALTER ROLE nexus_app WITH PASSWORD '${escaped}';`);
      console.log("✓ nexus_app role password synchronized.");
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
