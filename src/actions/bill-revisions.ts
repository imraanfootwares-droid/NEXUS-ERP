"use server";

import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { assertAccess, canAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { linkWalkInCustomer } from "@/lib/billing/walk-in-customer";
import {
  computeVariantStockDeltas,
  diffInvoiceSnapshots,
  diffPurchaseSnapshots,
  diffLedgerEntrySnapshots,
  recordBillRevision,
  type InvoiceItemSnapshot,
  type InvoicePaymentSnapshot,
  type InvoiceSnapshot,
  type LedgerEntrySnapshot,
  type PurchaseItemSnapshot,
  type PurchaseSnapshot,
  type RevisionEntityType,
  type RevisionRow,
} from "@/lib/billing/revisions";
import { withTenantTx } from "@/lib/db";

async function loadInvoiceSnapshot(
  client: PoolClient,
  tenantId: string,
  invoiceId: string
): Promise<InvoiceSnapshot | null> {
  const invRes = await client.query(
    "SELECT * FROM public.invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
    [invoiceId, tenantId]
  );
  const inv = invRes.rows[0];
  if (!inv) return null;

  const itemsRes = await client.query(
    "SELECT * FROM public.invoice_items WHERE invoice_id = $1 AND tenant_id = $2 ORDER BY id ASC",
    [invoiceId, tenantId]
  );
  const payRes = await client.query(
    "SELECT mode, amount, reference_no FROM public.invoice_payments WHERE invoice_id = $1 AND tenant_id = $2 ORDER BY paid_at ASC",
    [invoiceId, tenantId]
  );

  return {
    id: inv.id,
    branch_id: inv.branch_id,
    invoice_number: inv.invoice_number,
    invoice_type: inv.invoice_type,
    customer_id: inv.customer_id,
    customer_snapshot: inv.customer_snapshot ?? {},
    tax_mode: inv.tax_mode,
    supply_type: inv.supply_type,
    subtotal: Number(inv.subtotal || 0),
    discount_type: inv.discount_type ?? null,
    discount_value: Number(inv.discount_value || 0),
    discount_amount: Number(inv.discount_amount || 0),
    taxable_amount: Number(inv.taxable_amount || 0),
    cgst_amount: Number(inv.cgst_amount || 0),
    sgst_amount: Number(inv.sgst_amount || 0),
    igst_amount: Number(inv.igst_amount || 0),
    round_off: Number(inv.round_off || 0),
    grand_total: Number(inv.grand_total || 0),
    paid_amount: Number(inv.paid_amount || 0),
    due_amount: Number(inv.due_amount || 0),
    credit_redeemed: Number(inv.credit_redeemed || 0),
    status: inv.status,
    eway_bill_no: inv.eway_bill_no ?? null,
    notes: inv.notes ?? null,
    items: itemsRes.rows.map((it): InvoiceItemSnapshot => ({
      variant_id: it.variant_id ?? null,
      product_name: it.product_name,
      sku: it.sku ?? null,
      hsn_code: it.hsn_code ?? null,
      qty: Number(it.qty || 0),
      unit_price: Number(it.unit_price || 0),
      discount_amount: Number(it.discount_amount || 0),
      taxable_value: Number(it.taxable_value || 0),
      gst_rate: Number(it.gst_rate || 0),
      cgst: Number(it.cgst || 0),
      sgst: Number(it.sgst || 0),
      igst: Number(it.igst || 0),
      line_total: Number(it.line_total || 0),
    })),
    payments: payRes.rows.map((p): InvoicePaymentSnapshot => ({
      mode: p.mode,
      amount: Number(p.amount || 0),
      reference_no: p.reference_no ?? null,
    })),
  };
}

async function applyInvoiceSnapshotUpdate(
  client: PoolClient,
  params: {
    tenantId: string;
    actorId: string;
    actorName: string;
    allowNegativeStock: boolean;
    stockFeatureEnabled: boolean;
    before: InvoiceSnapshot;
    after: InvoiceSnapshot;
    action: "edited" | "reverted";
    revertedFromVersion?: number | null;
  }
) {
  const { tenantId, actorId, actorName, allowNegativeStock, stockFeatureEnabled, before, after, action, revertedFromVersion } = params;

  if (before.status === "cancelled") {
    throw new Error("Cancelled bills cannot be edited.");
  }
  if (before.invoice_type === "return_credit_note") {
    throw new Error("Credit notes cannot be edited directly.");
  }
  const childCn = await client.query(
    "SELECT 1 FROM public.invoices WHERE parent_invoice_id = $1 AND tenant_id = $2 AND status <> 'cancelled' LIMIT 1",
    [before.id, tenantId]
  );
  if (childCn.rowCount) {
    throw new Error("This bill already has a Return / Credit Note linked to it and cannot be modified.");
  }

  // Compute due & status
  const dueAmount = Math.max(0, Number((after.grand_total - after.paid_amount - after.credit_redeemed).toFixed(2)));
  const status =
    before.status === "draft"
      ? "draft"
      : dueAmount === 0
      ? "paid"
      : after.paid_amount + after.credit_redeemed > 0
      ? "partial"
      : "unpaid";

  const finalAfter: InvoiceSnapshot = {
    ...after,
    id: before.id,
    branch_id: before.branch_id,
    invoice_number: before.invoice_number,
    due_amount: dueAmount,
    status,
  };

  // 1. Adjust customer balances atomically (deterministic lock order prevents deadlocks)
  if (before.status !== "draft") {
    const custIds = Array.from(new Set([before.customer_id, finalAfter.customer_id].filter(Boolean) as string[])).sort();
    for (const cid of custIds) {
      await client.query("SELECT id FROM public.customers WHERE id = $1 AND tenant_id = $2 FOR UPDATE", [cid, tenantId]);
    }
    if (before.customer_id) {
      await client.query(
        `UPDATE public.customers
         SET current_due = GREATEST(0, current_due - $1),
             credit_balance = credit_balance + $2
         WHERE id = $3 AND tenant_id = $4`,
        [before.due_amount, before.credit_redeemed, before.customer_id, tenantId]
      );
    }
    if (finalAfter.customer_id) {
      const cRes = await client.query<{ credit_balance: string }>(
        "SELECT credit_balance::text FROM public.customers WHERE id = $1 AND tenant_id = $2",
        [finalAfter.customer_id, tenantId]
      );
      const availCredit = Number(cRes.rows[0]?.credit_balance ?? 0);
      if (finalAfter.credit_redeemed > availCredit + 0.01) {
        throw new Error("Customer does not have enough credit balance for this edit.");
      }
      await client.query(
        `UPDATE public.customers
         SET current_due = current_due + $1,
             credit_balance = GREATEST(0, credit_balance - $2)
         WHERE id = $3 AND tenant_id = $4`,
        [finalAfter.due_amount, finalAfter.credit_redeemed, finalAfter.customer_id, tenantId]
      );
    }
  }

  // 2. Apply net stock deltas per variant_id (only for finalized sale bills when stock tracking is active)
  // Note: estimate_bill_of_supply (Normal Bill) does not deduct stock in create_invoice_atomic.
  let hasOversold = false;
  if (before.status !== "draft" && stockFeatureEnabled) {
    const beforeStockItems = before.invoice_type === "estimate_bill_of_supply" ? [] : before.items;
    const afterStockItems = finalAfter.invoice_type === "estimate_bill_of_supply" ? [] : finalAfter.items;
    const deltas = computeVariantStockDeltas(beforeStockItems, afterStockItems, "sale");
    for (const { variantId, delta } of deltas) {
      const balRes = await client.query<{ bal: string }>(
        "SELECT public.apply_stock_delta($1, $2, $3, $4, $5, $6, $7, $8, $9, NULL, $10)::text AS bal",
        [
          tenantId,
          before.branch_id,
          variantId,
          delta,
          delta > 0 ? "return" : "sale",
          "invoice",
          before.id,
          actorId,
          allowNegativeStock || delta > 0,
          `${action === "reverted" ? "Reverted" : "Edited"} bill ${before.invoice_number || ""}`.trim(),
        ]
      );
      if (Number(balRes.rows[0]?.bal ?? 0) < 0) hasOversold = true;
    }
  }

  // 3. Update invoice header
  await client.query(
    `UPDATE public.invoices SET
       invoice_type = $1,
       customer_id = $2,
       customer_snapshot = $3::jsonb,
       tax_mode = $4,
       supply_type = $5,
       subtotal = $6,
       discount_type = $7,
       discount_value = $8,
       discount_amount = $9,
       taxable_amount = $10,
       cgst_amount = $11,
       sgst_amount = $12,
       igst_amount = $13,
       round_off = $14,
       grand_total = $15,
       paid_amount = $16,
       due_amount = $17,
       credit_redeemed = $18,
       status = $19,
       has_oversold = $20,
       eway_bill_no = $21,
       notes = $22
     WHERE id = $23 AND tenant_id = $24`,
    [
      finalAfter.invoice_type,
      finalAfter.customer_id,
      JSON.stringify(finalAfter.customer_snapshot ?? {}),
      finalAfter.tax_mode,
      finalAfter.supply_type,
      finalAfter.subtotal,
      finalAfter.discount_type,
      finalAfter.discount_value,
      finalAfter.discount_amount,
      finalAfter.taxable_amount,
      finalAfter.cgst_amount,
      finalAfter.sgst_amount,
      finalAfter.igst_amount,
      finalAfter.round_off,
      finalAfter.grand_total,
      finalAfter.paid_amount,
      finalAfter.due_amount,
      finalAfter.credit_redeemed,
      finalAfter.status,
      hasOversold,
      finalAfter.eway_bill_no,
      finalAfter.notes,
      before.id,
      tenantId,
    ]
  );

  // 4. Replace invoice items
  await client.query("DELETE FROM public.invoice_items WHERE invoice_id = $1 AND tenant_id = $2", [before.id, tenantId]);
  for (const it of finalAfter.items) {
    let avgCost = 0;
    if (it.variant_id) {
      const cRes = await client.query<{ avg_cost: string }>(
        "SELECT avg_cost::text FROM public.product_variants WHERE id = $1 AND tenant_id = $2",
        [it.variant_id, tenantId]
      );
      avgCost = Number(cRes.rows[0]?.avg_cost ?? 0);
    }
    await client.query(
      `INSERT INTO public.invoice_items
         (tenant_id, invoice_id, variant_id, product_name, sku, hsn_code, qty, unit_price,
          cost_price_snapshot, discount_amount, taxable_value, gst_rate, cgst, sgst, igst, line_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        tenantId,
        before.id,
        it.variant_id,
        it.product_name,
        it.sku,
        it.hsn_code,
        it.qty,
        it.unit_price,
        avgCost,
        it.discount_amount,
        it.taxable_value,
        it.gst_rate,
        it.cgst,
        it.sgst,
        it.igst,
        it.line_total,
      ]
    );
  }

  // 5. Replace payments for finalized bills
  if (before.status !== "draft") {
    await client.query("DELETE FROM public.invoice_payments WHERE invoice_id = $1 AND tenant_id = $2", [before.id, tenantId]);
    for (const p of finalAfter.payments) {
      if (Number(p.amount) > 0) {
        await client.query(
          `INSERT INTO public.invoice_payments (tenant_id, invoice_id, mode, amount, reference_no, recorded_by)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [tenantId, before.id, p.mode, p.amount, p.reference_no ?? null, actorId]
        );
      }
    }
  }

  // 6. Save immutable revision entry
  const diff = diffInvoiceSnapshots(before, finalAfter);
  await recordBillRevision(client, {
    tenantId,
    entityType: "invoice",
    entityId: before.id,
    entityLabel: before.invoice_number || "DRAFT",
    action,
    summary:
      action === "reverted" && revertedFromVersion
        ? `Reverted to before Version ${revertedFromVersion} (${diff.summary})`
        : diff.summary,
    changes: diff.changes,
    beforeSnapshot: before,
    afterSnapshot: finalAfter,
    revertedFromVersion: revertedFromVersion ?? null,
    actorId,
    actorName,
  });

  return finalAfter.id;
}

