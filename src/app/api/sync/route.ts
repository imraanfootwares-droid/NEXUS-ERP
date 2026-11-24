import { NextResponse, type NextRequest } from "next/server";
import { canAccess, resolveRolePermissions } from "@/lib/auth/access";
import { isSameOriginRequest } from "@/lib/auth/crypto";
import { linkWalkInCustomer } from "@/lib/billing/walk-in-customer";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import type { OutboxEntry } from "@/lib/offline/sync-engine";
import type { TenantRole } from "@/lib/constants/saas";

export const runtime = "nodejs";

/** DB-free connectivity ping */
export async function HEAD() {
  return new NextResponse(null, { status: 204 });
}

/** GET /api/sync?branch_id=...&since=... -> offline catalog snapshot or delta */
export async function GET(request: NextRequest) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.accessBlock) {
    return NextResponse.json({ error: "Access is paused.", blocked: true, block: ctx.accessBlock }, { status: 423 });
  }
  const branchId = request.nextUrl.searchParams.get("branch_id") || ctx.branches[0]?.id;
  if (!branchId) {
    return NextResponse.json({ error: "No branch available" }, { status: 400 });
  }
  const since = request.nextUrl.searchParams.get("since");
  const canSeeCost = ctx.permissions["analytics.view_profit"] === true;

  const snapshot = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const sinceDate = since ? new Date(since) : null;
      const whereSince = sinceDate && !Number.isNaN(sinceDate.getTime()) ? "AND updated_at > $2" : "";
      const params: unknown[] = whereSince ? [ctx.tenant!.id, sinceDate!.toISOString()] : [ctx.tenant!.id];

      const [products, variants, stock, customers, hsn, tpl] = await Promise.all([
        client.query(
          `SELECT id, model_code, name, category, brand, uom, hsn_code, gst_rate, custom_fields, is_active, updated_at
           FROM public.products WHERE tenant_id = $1 ${whereSince}`,
          params
        ),
        client.query(
          `SELECT id, product_id, sku, barcode, attributes, mrp, selling_price, wholesale_price, low_stock_threshold, is_active, updated_at
                  ${canSeeCost ? ", avg_cost" : ""}
           FROM public.product_variants WHERE tenant_id = $1 ${whereSince}`,
          params
        ),
        client.query(
          `SELECT variant_id, quantity, updated_at FROM public.branch_stock
           WHERE tenant_id = $1 AND branch_id = $2 ${sinceDate && !Number.isNaN(sinceDate.getTime()) ? "AND updated_at > $3" : ""}`,
          sinceDate && !Number.isNaN(sinceDate.getTime())
            ? [ctx.tenant!.id, branchId, sinceDate.toISOString()]
            : [ctx.tenant!.id, branchId]
        ),
        client.query(
          `SELECT id, name, phone, gstin, state_code, customer_type, default_discount_pct, credit_limit, current_due, credit_balance, is_active, updated_at
           FROM public.customers WHERE tenant_id = $1 ${whereSince}`,
          params
        ),
        since
          ? Promise.resolve({ rows: [] })
          : client.query("SELECT * FROM public.hsn_codes WHERE tenant_id IS NULL OR tenant_id = $1", [ctx.tenant!.id]),
        since
          ? Promise.resolve({ rows: [] })
          : client.query("SELECT * FROM public.bill_templates WHERE tenant_id = $1 AND is_default = true LIMIT 1", [ctx.tenant!.id]),
      ]);

      return {
        synced_at: new Date().toISOString(),
        is_delta: Boolean(since),
        products: products.rows,
        variants: variants.rows,
        stock: stock.rows,
        customers: customers.rows,
        hsn_codes: hsn.rows,
        bill_template: tpl.rows[0] ?? null,
      };
    }
  );

  return NextResponse.json(snapshot);
}

