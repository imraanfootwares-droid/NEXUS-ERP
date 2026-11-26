"use server";

import { revalidatePath } from "next/cache";
import { assertAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { withTenantTx } from "@/lib/db";
import {
  computeVariantStockDeltas,
  recordBillRevision,
  type InvoiceSnapshot,
  type PurchaseSnapshot,
} from "@/lib/billing/revisions";
import { purgeExpiredTrashForTenant, type TrashEntityType } from "@/lib/trash/service";

interface ExpenseSnapshot {
  id: string;
  branch_id: string;
  category: string;
  amount: number;
  mode: string;
  expense_date: string;
  note: string | null;
  created_by: string | null;
}

export async function restoreTrashItemAction(trashId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "trash.manage", { isMutation: true });

  const tenantId = ctx.tenant.id;
  const stockFeatureEnabled = Boolean(ctx.enabledFeatures.dynamic_stock_matrix);

  await withTenantTx(
    { tenantId, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await purgeExpiredTrashForTenant(client, tenantId);

      const res = await client.query<{
        id: string;
        entity_type: TrashEntityType;
        entity_id: string;
        title: string;
        snapshot: unknown;
      }>(
        "SELECT id, entity_type, entity_id, title, snapshot FROM public.trash_items WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
        [trashId, tenantId]
      );
      const item = res.rows[0];
      if (!item) throw new Error("This trash item was already restored or expired.");

      if (item.entity_type === "invoice") {
        const snap = item.snapshot as InvoiceSnapshot;
        if (!snap || !snap.id || !snap.branch_id) throw new Error("Saved bill snapshot is incomplete.");

        const exists = await client.query(
          "SELECT 1 FROM public.invoices WHERE id = $1 AND tenant_id = $2 LIMIT 1",
          [snap.id, tenantId]
        );
        if (exists.rowCount) {
          await client.query("DELETE FROM public.trash_items WHERE id = $1 AND tenant_id = $2", [trashId, tenantId]);
          return;
        }

        // Re-insert invoice header
        await client.query("SELECT set_config('app.allow_invoice_revision', 'true', true)");
        await client.query(
          `INSERT INTO public.invoices (
             id, tenant_id, branch_id, invoice_number, invoice_type,
             customer_id, customer_snapshot, tax_mode, supply_type,
             subtotal, discount_type, discount_value, discount_amount,
             taxable_amount, cgst_amount, sgst_amount, igst_amount,
             round_off, grand_total, paid_amount, due_amount, credit_redeemed,
             status, eway_bill_no, notes, created_by
           )
           VALUES (
             $1, $2, $3, $4, $5,
             $6, $7::jsonb, $8, $9,
             $10, $11, $12, $13,
             $14, $15, $16, $17,
             $18, $19, $20, $21, $22,
             $23, $24, $25, $26
           )`,
          [
            snap.id,
            tenantId,
            snap.branch_id,
            snap.invoice_number,
            snap.invoice_type,
            snap.customer_id,
            JSON.stringify(snap.customer_snapshot ?? {}),
            snap.tax_mode,
            snap.supply_type,
            snap.subtotal,
            snap.discount_type,
            snap.discount_value,
            snap.discount_amount,
            snap.taxable_amount,
            snap.cgst_amount,
            snap.sgst_amount,
            snap.igst_amount,
            snap.round_off,
            snap.grand_total,
            snap.paid_amount,
            snap.due_amount,
            snap.credit_redeemed,
            snap.status,
            snap.eway_bill_no,
            snap.notes,
            ctx.user.id,
          ]
        );

        // Re-insert invoice items
        for (const it of snap.items ?? []) {
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
              snap.id,
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

        // Re-insert payments
        if (snap.status !== "draft") {
          for (const p of snap.payments ?? []) {
            if (Number(p.amount) > 0) {
              await client.query(
                `INSERT INTO public.invoice_payments (tenant_id, invoice_id, mode, amount, reference_no, recorded_by)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [tenantId, snap.id, p.mode, p.amount, p.reference_no ?? null, ctx.user.id]
              );
            }
          }
        }

        // Re-apply customer due & credit
        if (snap.customer_id && snap.status !== "draft" && snap.status !== "cancelled") {
          await client.query(
            `UPDATE public.customers
             SET current_due = current_due + $1,
                 credit_balance = GREATEST(0, credit_balance - $2)
             WHERE id = $3 AND tenant_id = $4`,
            [snap.due_amount, snap.credit_redeemed, snap.customer_id, tenantId]
          );
        }

        // Re-deduct stock for finalized sale bills
        if (
          snap.status !== "draft" &&
          snap.status !== "cancelled" &&
          snap.invoice_type !== "estimate_bill_of_supply" &&
          stockFeatureEnabled
        ) {
          const deltas = computeVariantStockDeltas([], snap.items ?? [], "sale");
          for (const { variantId, delta } of deltas) {
            await client.query(
              "SELECT public.apply_stock_delta($1, $2, $3, $4, 'sale', 'invoice', $5, $6, true, NULL, $7)",
              [
                tenantId,
                snap.branch_id,
                variantId,
                delta,
                snap.id,
                ctx.user.id,
                `Restored bill ${snap.invoice_number || ""} from Trash`,
              ]
            );
          }
        }

        await recordBillRevision(client, {
          tenantId,
          entityType: "invoice",
          entityId: snap.id,
          entityLabel: snap.invoice_number || "DRAFT",
          action: "reverted",
          summary: `Restored bill ${snap.invoice_number || "DRAFT"} from Trash`,
          changes: [{ field: "Status", before: "In Trash", after: snap.status }],
          beforeSnapshot: {},
          afterSnapshot: snap,
          actorId: ctx.user.id,
          actorName: ctx.user.full_name,
        });
      } else if (item.entity_type === "purchase") {
        const snap = item.snapshot as PurchaseSnapshot;
        if (!snap || !snap.id || !snap.branch_id || !snap.supplier_id) {
          throw new Error("Saved purchase bill snapshot is incomplete.");
        }

        const exists = await client.query(
          "SELECT 1 FROM public.purchase_orders WHERE id = $1 AND tenant_id = $2 LIMIT 1",
          [snap.id, tenantId]
        );
        if (exists.rowCount) {
          await client.query("DELETE FROM public.trash_items WHERE id = $1 AND tenant_id = $2", [trashId, tenantId]);
          return;
        }

        await client.query(
          `INSERT INTO public.purchase_orders
             (id, tenant_id, branch_id, supplier_id, bill_number, purchase_type,
              total_amount, itc_cgst, itc_sgst, itc_igst, paid_amount, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [
            snap.id,
            tenantId,
            snap.branch_id,
            snap.supplier_id,
            snap.bill_number,
            snap.purchase_type,
            snap.total_amount,
            snap.itc_cgst,
            snap.itc_sgst,
            snap.itc_igst,
            snap.paid_amount,
            snap.notes,
            ctx.user.id,
          ]
        );

        for (const it of snap.items ?? []) {
          await client.query(
            `INSERT INTO public.purchase_items
               (tenant_id, purchase_order_id, variant_id, item_description, qty, unit_cost, gst_rate, line_total)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [tenantId, snap.id, it.variant_id, it.item_description, it.qty, it.unit_cost, it.gst_rate, it.line_total]
          );
        }

        if (snap.paid_amount > 0) {
          await client.query(
            `INSERT INTO public.supplier_payments (tenant_id, supplier_id, purchase_order_id, mode, amount, reference_no, notes, recorded_by)
             VALUES ($1, $2, $3, 'cash', $4, $5, 'Restored with purchase bill', $6)`,
            [tenantId, snap.supplier_id, snap.id, snap.paid_amount, snap.bill_number ?? null, ctx.user.id]
          );
        }

        const unpaid = Math.max(0, snap.total_amount - snap.paid_amount);
        if (unpaid > 0) {
          await client.query(
            "UPDATE public.suppliers SET current_due = current_due + $1 WHERE id = $2 AND tenant_id = $3",
            [unpaid, snap.supplier_id, tenantId]
          );
        }

        if (snap.purchase_type === "finished_goods") {
          const deltas = computeVariantStockDeltas([], snap.items ?? [], "purchase");
          for (const { variantId, delta } of deltas) {
            await client.query(
              "SELECT public.apply_stock_delta($1, $2, $3, $4, 'purchase', 'purchase_order', $5, $6, true, NULL, $7)",
              [
                tenantId,
                snap.branch_id,
                variantId,
                delta,
                snap.id,
                ctx.user.id,
                `Restored purchase ${snap.bill_number || "PO"} from Trash`,
              ]
            );
          }
        }

        await recordBillRevision(client, {
          tenantId,
          entityType: "purchase",
          entityId: snap.id,
          entityLabel: snap.bill_number || "PO",
          action: "reverted",
          summary: `Restored purchase bill ${snap.bill_number || "PO"} from Trash`,
          changes: [{ field: "Status", before: "In Trash", after: "Restored" }],
          beforeSnapshot: {},
          afterSnapshot: snap,
          actorId: ctx.user.id,
          actorName: ctx.user.full_name,
        });
      } else if (item.entity_type === "expense") {
        const snap = item.snapshot as ExpenseSnapshot;
        if (!snap || !snap.branch_id) throw new Error("Saved expense record is incomplete.");
        await client.query(
          `INSERT INTO public.expenses
             (id, tenant_id, branch_id, category, amount, mode, expense_date, note, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9)
           ON CONFLICT (id) DO NOTHING`,
          [
            snap.id,
            tenantId,
            snap.branch_id,
            snap.category,
            snap.amount,
            snap.mode,
            snap.expense_date,
            snap.note,
            snap.created_by ?? ctx.user.id,
          ]
        );
      }

      await client.query("DELETE FROM public.trash_items WHERE id = $1 AND tenant_id = $2", [trashId, tenantId]);
    }
  );

  revalidatePath("/dashboard/trash");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/customers", "layout");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard/reports");
  revalidatePath("/dashboard");
}

export async function permanentlyDeleteTrashItemAction(trashId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "trash.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("DELETE FROM public.trash_items WHERE id = $1 AND tenant_id = $2", [
        trashId,
        ctx.tenant.id,
      ]);
    }
  );
  revalidatePath("/dashboard/trash");
}

export async function emptyTrashAction() {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "trash.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("DELETE FROM public.trash_items WHERE tenant_id = $1", [ctx.tenant.id]);
    }
  );
  revalidatePath("/dashboard/trash");
}