/** Edit an existing finalized (or draft) bill with full stock/balance reconciliation & version history. */
export async function updateFinalizedInvoiceAction(invoiceId: string, payload: Record<string, unknown>) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.edit", { branchId: String(payload.branch_id || ""), isMutation: true });
  assertAccess(ctx, "billing.history", { branchId: String(payload.branch_id || ""), isMutation: true });

  const items = Array.isArray(payload.items) ? (payload.items as Array<Record<string, unknown>>) : [];
  if (items.length === 0) throw new Error("Bill must contain at least one item.");
  for (const it of items) {
    if (!Number.isFinite(Number(it.qty)) || Number(it.qty) <= 0) throw new Error("Every item must have quantity > 0.");
    if (!Number.isFinite(Number(it.unit_price)) || Number(it.unit_price) < 0) throw new Error("Every item must have a valid price.");
  }

  const canSaveCustomer = canAccess(ctx, "customers.manage", { isMutation: true }).allowed;
  const stockFeatureEnabled = Boolean(ctx.enabledFeatures.auto_stock_and_alerts);
  const allowNeg = Boolean(ctx.tenant.tax_config?.allow_negative_stock);

  const updatedId = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const before = await loadInvoiceSnapshot(client, ctx.tenant.id, invoiceId);
      if (!before) throw new Error("Bill not found.");

      const linked = canSaveCustomer ? await linkWalkInCustomer(client, ctx.tenant.id, payload) : payload;
      const paymentsRaw = Array.isArray(linked.payments)
        ? (linked.payments as Array<{ mode: InvoicePaymentSnapshot["mode"]; amount: number; reference_no?: string | null }>)
        : [];

      const after: InvoiceSnapshot = {
        id: before.id,
        branch_id: before.branch_id,
        invoice_number: before.invoice_number,
        invoice_type: (linked.invoice_type as InvoiceSnapshot["invoice_type"]) ?? before.invoice_type,
        customer_id: linked.customer_id ? String(linked.customer_id) : null,
        customer_snapshot: (linked.customer_snapshot as InvoiceSnapshot["customer_snapshot"]) ?? {},
        tax_mode: (linked.tax_mode as InvoiceSnapshot["tax_mode"]) ?? before.tax_mode,
        supply_type: (linked.supply_type as InvoiceSnapshot["supply_type"]) ?? before.supply_type,
        subtotal: Number(linked.subtotal ?? 0),
        discount_type: (linked.discount_type as InvoiceSnapshot["discount_type"]) ?? null,
        discount_value: Number(linked.discount_value ?? 0),
        discount_amount: Number(linked.discount_amount ?? 0),
        taxable_amount: Number(linked.taxable_amount ?? 0),
        cgst_amount: Number(linked.cgst_amount ?? 0),
        sgst_amount: Number(linked.sgst_amount ?? 0),
        igst_amount: Number(linked.igst_amount ?? 0),
        round_off: Number(linked.round_off ?? 0),
        grand_total: Number(linked.grand_total ?? 0),
        paid_amount: Number(linked.paid_amount ?? 0),
        due_amount: 0,
        credit_redeemed: Number(linked.credit_redeemed ?? 0),
        status: before.status,
        eway_bill_no: linked.eway_bill_no ? String(linked.eway_bill_no) : null,
        notes: linked.notes ? String(linked.notes) : before.notes,
        items: items.map((it): InvoiceItemSnapshot => ({
          variant_id: it.variant_id ? String(it.variant_id) : null,
          product_name: String(it.product_name ?? ""),
          sku: it.sku ? String(it.sku) : null,
          hsn_code: it.hsn_code ? String(it.hsn_code) : null,
          qty: Number(it.qty ?? 0),
          unit_price: Number(it.unit_price ?? 0),
          discount_amount: Number(it.discount_amount ?? 0),
          taxable_value: Number(it.taxable_value ?? 0),
          gst_rate: Number(it.gst_rate ?? 0),
          cgst: Number(it.cgst ?? 0),
          sgst: Number(it.sgst ?? 0),
          igst: Number(it.igst ?? 0),
          line_total: Number(it.line_total ?? 0),
        })),
        payments: paymentsRaw.filter((p) => Number(p.amount) > 0),
      };

      return applyInvoiceSnapshotUpdate(client, {
        tenantId: ctx.tenant.id,
        actorId: ctx.user.id,
        actorName: ctx.user.full_name,
        allowNegativeStock: allowNeg,
        stockFeatureEnabled,
        before,
        after,
        action: "edited",
      });
    }
  );

  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/billing/new");
  revalidatePath(`/dashboard/billing/${invoiceId}/print`);
  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard");
  return updatedId;
}

