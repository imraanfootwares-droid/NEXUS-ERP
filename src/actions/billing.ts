"use server";

import { revalidatePath } from "next/cache";
import { canAccess, assertAccess } from "@/lib/auth/access";
import { linkWalkInCustomer } from "@/lib/billing/walk-in-customer";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import { loadInvoiceRenderProps } from "@/lib/billing/invoice-render-props";
import { recordBillRevision } from "@/lib/billing/revisions";
import { moveItemToTrash } from "@/lib/trash/service";
import type { BillTemplateConfig, CustomerRow, PaymentMode } from "@/types/database";

export async function createOrFinalizeInvoiceAction(payload: Record<string, unknown>) {
  const ctx = await getServerSessionContext();
  const isEdit = Boolean(payload.draft_id);

  if (isEdit) {
    assertAccess(ctx, "billing.edit", { branchId: String(payload.branch_id || ""), isMutation: true });
  } else if (payload.invoice_type === "estimate_bill_of_supply") {
    assertAccess(ctx, "billing.create_estimate", { branchId: String(payload.branch_id || ""), isMutation: true });
  } else {
    assertAccess(ctx, "billing.create", { branchId: String(payload.branch_id || ""), isMutation: true });
  }

  if ((Number(payload.discount_amount) || 0) > 0) {
    assertAccess(ctx, "billing.apply_discount", { isMutation: true });
  }

  // Money safety validation before committing to DB
  const items = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];
  if (items.length === 0) {
    throw new Error("Invoice must contain at least one item.");
  }
  for (const it of items) {
    const qty = Number(it.qty);
    const unitPrice = Number(it.unit_price);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error("Each item must have a valid quantity greater than 0.");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      throw new Error("Each item must have a valid non-negative price.");
    }
  }
  const grandTotal = Number(payload.grand_total);
  const paidAmount = Number(payload.paid_amount ?? 0);
  if (!Number.isFinite(grandTotal) || grandTotal < 0) {
    throw new Error("Invalid invoice total.");
  }
  if (!Number.isFinite(paidAmount) || paidAmount < 0) {
    throw new Error("Invalid paid amount.");
  }

  const canSaveCustomer = canAccess(ctx, "customers.manage", { isMutation: true }).allowed;
  const invoiceId = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const linked = canSaveCustomer ? await linkWalkInCustomer(client, ctx.tenant.id, payload) : payload;
      const res = await client.query<{ id: string }>(
        "SELECT public.create_invoice_atomic($1, $2::jsonb) AS id",
        [ctx.tenant.id, JSON.stringify({ ...linked, created_by: ctx.user.id })]
      );
      return res.rows[0].id;
    }
  );

  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/billing/new");
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard");
  return invoiceId;
}

export async function cancelInvoiceAction(invoiceId: string, reason: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.cancel", { isMutation: true });

  const cleanReason = reason.trim() || "Cancelled by admin";
  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const preRes = await client.query(
        "SELECT id, invoice_number, status, grand_total, customer_snapshot FROM public.invoices WHERE id = $1 AND tenant_id = $2",
        [invoiceId, ctx.tenant.id]
      );
      const pre = preRes.rows[0];

      await client.query("SELECT public.cancel_invoice_atomic($1, $2, $3, $4)", [
        ctx.tenant.id,
        invoiceId,
        ctx.user.id,
        cleanReason,
      ]);

      if (pre) {
        await recordBillRevision(client, {
          tenantId: ctx.tenant.id,
          entityType: "invoice",
          entityId: invoiceId,
          entityLabel: pre.invoice_number || "DRAFT",
          action: "cancelled",
          summary: `Cancelled bill ${pre.invoice_number || "DRAFT"} — ${cleanReason}`,
          changes: [{ field: "Status", before: String(pre.status || "active"), after: "cancelled" }],
          beforeSnapshot: { status: pre.status, grand_total: Number(pre.grand_total || 0), customer_snapshot: pre.customer_snapshot },
          afterSnapshot: { status: "cancelled", reason: cleanReason },
          actorId: ctx.user.id,
          actorName: ctx.user.full_name,
        });
      }
    }
  );

  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard");
}

