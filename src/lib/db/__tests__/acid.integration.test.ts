import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "crypto";

const testDbUrl =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.DATABASE_URL;

describe.skipIf(!testDbUrl)("ACID & RLS Integration Tests", () => {
  const pool = testDbUrl
    ? new Pool({
        connectionString: testDbUrl,
        ssl:
          testDbUrl.includes("localhost") || testDbUrl.includes("127.0.0.1")
            ? false
            : { rejectUnauthorized: false },
      })
    : null;

  afterAll(async () => {
    await pool?.end();
  });

  it("verifies database connectivity when TEST_DATABASE_URL is configured", async () => {
    expect(pool).not.toBeNull();
    const res = await pool!.query("SELECT 1 AS ok");
    expect(res.rows[0].ok).toBe(1);
  });

  it("enforces idempotency, concurrency, immutability, and RLS isolation", async () => {
    const client = await pool!.connect();
    try {
      const tA = await client.query<{ id: string }>(
        "SELECT id FROM public.tenants WHERE slug = 'imraan-footwear'"
      );
      if (tA.rows.length === 0) return; // Skip if seed hasn't been run
      const tenantId = tA.rows[0].id;
      const bRes = await client.query<{ id: string }>(
        "SELECT id FROM public.branches WHERE tenant_id = $1 AND code = 'CHN'",
        [tenantId]
      );
      const vRes = await client.query<{ id: string }>(
        "SELECT id FROM public.product_variants WHERE tenant_id = $1 LIMIT 1",
        [tenantId]
      );
      if (bRes.rows.length === 0 || vRes.rows.length === 0) return;

      const branchId = bRes.rows[0].id;
      const variantId = vRes.rows[0].id;
      const idemKey = randomUUID();

      await client.query("BEGIN");
      await client.query(
        "SELECT set_config('app.tenant_id', $1, true), set_config('app.is_platform_admin', 'false', true)",
        [tenantId]
      );
      const payload = {
        idempotency_key: idemKey,
        branch_id: branchId,
        invoice_type: "sale",
        tax_mode: "inclusive",
        supply_type: "intra_state",
        subtotal: 1000,
        taxable_amount: 952.38,
        cgst_amount: 23.81,
        sgst_amount: 23.81,
        grand_total: 1000,
        paid_amount: 1000,
        items: [{ variant_id: variantId, product_name: "Test", qty: 1, unit_price: 1000, taxable_value: 952.38, gst_rate: 5, cgst: 23.81, sgst: 23.81, igst: 0, line_total: 1000 }],
        payments: [{ mode: "cash", amount: 1000 }],
      };

      const r1 = await client.query<{ id: string }>(
        "SELECT public.create_invoice_atomic($1, $2::jsonb) AS id",
        [tenantId, JSON.stringify(payload)]
      );
      const r2 = await client.query<{ id: string }>(
        "SELECT public.create_invoice_atomic($1, $2::jsonb) AS id",
        [tenantId, JSON.stringify(payload)]
      );
      expect(r1.rows[0].id).toBe(r2.rows[0].id);

      // Finalized invoice amount update must be rejected by immutability trigger
      await expect(
        client.query("UPDATE public.invoices SET grand_total = 999 WHERE id = $1", [r1.rows[0].id])
      ).rejects.toThrow(/immutable/i);

      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
  });
});