/** Revert an invoice back to the exact state stored before a given revision. */
export async function revertInvoiceToVersionAction(invoiceId: string, revisionId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.edit", { isMutation: true });
  assertAccess(ctx, "billing.history", { isMutation: true });

  const stockFeatureEnabled = Boolean(ctx.enabledFeatures.auto_stock_and_alerts);
  const allowNeg = Boolean(ctx.tenant.tax_config?.allow_negative_stock);

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const revRes = await client.query<{ version_no: number; before_snapshot: InvoiceSnapshot }>(
        `SELECT version_no, before_snapshot FROM public.bill_revisions
         WHERE id = $1 AND tenant_id = $2 AND entity_type = 'invoice' AND entity_id = $3`,
        [revisionId, ctx.tenant.id, invoiceId]
      );
      const rev = revRes.rows[0];
      if (!rev || !rev.before_snapshot) throw new Error("Selected history version was not found.");

      const before = await loadInvoiceSnapshot(client, ctx.tenant.id, invoiceId);
      if (!before) throw new Error("Bill not found.");

      await applyInvoiceSnapshotUpdate(client, {
        tenantId: ctx.tenant.id,
        actorId: ctx.user.id,
        actorName: ctx.user.full_name,
        allowNegativeStock: allowNeg,
        stockFeatureEnabled,
        before,
        after: rev.before_snapshot,
        action: "reverted",
        revertedFromVersion: rev.version_no,
      });
    }
  );

  revalidatePath("/dashboard/billing");
  revalidatePath(`/dashboard/billing/${invoiceId}/print`);
  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard");
}