export async function deleteDraftInvoiceAction(invoiceId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.edit", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        "DELETE FROM public.invoices WHERE id = $1 AND tenant_id = $2 AND status = 'draft'",
        [invoiceId, ctx.tenant.id]
      );
    }
  );
  revalidatePath("/dashboard/billing");
}

export async function deleteBillTemplateAction(templateId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "bill_designer.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        "DELETE FROM public.bill_templates WHERE id = $1 AND tenant_id = $2 AND is_default = false",
        [templateId, ctx.tenant.id]
      );
    }
  );
  revalidatePath("/dashboard/bill-designer");
}

export async function updateExpenseAction(input: {
  id: string;
  category: string;
  amount: number;
  mode: PaymentMode;
  note?: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "analytics.view_sales", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `UPDATE public.expenses SET category = $1, amount = $2, mode = $3, note = $4
         WHERE id = $5 AND tenant_id = $6`,
        [input.category.trim(), input.amount, input.mode, input.note?.trim() || null, input.id, ctx.tenant.id]
      );
    }
  );
  revalidatePath("/dashboard/reports");
}

export async function deleteExpenseAction(expenseId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "analytics.view_sales", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      if (ctx.enabledFeatures.trash_bin) {
        const expRes = await client.query<{
          id: string;
          branch_id: string;
          category: string;
          amount: string;
          mode: string;
          expense_date: string;
          note: string | null;
          created_by: string | null;
        }>(
          `SELECT id, branch_id, category, amount::text, mode, expense_date::text, note, created_by
           FROM public.expenses WHERE id = $1 AND tenant_id = $2`,
          [expenseId, ctx.tenant.id]
        );
        const exp = expRes.rows[0];
        if (exp) {
          await moveItemToTrash(client, {
            tenantId: ctx.tenant.id,
            entityType: "expense",
            entityId: exp.id,
            title: `Expense: ${exp.category}`,
            subtitle: `${exp.expense_date} · ${exp.mode.toUpperCase()}${exp.note ? ` · ${exp.note}` : ""}`,
            amount: Number(exp.amount || 0),
            snapshot: { ...exp, amount: Number(exp.amount || 0) },
            deletedBy: ctx.user.id,
            deletedByName: ctx.user.full_name,
          });
        }
      }
      await client.query("DELETE FROM public.expenses WHERE id = $1 AND tenant_id = $2", [
        expenseId,
        ctx.tenant.id,
      ]);
    }
  );
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard/trash");
}

export async function processReturnOrExchangeAction(payload: Record<string, unknown>) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.process_return", { isMutation: true });

  const cnId = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<{ id: string }>(
        "SELECT public.process_return_atomic($1, $2::jsonb) AS id",
        [ctx.tenant.id, JSON.stringify({ ...payload, created_by: ctx.user.id })]
      );
      return res.rows[0].id;
    }
  );

  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard");
  return cnId;
}

export async function getInvoiceItemsForReturnAction(invoiceId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.process_return");

  return withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const [invRes, itemsRes, variantsRes] = await Promise.all([
        client.query<{ id: string; invoice_number: string; customer_id: string | null; supply_type: string; branch_id: string }>(
          "SELECT id, invoice_number, customer_id, supply_type, branch_id FROM public.invoices WHERE id = $1 AND tenant_id = $2",
          [invoiceId, ctx.tenant.id]
        ),
        client.query<{
          id: string;
          variant_id: string | null;
          product_name: string;
          sku: string | null;
          hsn_code: string | null;
          qty: string;
          unit_price: string;
          taxable_value: string;
          gst_rate: string;
          cgst: string;
          sgst: string;
          igst: string;
          line_total: string;
        }>(
          "SELECT id, variant_id, product_name, sku, hsn_code, qty::text, unit_price::text, taxable_value::text, gst_rate::text, cgst::text, sgst::text, igst::text, line_total::text FROM public.invoice_items WHERE invoice_id = $1 AND tenant_id = $2",
          [invoiceId, ctx.tenant.id]
        ),
        client.query<{ id: string; sku: string; product_name: string; attributes: Record<string, string>; selling_price: string }>(
          `SELECT pv.id, pv.sku, p.name AS product_name, pv.attributes, pv.selling_price::text
           FROM public.product_variants pv
           JOIN public.products p ON p.id = pv.product_id
           WHERE pv.tenant_id = $1 AND pv.is_active = true
           ORDER BY p.name, pv.sku LIMIT 200`,
          [ctx.tenant.id]
        ),
      ]);
      return {
        invoice: invRes.rows[0] ?? null,
        items: itemsRes.rows,
        exchangeOptions: variantsRes.rows,
      };
    }
  );
}