/** POST /api/sync -> Register POS device OR replay FIFO ACID outbox */
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (ctx.accessBlock) {
    return NextResponse.json({ error: "Access is paused.", blocked: true, block: ctx.accessBlock }, { status: 423 });
  }
  const tenantId = ctx.tenant.id;

  const body = await request.json();

  if (body?.action === "register_device") {
    const branchId = String(body.branch_id || "");
    const label = String(body.label || "POS Counter").slice(0, 60);
    const device = await withTenantTx({ tenantId, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
      const used = await client.query<{ device_no: number }>(
        "SELECT device_no FROM public.devices WHERE branch_id = $1 AND tenant_id = $2 ORDER BY device_no",
        [branchId, tenantId]
      );
      const usedSet = new Set(used.rows.map((r) => r.device_no));
      let nextNo = 1;
      while (usedSet.has(nextNo) && nextNo <= 9) nextNo++;
      if (nextNo > 9) throw new Error("Maximum 9 offline devices per branch reached.");

      const bRes = await client.query<{ code: string }>(
        "SELECT code FROM public.branches WHERE id = $1 AND tenant_id = $2",
        [branchId, tenantId]
      );
      if (bRes.rows.length === 0) throw new Error("Branch not found.");

      const ins = await client.query<{ id: string; device_no: number; last_seq: number }>(
        `INSERT INTO public.devices (tenant_id, branch_id, device_no, label)
         VALUES ($1, $2, $3, $4) RETURNING id, device_no, last_seq`,
        [tenantId, branchId, nextNo, label]
      );
      return {
        device_id: ins.rows[0].id,
        device_no: ins.rows[0].device_no,
        next_seq: ins.rows[0].last_seq + 1,
        branch_code: bRes.rows[0].code,
      };
    });
    return NextResponse.json(device);
  }

  // FIFO ACID outbox replay
  const entries = (body?.entries ?? []) as OutboxEntry[];
  const results: Array<{ idempotency_key: string; ok: boolean; conflict?: boolean; error?: string }> = [];

  for (const entry of entries.slice(0, 20)) {
    try {
      await withTenantTx({ tenantId, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
        // Verify original user is still active in this tenant and has permission
        const origUserRes = await client.query<{ role: TenantRole; is_active: boolean; access_blocked: boolean }>(
          "SELECT role, is_active, access_blocked FROM public.profiles WHERE id = $1 AND tenant_id = $2",
          [entry.user_id, tenantId]
        );
        const orig = origUserRes.rows[0];
        if (!orig || !orig.is_active) {
          throw new Error("CONFLICT:Original user is no longer active.");
        }
        if (orig.access_blocked) {
          // Not a conflict: the entry stays queued and syncs after this person is unblocked.
          throw new Error("Held until this user's access is restored.");
        }
        const permRows = await client.query<{ permission_key: string; allowed: boolean }>(
          "SELECT permission_key, allowed FROM public.tenant_role_permissions WHERE tenant_id = $1 AND role = $2",
          [tenantId, orig.role]
        );
        const perms = resolveRolePermissions(orig.role, permRows.rows);
        const reqPerm =
          entry.op === "create_invoice"
            ? "billing.create"
            : entry.op === "quick_customer" || entry.op === "collect_due"
            ? "customers.manage"
            : entry.op === "adjust_stock"
            ? "stock.record_incoming"
            : entry.op === "record_production"
            ? "production.record"
            : "transfers.receive";

        if (!canAccess({ ...ctx, user: { ...ctx.user, id: entry.user_id, role: orig.role }, permissions: perms }, reqPerm, { isMutation: true }).allowed) {
          throw new Error("CONFLICT:User no longer has permission for this action.");
        }

        if (entry.op === "create_invoice") {
          const canSaveCustomer = canAccess(
            { ...ctx, user: { ...ctx.user, id: entry.user_id, role: orig.role }, permissions: perms },
            "customers.manage",
            { isMutation: true }
          ).allowed;
          const invoicePayload = canSaveCustomer
            ? await linkWalkInCustomer(client, tenantId, entry.payload as Record<string, unknown>)
            : entry.payload;
          await client.query("SELECT public.create_invoice_atomic($1, $2::jsonb)", [
            tenantId,
            JSON.stringify({
              ...invoicePayload,
              idempotency_key: entry.idempotency_key,
              created_by: entry.user_id,
              offline: {
                device_id: entry.device_id,
                device_seq: entry.device_seq,
                offline_created_at: entry.created_at,
              },
            }),
          ]);
        } else if (entry.op === "quick_customer") {
          const c = entry.payload as {
            name?: string;
            phone?: string | null;
            gstin?: string | null;
            state_code?: string | null;
            customer_type?: string;
          };
          await client.query(
            `INSERT INTO public.customers (tenant_id, name, phone, gstin, state_code, customer_type)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              tenantId,
              String(c.name || "Walk-In Customer").trim(),
              c.phone?.trim() || null,
              c.gstin?.trim().toUpperCase() || null,
              c.state_code || null,
              c.customer_type === "wholesale" ? "wholesale" : "retail",
            ]
          );
        } else if (entry.op === "collect_due") {
          await client.query("SELECT public.collect_customer_due_atomic($1, $2::jsonb)", [
            tenantId,
            JSON.stringify({ ...entry.payload, recorded_by: entry.user_id }),
          ]);
        } else if (entry.op === "adjust_stock") {
          await client.query("SELECT public.adjust_stock_atomic($1, $2::jsonb)", [
            tenantId,
            JSON.stringify({ ...entry.payload, actor_id: entry.user_id }),
          ]);
        } else if (entry.op === "record_production") {
          await client.query("SELECT public.record_production_batch_atomic($1, $2::jsonb)", [
            tenantId,
            JSON.stringify({ ...entry.payload, idempotency_key: entry.idempotency_key, created_by: entry.user_id }),
          ]);
        } else if (entry.op === "receive_transfer") {
          const p = entry.payload as { transfer_id: string; received: unknown };
          await client.query("SELECT public.receive_stock_transfer_atomic($1, $2, $3, $4::jsonb)", [
            tenantId,
            p.transfer_id,
            entry.user_id,
            JSON.stringify(p.received),
          ]);
        }
      });

      results.push({ idempotency_key: entry.idempotency_key, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sync failed";
      const isConflict =
        msg.startsWith("CONFLICT:") ||
        msg.includes("INSUFFICIENT_STOCK") ||
        msg.includes("Duplicate or stale") ||
        msg.includes("not in dispatched state");
      results.push({
        idempotency_key: entry.idempotency_key,
        ok: false,
        conflict: isConflict,
        error: msg.replace(/^CONFLICT:/, ""),
      });
    }
  }

  return NextResponse.json({ results });
}