/** Permanently delete an invoice while cleanly restoring stock & customer balance and keeping an audit revision. */
export async function deleteInvoiceAction(invoiceId: string, reason?: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.cancel", { isMutation: true });
  assertAccess(ctx, "billing.history", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const before = await loadInvoiceSnapshot(client, ctx.tenant.id, invoiceId);
      if (!before) throw new Error("Bill not found.");

      const childCn = await client.query(
        "SELECT 1 FROM public.invoices WHERE parent_invoice_id = $1 AND tenant_id = $2 LIMIT 1",
        [invoiceId, ctx.tenant.id]
      );
      if (childCn.rowCount) {
        throw new Error("Cannot delete a bill that has Return / Credit Notes linked to it.");
      }

      // Reverse customer due & credit if active finalized bill
      if (before.customer_id && before.status !== "draft" && before.status !== "cancelled") {
        await client.query(
          `UPDATE public.customers
           SET current_due = GREATEST(0, current_due - $1),
               credit_balance = credit_balance + $2
           WHERE id = $3 AND tenant_id = $4`,
          [before.due_amount, before.credit_redeemed, before.customer_id, ctx.tenant.id]
        );
      }

      // Put back net stock removed by this invoice (using stock_ledger as ground truth)
      if (before.status !== "draft" && before.status !== "cancelled") {
        const slRes = await client.query<{ variant_id: string; net_removed: string }>(
          `SELECT variant_id, (-SUM(change_qty))::text AS net_removed
           FROM public.stock_ledger
           WHERE tenant_id = $1 AND ref_type = 'invoice' AND ref_id = $2
           GROUP BY variant_id
           HAVING SUM(change_qty) < 0
           ORDER BY variant_id ASC`,
          [ctx.tenant.id, invoiceId]
        );
        for (const row of slRes.rows) {
          const qtyBack = Number(row.net_removed || 0);
          if (qtyBack > 0) {
            await client.query(
              "SELECT public.apply_stock_delta($1, $2, $3, $4, 'return', 'invoice_delete', $5, $6, true, NULL, $7)",
              [
                ctx.tenant.id,
                before.branch_id,
                row.variant_id,
                qtyBack,
                invoiceId,
                ctx.user.id,
                reason?.trim() || `Deleted bill ${before.invoice_number || ""}`,
              ]
            );
          }
        }
      }

      // Record deleted snapshot in revision history BEFORE removing the row
      await recordBillRevision(client, {
        tenantId: ctx.tenant.id,
        entityType: "invoice",
        entityId: invoiceId,
        entityLabel: before.invoice_number || "DRAFT",
        action: "deleted",
        summary: `Deleted bill ${before.invoice_number || "DRAFT"} (${before.customer_snapshot?.name || "Walk-In"}, ₹${before.grand_total.toLocaleString("en-IN")})${reason?.trim() ? ` — ${reason.trim()}` : ""}`,
        changes: [
          { field: "Status", before: before.status, after: "Deleted" },
          { field: "Grand Total", before: `₹${before.grand_total.toFixed(2)}`, after: "Removed" },
        ],
        beforeSnapshot: before,
        afterSnapshot: null,
        actorId: ctx.user.id,
        actorName: ctx.user.full_name,
      });

      await client.query(
        "DELETE FROM public.party_ledger_entries WHERE tenant_id = $1 AND source_type = 'invoice' AND source_id = $2",
        [ctx.tenant.id, invoiceId]
      );
      await client.query("DELETE FROM public.invoices WHERE id = $1 AND tenant_id = $2", [invoiceId, ctx.tenant.id]);
    }
  );

  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard");
}