export async function collectCustomerDueAction(payload: {
  customerId: string;
  invoiceId?: string | null;
  amount: number;
  mode: PaymentMode;
  referenceNo?: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "customers.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("SELECT public.collect_customer_due_atomic($1, $2::jsonb)", [
        ctx.tenant.id,
        JSON.stringify({
          customer_id: payload.customerId,
          invoice_id: payload.invoiceId ?? null,
          amount: payload.amount,
          mode: payload.mode,
          reference_no: payload.referenceNo ?? null,
          recorded_by: ctx.user.id,
        }),
      ]);
    }
  );

  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/billing");
}

export async function saveBillTemplateAction(input: {
  id?: string;
  name: string;
  format: "a4" | "a5" | "thermal_80mm" | "thermal_58mm";
  isDefault: boolean;
  config: BillTemplateConfig;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "bill_designer.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      if (input.isDefault) {
        const category = input.config.bill_category;
        if (category === "gst" || category === "normal") {
          await client.query(
            `UPDATE public.bill_templates
             SET is_default = false
             WHERE tenant_id = $1
               AND COALESCE(config->>'bill_category', CASE WHEN (config->>'show_gst_summary')::boolean IS FALSE THEN 'normal' ELSE 'gst' END) = $2`,
            [ctx.tenant.id, category]
          );
        } else {
          await client.query("UPDATE public.bill_templates SET is_default = false WHERE tenant_id = $1", [
            ctx.tenant.id,
          ]);
        }
      }
      if (input.id) {
        await client.query(
          "UPDATE public.bill_templates SET name = $1, format = $2, is_default = $3, config = $4 WHERE id = $5 AND tenant_id = $6",
          [input.name, input.format, input.isDefault, JSON.stringify(input.config), input.id, ctx.tenant.id]
        );
      } else {
        await client.query(
          "INSERT INTO public.bill_templates (tenant_id, name, format, is_default, config) VALUES ($1, $2, $3, $4, $5)",
          [ctx.tenant.id, input.name, input.format, input.isDefault, JSON.stringify(input.config)]
        );
      }
    }
  );
  revalidatePath("/dashboard/bill-designer");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/billing/new");
}

export async function savePosScreenLayoutAction(posUi: {
  layout: "grid" | "list";
  show_thumbs: boolean;
  show_hsn_col: boolean;
  quick_pay_modes: PaymentMode[];
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "bill_designer.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const nextBrand = { ...(ctx.tenant.brand_config ?? {}), pos_ui: posUi };
      await client.query("UPDATE public.tenants SET brand_config = $1 WHERE id = $2", [
        JSON.stringify(nextBrand),
        ctx.tenant.id,
      ]);
    }
  );
  revalidatePath("/dashboard/bill-designer");
  revalidatePath("/dashboard/billing/new");
}

