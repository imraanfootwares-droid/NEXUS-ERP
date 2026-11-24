import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { hashPassword, isSameOriginRequest } from "@/lib/auth/crypto";
import { getServerSessionContext } from "@/lib/auth/session";
import { isConfigured } from "@/lib/env";
import { query, withPlatformTx } from "@/lib/db";
import { listObjectsByPrefix } from "@/lib/storage/s3-client";

export const runtime = "nodejs";

const setupSchema = z.object({
  token: z.string().min(1),
  fullName: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  if (!isConfigured.db || !isConfigured.bootstrap) {
    return NextResponse.json(
      { error: "DATABASE_URL and APP_OWNER_BOOTSTRAP_TOKEN must be configured." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = setupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid setup form values." }, { status: 400 });
    }
    if (parsed.data.token !== process.env.APP_OWNER_BOOTSTRAP_TOKEN) {
      return NextResponse.json({ error: "Invalid bootstrap token." }, { status: 403 });
    }

    await withPlatformTx(async (client) => {
      const existing = await client.query<{ id: string }>(
        "SELECT id FROM public.profiles WHERE is_platform_admin = true LIMIT 1"
      );
      if (existing.rows.length > 0) {
        throw new Error("Setup already completed and permanently locked.");
      }

      await client.query(
        `INSERT INTO public.profiles (tenant_id, is_platform_admin, role, full_name, email, username, password_hash, must_change_password)
         VALUES (NULL, true, 'owner', $1, $2, 'superadmin', $3, false)`,
        [parsed.data.fullName.trim(), parsed.data.email.trim().toLowerCase(), hashPassword(parsed.data.password)]
      );
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bootstrap failed" },
      { status: 400 }
    );
  }
}

export async function GET(request: NextRequest) {
  const domain = request.nextUrl.searchParams.get("domain");

  // Caddy on-demand TLS `ask` endpoint
  if (domain !== null) {
    if (!isConfigured.db) return new NextResponse("Not configured", { status: 503 });
    const res = await query("SELECT 1 FROM public.resolve_tenant_host($1) WHERE status = 'active'", [
      domain,
    ]);
    if (res.rows.length > 0) {
      return new NextResponse("OK", { status: 200 });
    }
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Full Platform Migration Export (Application Owner only)
  const ctx = await getServerSessionContext("platform");
  if (!ctx || !ctx.user.is_platform_admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tables = [
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
  ];

  const dump: Record<string, unknown[]> = {};
  await withPlatformTx(async (client) => {
    for (const table of tables) {
      const r = await client.query(`SELECT * FROM public.${table}`);
      dump[table] = r.rows;
    }
  });

  let r2Manifest: { publicKeys: string[]; privateKeys: string[] } = {
    publicKeys: [],
    privateKeys: [],
  };
  if (isConfigured.storage) {
    const [pub, priv] = await Promise.all([
      listObjectsByPrefix("public", "", 1000),
      listObjectsByPrefix("private", "", 1000),
    ]);
    r2Manifest = {
      publicKeys: pub.map((o) => o.key),
      privateKeys: priv.map((o) => o.key),
    };
  }

  const payload = {
    exported_at: new Date().toISOString(),
    rclone_sync_hint: "rclone sync r2:nexus-public ./r2_public_backup && rclone sync r2:nexus-private ./r2_private_backup",
    r2_manifest: r2Manifest,
    database: dump,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="nexus-erp-migration-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}