// ═════════════════════════════════════════════════════════════════════════════
// SUPPLIER PURCHASE BILLS — LOAD, EDIT, REVERT & DELETE
// ═════════════════════════════════════════════════════════════════════════════

async function loadPurchaseSnapshot(
  client: PoolClient,
  tenantId: string,
  purchaseId: string
): Promise<PurchaseSnapshot | null> {
  const poRes = await client.query(
    "SELECT * FROM public.purchase_orders WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
    [purchaseId, tenantId]
  );
  const po = poRes.rows[0];
  if (!po) return null;

  const itemsRes = await client.query(
    "SELECT * FROM public.purchase_items WHERE purchase_order_id = $1 AND tenant_id = $2 ORDER BY id ASC",
    [purchaseId, tenantId]
  );

  return {
    id: po.id,
    branch_id: po.branch_id,
    supplier_id: po.supplier_id,
    bill_number: po.bill_number ?? null,
    purchase_type: po.purchase_type,
    total_amount: Number(po.total_amount || 0),
    paid_amount: Number(po.paid_amount || 0),
    itc_cgst: Number(po.itc_cgst || 0),
    itc_sgst: Number(po.itc_sgst || 0),
    itc_igst: Number(po.itc_igst || 0),
    notes: po.notes ?? null,
    items: itemsRes.rows.map((it): PurchaseItemSnapshot => ({
      variant_id: it.variant_id ?? null,
      item_description: it.item_description,
      qty: Number(it.qty || 0),
      unit_cost: Number(it.unit_cost || 0),
      gst_rate: Number(it.gst_rate || 0),
      line_total: Number(it.line_total || 0),
    })),
  };
}

export async function getPurchaseForEditAction(purchaseId: string): Promise<PurchaseSnapshot | null> {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage");
  assertAccess(ctx, "billing.history");

  return withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    (client) => loadPurchaseSnapshot(client, ctx.tenant.id, purchaseId)
  );
}

