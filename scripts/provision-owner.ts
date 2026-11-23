import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { Pool } from "pg";
import { generateTempPassword, hashPassword } from "../src/lib/auth/crypto";

async function main() {
  const url =
    process.env.DATABASE_URL_MIGRATE ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL_MIGRATE is required.");

  const email = (process.env.APP_OWNER_EMAIL || "").trim().toLowerCase();
  const fullName = process.env.APP_OWNER_NAME || "Application Owner";
  if (!email) throw new Error("APP_OWNER_EMAIL is required in environment.");

  const pool = new Pool({
    connectionString: url,
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : { rejectUnauthorized: false },
  });

  const client = await pool.connect();
  try {
    const existing = await client.query<{ id: string }>(
      "SELECT id FROM public.profiles WHERE LOWER(email) = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      await client.query(
        "UPDATE public.profiles SET is_platform_admin = true, is_active = true WHERE id = $1",
        [existing.rows[0].id]
      );
      console.log(`✓ Promoted existing user ${email} to Platform Super Admin.`);
    } else {
      const tempPassword = generateTempPassword(12);
      const pwHash = hashPassword(tempPassword);
      await client.query(
        `INSERT INTO public.profiles (tenant_id, is_platform_admin, role, full_name, email, username, password_hash, must_change_password)
         VALUES (NULL, true, 'owner', $1, $2, 'superadmin', $3, true)`,
        [fullName, email, pwHash]
      );
      console.log(`✓ Created Platform Super Admin: ${email}`);
      console.log(`  Temporary Password (change immediately): ${tempPassword}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Provision owner failed:", err);
  process.exit(1);
});