export async function recordExpenseAction(input: {
  branchId: string;
  category: string;
  amount: number;
  mode: PaymentMode;
  expenseDate: string;
  note?: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "analytics.view_sales", { branchId: input.branchId, isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `INSERT INTO public.expenses (tenant_id, branch_id, category, amount, mode, expense_date, note, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ctx.tenant.id, input.branchId, input.category, input.amount, input.mode, input.expenseDate, input.note ?? null, ctx.user.id]
      );
    }
  );
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard");
}

export async function closeDayCashAction(input: {
  branchId: string;
  closeDate: string;
  countedCash: number;
  note?: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.cancel", { branchId: input.branchId, isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const payRes = await client.query<{ mode: string; total: string }>(
        `SELECT ip.mode, COALESCE(SUM(ip.amount), 0)::text AS total
         FROM public.invoice_payments ip
         JOIN public.invoices i ON i.id = ip.invoice_id
         WHERE ip.tenant_id = $1 AND i.branch_id = $2 AND i.status <> 'cancelled'
           AND (ip.paid_at AT TIME ZONE 'Asia/Kolkata')::date = $3::date
         GROUP BY ip.mode`,
        [ctx.tenant.id, input.branchId, input.closeDate]
      );

      const expRes = await client.query<{ total: string }>(
        `SELECT COALESCE(SUM(amount), 0)::text AS total FROM public.expenses
         WHERE tenant_id = $1 AND branch_id = $2 AND mode = 'cash' AND expense_date = $3::date`,
        [ctx.tenant.id, input.branchId, input.closeDate]
      );

      const map = Object.fromEntries(payRes.rows.map((r) => [r.mode, Number(r.total)]));
      const cashIn = map.cash ?? 0;
      const expCash = Number(expRes.rows[0]?.total ?? 0);
      const expectedCash = Math.max(0, cashIn - expCash);
      const variance = input.countedCash - expectedCash;

      await client.query(
        `INSERT INTO public.day_closes
         (tenant_id, branch_id, close_date, expected_cash, counted_cash, variance_cash, upi_total, card_total, bank_total, expense_cash, note, closed_by)
         VALUES ($1, $2, $3::date, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          ctx.tenant.id,
          input.branchId,
          input.closeDate,
          expectedCash,
          input.countedCash,
          variance,
          map.upi ?? 0,
          map.card ?? 0,
          map.bank_transfer ?? 0,
          expCash,
          input.note ?? null,
          ctx.user.id,
        ]
      );
    }
  );
  revalidatePath("/dashboard/reports");
}

/** Data for the bill Preview popup on the Billing & Ledger page (same design as Print). */
export async function getInvoicePreviewAction(invoiceId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.view");
  const tenant = ctx.tenant;
  const props = await withTenantTx(
    { tenantId: tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    (client) => loadInvoiceRenderProps(client, tenant, invoiceId)
  );
  if (!props) return { ok: false as const, error: "This bill was not found. It may have been deleted." };
  return { ok: true as const, ...props };
}

/** Fast server-side customer search for the Right Customer Sidebar (scales to 1,000+ customers). */
export async function searchCustomersForBillingAction(
  queryText: string,
  filterType?: "all" | "wholesale" | "retail" | "due"
): Promise<{ customers: CustomerRow[]; total: number }> {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.create");
  const tenant = ctx.tenant;
  const q = queryText.trim();

  return withTenantTx(
    { tenantId: tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const params: unknown[] = [tenant.id];
      const where: string[] = ["tenant_id = $1", "is_active = true"];

      if (q.length > 0) {
        params.push(`%${q}%`);
        const idx = params.length;
        where.push(`(name ILIKE $${idx} OR COALESCE(phone, '') ILIKE $${idx} OR COALESCE(gstin, '') ILIKE $${idx})`);
      }
      if (filterType === "wholesale" || filterType === "retail") {
        params.push(filterType);
        where.push(`customer_type = $${params.length}`);
      } else if (filterType === "due") {
        where.push("current_due > 0");
      }

      const whereSql = where.join(" AND ");
      const countRes = await client.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM public.customers WHERE ${whereSql}`,
        params
      );
      const rowsRes = await client.query<CustomerRow>(
        `SELECT id, tenant_id, name, phone, email, gstin, state_code, address, customer_type,
                default_discount_pct, credit_limit, credit_days, current_due, credit_balance, is_active, updated_at
         FROM public.customers WHERE ${whereSql} ORDER BY name ASC LIMIT 60`,
        params
      );
      return {
        customers: rowsRes.rows,
        total: Number(countRes.rows[0]?.cnt ?? 0),
      };
    }
  );
}