async function applyPurchaseSnapshotUpdate(
  client: PoolClient,
  params: {
    tenantId: string;
    actorId: string;
    actorName: string;
    before: PurchaseSnapshot;
    after: PurchaseSnapshot;
    action: "edited" | "reverted";
    revertedFromVersion?: number | null;
  }
) {
  const { tenantId, actorId, actorName, before, after, action, revertedFromVersion } = params;

  const totalAmount = after.items.reduce((s, it) => s + Number(it.line_total || 0), 0);
  const paidAmount = Math.min(totalAmount, Math.max(0, Number(after.paid_amount || 0)));
  const finalAfter: PurchaseSnapshot = {
    ...after,
    id: before.id,
    branch_id: before.branch_id,
    supplier_id: before.supplier_id,
    total_amount: Number(totalAmount.toFixed(2)),
    paid_amount: Number(paidAmount.toFixed(2)),
  };

  // 1. Adjust branch stock by net delta per variant (finished goods)
  if (before.purchase_type === "finished_goods") {
    const deltas = computeVariantStockDeltas(before.items, finalAfter.items, "purchase");
    const costByVariant = new Map<string, number>();
    for (const it of finalAfter.items) {
      if (it.variant_id) costByVariant.set(it.variant_id, it.unit_cost);
    }
    for (const { variantId, delta } of deltas) {
      await client.query(
        "SELECT public.apply_stock_delta($1, $2, $3, $4, 'purchase', 'purchase_order', $5, $6, true, $7, $8)",
        [
          tenantId,
          before.branch_id,
          variantId,
          delta,
          before.id,
          actorId,
          delta > 0 ? costByVariant.get(variantId) ?? null : null,
          `${action === "reverted" ? "Reverted" : "Edited"} purchase ${finalAfter.bill_number || "PO"}`,
        ]
      );
    }
  }

  // 2. Adjust supplier current_due by exact unpaid delta
  const oldUnpaid = Math.max(0, before.total_amount - before.paid_amount);
  const newUnpaid = Math.max(0, finalAfter.total_amount - finalAfter.paid_amount);
  const dueDelta = newUnpaid - oldUnpaid;
  if (Math.abs(dueDelta) > 0.005) {
    await client.query(
      "UPDATE public.suppliers SET current_due = GREATEST(0, current_due + $1) WHERE id = $2 AND tenant_id = $3",
      [dueDelta, before.supplier_id, tenantId]
    );
  }

  // 3. Update purchase order & replace items
  await client.query(
    `UPDATE public.purchase_orders
     SET bill_number = $1, total_amount = $2, paid_amount = $3, notes = $4
     WHERE id = $5 AND tenant_id = $6`,
    [finalAfter.bill_number, finalAfter.total_amount, finalAfter.paid_amount, finalAfter.notes, before.id, tenantId]
  );

  await client.query("DELETE FROM public.purchase_items WHERE purchase_order_id = $1 AND tenant_id = $2", [before.id, tenantId]);
  for (const it of finalAfter.items) {
    await client.query(
      `INSERT INTO public.purchase_items
         (tenant_id, purchase_order_id, variant_id, item_description, qty, unit_cost, gst_rate, line_total)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [tenantId, before.id, it.variant_id, it.item_description, it.qty, it.unit_cost, it.gst_rate, it.line_total]
    );
  }

  // Sync linked purchase payment if paid amount changed
  if (Math.abs(finalAfter.paid_amount - before.paid_amount) > 0.005) {
    await client.query(
      "DELETE FROM public.supplier_payments WHERE purchase_order_id = $1 AND tenant_id = $2",
      [before.id, tenantId]
    );
    if (finalAfter.paid_amount > 0) {
      await client.query(
        `INSERT INTO public.supplier_payments (tenant_id, supplier_id, purchase_order_id, mode, amount, notes, recorded_by)
         VALUES ($1, $2, $3, 'cash', $4, $5, $6)`,
        [tenantId, before.supplier_id, before.id, finalAfter.paid_amount, `Payment on edited purchase ${finalAfter.bill_number || "PO"}`, actorId]
      );
    }
  }

  // Clear stale ledger item overrides so updated purchase items appear immediately on the ledger
  await client.query(
    "DELETE FROM public.party_ledger_entries WHERE tenant_id = $1 AND source_type = 'purchase' AND source_id = $2",
    [tenantId, before.id]
  );

  const diff = diffPurchaseSnapshots(before, finalAfter);
  await recordBillRevision(client, {
    tenantId,
    entityType: "purchase",
    entityId: before.id,
    entityLabel: finalAfter.bill_number || before.bill_number || "PO",
    action,
    summary:
      action === "reverted" && revertedFromVersion
        ? `Reverted to before Version ${revertedFromVersion} (${diff.summary})`
        : diff.summary,
    changes: diff.changes,
    beforeSnapshot: before,
    afterSnapshot: finalAfter,
    revertedFromVersion: revertedFromVersion ?? null,
    actorId,
    actorName,
  });
}

export async function updatePurchaseOrderAction(
  purchaseId: string,
  input: {
    billNumber?: string | null;
    paidAmount: number;
    notes?: string | null;
    items: PurchaseItemSnapshot[];
  }
) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { isMutation: true });
  assertAccess(ctx, "billing.history", { isMutation: true });
  if (!input.items || input.items.length === 0) throw new Error("Purchase bill must have at least one item.");

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const before = await loadPurchaseSnapshot(client, ctx.tenant.id, purchaseId);
      if (!before) throw new Error("Purchase bill not found.");

      const after: PurchaseSnapshot = {
        ...before,
        bill_number: input.billNumber?.trim() || null,
        paid_amount: Math.max(0, Number(input.paidAmount || 0)),
        notes: input.notes?.trim() || null,
        items: input.items.map((it) => ({
          variant_id: it.variant_id || null,
          item_description: it.item_description.trim(),
          qty: Number(it.qty),
          unit_cost: Number(it.unit_cost),
          gst_rate: Number(it.gst_rate || 0),
          line_total: Number((Number(it.qty) * Number(it.unit_cost)).toFixed(2)),
        })),
      };

      await applyPurchaseSnapshotUpdate(client, {
        tenantId: ctx.tenant.id,
        actorId: ctx.user.id,
        actorName: ctx.user.full_name,
        before,
        after,
        action: "edited",
      });
    }
  );

  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard");
}

export async function revertPurchaseOrderToVersionAction(purchaseId: string, revisionId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { isMutation: true });
  assertAccess(ctx, "billing.history", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const revRes = await client.query<{ version_no: number; before_snapshot: PurchaseSnapshot }>(
        `SELECT version_no, before_snapshot FROM public.bill_revisions
         WHERE id = $1 AND tenant_id = $2 AND entity_type = 'purchase' AND entity_id = $3`,
        [revisionId, ctx.tenant.id, purchaseId]
      );
      const rev = revRes.rows[0];
      if (!rev || !rev.before_snapshot) throw new Error("Selected history version was not found.");

      const before = await loadPurchaseSnapshot(client, ctx.tenant.id, purchaseId);
      if (!before) throw new Error("Purchase bill not found.");

      await applyPurchaseSnapshotUpdate(client, {
        tenantId: ctx.tenant.id,
        actorId: ctx.user.id,
        actorName: ctx.user.full_name,
        before,
        after: rev.before_snapshot,
        action: "reverted",
        revertedFromVersion: rev.version_no,
      });
    }
  );

  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard");
}

export async function deletePurchaseOrderAction(purchaseId: string, reason?: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { isMutation: true });
  assertAccess(ctx, "billing.history", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const before = await loadPurchaseSnapshot(client, ctx.tenant.id, purchaseId);
      if (!before) throw new Error("Purchase bill not found.");

      // Reverse stock added by this purchase bill
      if (before.purchase_type === "finished_goods") {
        const deltas = computeVariantStockDeltas(before.items, [], "purchase");
        for (const { variantId, delta } of deltas) {
          await client.query(
            "SELECT public.apply_stock_delta($1, $2, $3, $4, 'adjustment', 'purchase_delete', $5, $6, true, NULL, $7)",
            [
              ctx.tenant.id,
              before.branch_id,
              variantId,
              delta,
              purchaseId,
              ctx.user.id,
              reason?.trim() || `Deleted purchase ${before.bill_number || "PO"}`,
            ]
          );
        }
      }

      // Reverse supplier unpaid balance
      const unpaid = Math.max(0, before.total_amount - before.paid_amount);
      if (unpaid > 0) {
        await client.query(
          "UPDATE public.suppliers SET current_due = GREATEST(0, current_due - $1) WHERE id = $2 AND tenant_id = $3",
          [unpaid, before.supplier_id, ctx.tenant.id]
        );
      }

      await recordBillRevision(client, {
        tenantId: ctx.tenant.id,
        entityType: "purchase",
        entityId: purchaseId,
        entityLabel: before.bill_number || "PO",
        action: "deleted",
        summary: `Deleted purchase bill ${before.bill_number || "PO"} (₹${before.total_amount.toLocaleString("en-IN")})${reason?.trim() ? ` — ${reason.trim()}` : ""}`,
        changes: [
          { field: "Purchase Total", before: `₹${before.total_amount.toFixed(2)}`, after: "Deleted" },
        ],
        beforeSnapshot: before,
        afterSnapshot: null,
        actorId: ctx.user.id,
        actorName: ctx.user.full_name,
      });

      await client.query("DELETE FROM public.supplier_payments WHERE purchase_order_id = $1 AND tenant_id = $2", [purchaseId, ctx.tenant.id]);
      await client.query(
        "DELETE FROM public.party_ledger_entries WHERE tenant_id = $1 AND source_type = 'purchase' AND source_id = $2",
        [ctx.tenant.id, purchaseId]
      );
      await client.query("DELETE FROM public.purchase_orders WHERE id = $1 AND tenant_id = $2", [purchaseId, ctx.tenant.id]);
    }
  );

  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard");
}

// ═════════════════════════════════════════════════════════════════════════════
// LEDGER ENTRY REVERT & SHARED HISTORY FETCHERS
// ═════════════════════════════════════════════════════════════════════════════

export async function revertLedgerEntryToVersionAction(entryId: string, revisionId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.history", { isMutation: true });
  const tenantId = ctx.tenant.id;

  await withTenantTx(
    { tenantId, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const revRes = await client.query<{ version_no: number; before_snapshot: LedgerEntrySnapshot }>(
        `SELECT version_no, before_snapshot FROM public.bill_revisions
         WHERE id = $1 AND tenant_id = $2 AND entity_type = 'ledger_entry' AND entity_id = $3`,
        [revisionId, tenantId, entryId]
      );
      const rev = revRes.rows[0];
      if (!rev || !rev.before_snapshot) throw new Error("Selected history version was not found.");

      const curRes = await client.query(
        "SELECT * FROM public.party_ledger_entries WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
        [entryId, tenantId]
      );
      const cur = curRes.rows[0];
      if (!cur) throw new Error("Ledger entry not found.");

      if (cur.party_type === "customer") {
        assertAccess(ctx, "customers.manage", { isMutation: true });
      } else {
        assertAccess(ctx, "suppliers.manage", { isMutation: true });
      }

      const beforeSnap: LedgerEntrySnapshot = {
        id: cur.id,
        party_type: cur.party_type,
        party_id: cur.party_id,
        source_type: cur.source_type,
        source_id: cur.source_id,
        entry_date: cur.entry_date,
        voucher_no: cur.voucher_no || "",
        particulars: cur.particulars || "",
        debit: Number(cur.debit || 0),
        credit: Number(cur.credit || 0),
        extra_fields: cur.extra_fields ?? {},
        items: Array.isArray(cur.items_json) ? cur.items_json : [],
      };
      const target = rev.before_snapshot;

      await client.query(
        `UPDATE public.party_ledger_entries
         SET entry_date = $1, voucher_no = $2, particulars = $3, debit = $4, credit = $5,
             extra_fields = $6::jsonb, items_json = $7::jsonb, updated_by = $8, updated_at = now()
         WHERE id = $9 AND tenant_id = $10`,
        [
          target.entry_date,
          target.voucher_no || null,
          target.particulars || null,
          target.debit,
          target.credit,
          JSON.stringify(target.extra_fields ?? {}),
          JSON.stringify(target.items ?? []),
          ctx.user.id,
          entryId,
          tenantId,
        ]
      );

      if (cur.source_type === "manual") {
        const oldNet = beforeSnap.debit - beforeSnap.credit;
        const newNet = target.debit - target.credit;
        const delta = newNet - oldNet;
        if (Math.abs(delta) > 0.005) {
          const tbl = cur.party_type === "customer" ? "public.customers" : "public.suppliers";
          await client.query(
            `UPDATE ${tbl} SET current_due = GREATEST(0, current_due + $1) WHERE id = $2 AND tenant_id = $3`,
            [delta, cur.party_id, tenantId]
          );
        }
      }

      const diff = diffLedgerEntrySnapshots(beforeSnap, target);
      await recordBillRevision(client, {
        tenantId,
        entityType: "ledger_entry",
        entityId: entryId,
        entityLabel: target.voucher_no || beforeSnap.voucher_no || "ENTRY",
        action: "reverted",
        summary: `Reverted to before Version ${rev.version_no} (${diff.summary})`,
        changes: diff.changes,
        beforeSnapshot: beforeSnap,
        afterSnapshot: target,
        revertedFromVersion: rev.version_no,
        actorId: ctx.user.id,
        actorName: ctx.user.full_name,
      });
    }
  );

  revalidatePath("/dashboard/customers", "layout");
}

export async function getRevisionHistoryAction(
  entityType: RevisionEntityType,
  entityId: string
): Promise<RevisionRow[]> {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.history");
  const tenantId = ctx.tenant.id;
  if (entityType === "invoice") {
    assertAccess(ctx, "billing.view");
  } else {
    if (!canAccess(ctx, "customers.view").allowed && !canAccess(ctx, "suppliers.manage").allowed) {
      throw new Error("Permission denied.");
    }
  }

  return withTenantTx(
    { tenantId, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      // Omit heavy before_snapshot/after_snapshot JSONB blobs from list views (~90% less egress);
      // snapshots are loaded server-side only when a user clicks Revert.
      const res = await client.query<RevisionRow>(
        `SELECT id, entity_type, entity_id, entity_label, version_no, action, summary,
                changes_json, reverted_from_version, actor_name, created_at
         FROM public.bill_revisions
         WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3
         ORDER BY version_no DESC
         LIMIT 50`,
        [tenantId, entityType, entityId]
      );
      return res.rows;
    }
  );
}

export async function getRecentActivityHistoryAction(
  entityType: RevisionEntityType
): Promise<RevisionRow[]> {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "billing.history");
  const tenantId = ctx.tenant.id;
  if (entityType === "invoice") {
    assertAccess(ctx, "billing.view");
  } else {
    if (!canAccess(ctx, "customers.view").allowed && !canAccess(ctx, "suppliers.manage").allowed) {
      throw new Error("Permission denied.");
    }
  }

  return withTenantTx(
    { tenantId, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<RevisionRow>(
        `SELECT id, entity_type, entity_id, entity_label, version_no, action, summary,
                changes_json, reverted_from_version, actor_name, created_at
         FROM public.bill_revisions
         WHERE tenant_id = $1 AND entity_type = $2
         ORDER BY created_at DESC
         LIMIT 60`,
        [tenantId, entityType]
      );
      return res.rows;
    }
  );
}
