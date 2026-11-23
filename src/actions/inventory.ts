"use server";

import { revalidatePath } from "next/cache";
import { assertAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { buildVariantSku } from "@/lib/catalog/verticals";
import { withTenantTx } from "@/lib/db";
import type { PaymentMode, ProductionStage } from "@/types/database";

export async function createCustomerAction(input: {
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  stateCode?: string;
  address?: string;
  customerType: "retail" | "wholesale";
  defaultDiscountPct: number;
  creditLimit: number;
  creditDays: number;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "customers.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `INSERT INTO public.customers
         (tenant_id, name, phone, email, gstin, state_code, address, customer_type, default_discount_pct, credit_limit, credit_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          ctx.tenant.id,
          input.name.trim(),
          input.phone?.trim() || null,
          input.email?.trim() || null,
          input.gstin?.trim().toUpperCase() || null,
          input.stateCode || null,
          input.address?.trim() || null,
          input.customerType,
          input.defaultDiscountPct,
          input.creditLimit,
          input.creditDays,
        ]
      );
    }
  );
  revalidatePath("/dashboard/customers");
}

export async function updateCustomerAction(input: {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  gstin?: string;
  stateCode?: string;
  address?: string;
  customerType: "retail" | "wholesale";
  defaultDiscountPct: number;
  creditLimit: number;
  creditDays: number;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "customers.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `UPDATE public.customers
         SET name = $1, phone = $2, email = $3, gstin = $4, state_code = $5,
             address = $6, customer_type = $7, default_discount_pct = $8,
             credit_limit = $9, credit_days = $10
         WHERE id = $11 AND tenant_id = $12`,
        [
          input.name.trim(),
          input.phone?.trim() || null,
          input.email?.trim() || null,
          input.gstin?.trim().toUpperCase() || null,
          input.stateCode || null,
          input.address?.trim() || null,
          input.customerType,
          input.defaultDiscountPct,
          input.creditLimit,
          input.creditDays,
          input.id,
          ctx.tenant.id,
        ]
      );
    }
  );
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/billing/new");
}

export async function deleteCustomerAction(customerId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "customers.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        "UPDATE public.customers SET is_active = false WHERE id = $1 AND tenant_id = $2",
        [customerId, ctx.tenant.id]
      );
    }
  );
  revalidatePath("/dashboard/customers");
  revalidatePath("/dashboard/billing/new");
}

export async function updateProductAction(input: {
  productId: string;
  modelCode: string;
  name: string;
  category?: string;
  brand?: string;
  uom: string;
  hsnCode?: string;
  gstRate: number;
  mrp?: number;
  sellingPrice?: number;
  wholesalePrice?: number;
  costPrice?: number;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `UPDATE public.products
         SET model_code = $1, name = $2, category = $3, brand = $4, uom = $5, hsn_code = $6, gst_rate = $7
         WHERE id = $8 AND tenant_id = $9`,
        [
          input.modelCode.trim().toUpperCase(),
          input.name.trim(),
          input.category?.trim() || null,
          input.brand?.trim() || null,
          input.uom,
          input.hsnCode || null,
          input.gstRate,
          input.productId,
          ctx.tenant.id,
        ]
      );
      if (
        input.sellingPrice !== undefined ||
        input.wholesalePrice !== undefined ||
        input.mrp !== undefined ||
        input.costPrice !== undefined
      ) {
        await client.query(
          `UPDATE public.product_variants
           SET mrp = COALESCE($1, mrp),
               selling_price = COALESCE($2, selling_price),
               wholesale_price = COALESCE($3, wholesale_price),
               cost_price = COALESCE($4, cost_price)
           WHERE product_id = $5 AND tenant_id = $6`,
          [
            input.mrp ?? null,
            input.sellingPrice ?? null,
            input.wholesalePrice ?? null,
            input.costPrice ?? null,
            input.productId,
            ctx.tenant.id,
          ]
        );
      }
    }
  );
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard/billing/new");
  revalidatePath("/dashboard/storefront");
}

export async function deleteProductAction(productId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        "UPDATE public.products SET is_active = false, is_published_web = false WHERE id = $1 AND tenant_id = $2",
        [productId, ctx.tenant.id]
      );
      await client.query(
        "UPDATE public.product_variants SET is_active = false WHERE product_id = $1 AND tenant_id = $2",
        [productId, ctx.tenant.id]
      );
    }
  );
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard/billing/new");
  revalidatePath("/dashboard/storefront");
}

export async function restoreProductAction(productId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        "UPDATE public.products SET is_active = true WHERE id = $1 AND tenant_id = $2",
        [productId, ctx.tenant.id]
      );
      await client.query(
        "UPDATE public.product_variants SET is_active = true WHERE product_id = $1 AND tenant_id = $2",
        [productId, ctx.tenant.id]
      );
    }
  );
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard/billing/new");
  revalidatePath("/dashboard/storefront");
}

export async function updateSupplierAction(input: {
  id: string;
  name: string;
  phone?: string;
  gstin?: string;
  materialType?: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `UPDATE public.suppliers
         SET name = $1, phone = $2, gstin = $3, material_type = $4
         WHERE id = $5 AND tenant_id = $6`,
        [
          input.name.trim(),
          input.phone?.trim() || null,
          input.gstin?.trim().toUpperCase() || null,
          input.materialType?.trim() || null,
          input.id,
          ctx.tenant.id,
        ]
      );
    }
  );
  revalidatePath("/dashboard/operations");
}

export async function deleteSupplierAction(supplierId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("DELETE FROM public.suppliers WHERE id = $1 AND tenant_id = $2", [
        supplierId,
        ctx.tenant.id,
      ]);
    }
  );
  revalidatePath("/dashboard/operations");
}

export async function createProductWithVariantsAction(input: {
  modelCode: string;
  name: string;
  category?: string;
  brand?: string;
  uom: string;
  hsnCode?: string;
  gstRate: number;
  customFields: Record<string, string | number | boolean | null>;
  costPrice: number;
  mrp: number;
  sellingPrice: number;
  wholesalePrice: number;
  lowStockThreshold: number;
  combinations: Array<Record<string, string>>;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.manage", { isMutation: true });

  const productId = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const pRes = await client.query<{ id: string }>(
        `INSERT INTO public.products (tenant_id, model_code, name, category, brand, uom, hsn_code, gst_rate, custom_fields)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          ctx.tenant.id,
          input.modelCode.trim().toUpperCase(),
          input.name.trim(),
          input.category?.trim() || null,
          input.brand?.trim() || null,
          input.uom,
          input.hsnCode || null,
          input.gstRate,
          JSON.stringify(input.customFields),
        ]
      );
      const pid = pRes.rows[0].id;
      const combos = input.combinations.length > 0 ? input.combinations : [{}];

      for (let i = 0; i < combos.length; i++) {
        const attrs = combos[i];
        const sku = buildVariantSku(input.modelCode, attrs) + (combos.length > 1 && Object.keys(attrs).length === 0 ? `-${i + 1}` : "");
        await client.query(
          `INSERT INTO public.product_variants
           (tenant_id, product_id, sku, barcode, attributes, cost_price, avg_cost, mrp, selling_price, wholesale_price, low_stock_threshold)
           VALUES ($1, $2, $3, $3, $4, $5, $5, $6, $7, $8, $9)`,
          [
            ctx.tenant.id,
            pid,
            sku,
            JSON.stringify(attrs),
            input.costPrice,
            input.mrp,
            input.sellingPrice,
            input.wholesalePrice,
            input.lowStockThreshold,
          ]
        );
      }
      return pid;
    }
  );
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard/billing/new");
  revalidatePath("/dashboard/storefront");
  return productId;
}

export async function adjustStockAction(input: {
  branchId: string;
  variantId: string;
  changeQty: number;
  reason: "opening" | "adjustment" | "stock_count";
  notes?: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.record_incoming", { branchId: input.branchId, isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("SELECT public.adjust_stock_atomic($1, $2::jsonb)", [
        ctx.tenant.id,
        JSON.stringify({
          branch_id: input.branchId,
          variant_id: input.variantId,
          change_qty: input.changeQty,
          reason: input.reason,
          notes: input.notes ?? null,
          actor_id: ctx.user.id,
        }),
      ]);
    }
  );
  revalidatePath("/dashboard/stock");
}

export async function createImportJobAction(branchId: string, totalRows: number): Promise<string> {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.bulk_import", { branchId, isMutation: true });

  return withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<{ id: string }>(
        `INSERT INTO public.import_jobs (tenant_id, branch_id, status, total_rows, created_by)
         VALUES ($1, $2, 'staging', $3, $4) RETURNING id`,
        [ctx.tenant.id, branchId, totalRows, ctx.user.id]
      );
      return res.rows[0].id;
    }
  );
}

export async function stageImportChunkAction(
  jobId: string,
  rows: Array<{ rowNo: number; payload: Record<string, unknown> }>
) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.bulk_import", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      for (const r of rows) {
        await client.query(
          "INSERT INTO public.import_staging (job_id, tenant_id, row_no, payload) VALUES ($1, $2, $3, $4)",
          [jobId, ctx.tenant.id, r.rowNo, JSON.stringify(r.payload)]
        );
      }
    }
  );
}

export async function commitImportJobAction(jobId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.bulk_import", { isMutation: true });

  const result = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<{ out: { committed_rows: number } }>(
        "SELECT public.bulk_upsert_stock_atomic($1, $2, $3) AS out",
        [ctx.tenant.id, jobId, ctx.user.id]
      );
      return res.rows[0].out;
    }
  );

  revalidatePath("/dashboard/stock");
  return result;
}

export async function recordProductionBatchAction(input: {
  branchId: string;
  stage: ProductionStage;
  karigarUnitName?: string;
  rawMaterialNotes?: string;
  items: Array<{ variant_id: string; qty: number; unit_cost: number }>;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "production.record", { branchId: input.branchId, isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("SELECT public.record_production_batch_atomic($1, $2::jsonb)", [
        ctx.tenant.id,
        JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          branch_id: input.branchId,
          stage: input.stage,
          karigar_unit_name: input.karigarUnitName ?? null,
          raw_material_notes: input.rawMaterialNotes ?? null,
          created_by: ctx.user.id,
          items: input.items,
        }),
      ]);
    }
  );
  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/stock");
}

export async function createSupplierAction(input: {
  name: string;
  phone?: string;
  gstin?: string;
  stateCode?: string;
  materialType?: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `INSERT INTO public.suppliers (tenant_id, name, phone, gstin, state_code, material_type)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [ctx.tenant.id, input.name.trim(), input.phone || null, input.gstin?.toUpperCase() || null, input.stateCode || null, input.materialType || null]
      );
    }
  );
  revalidatePath("/dashboard/operations");
}

export async function recordPurchaseAction(input: {
  branchId: string;
  supplierId: string;
  billNumber?: string;
  purchaseType: "finished_goods" | "raw_material";
  paidAmount: number;
  itcCgst: number;
  itcSgst: number;
  itcIgst: number;
  items: Array<{ variant_id?: string | null; item_description: string; qty: number; unit_cost: number; gst_rate: number; line_total: number }>;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { branchId: input.branchId, isMutation: true });

  const totalAmount = input.items.reduce((s, i) => s + i.line_total, 0);
  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("SELECT public.record_purchase_atomic($1, $2::jsonb)", [
        ctx.tenant.id,
        JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          branch_id: input.branchId,
          supplier_id: input.supplierId,
          bill_number: input.billNumber ?? null,
          purchase_type: input.purchaseType,
          total_amount: totalAmount,
          itc_cgst: input.itcCgst,
          itc_sgst: input.itcSgst,
          itc_igst: input.itcIgst,
          paid_amount: input.paidAmount,
          created_by: ctx.user.id,
          items: input.items,
        }),
      ]);
    }
  );
  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/stock");
}

export async function recordSupplierPaymentAction(input: {
  supplierId: string;
  amount: number;
  mode: PaymentMode;
  referenceNo?: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("SELECT public.record_supplier_payment_atomic($1, $2::jsonb)", [
        ctx.tenant.id,
        JSON.stringify({
          idempotency_key: crypto.randomUUID(),
          supplier_id: input.supplierId,
          amount: input.amount,
          mode: input.mode,
          reference_no: input.referenceNo ?? null,
          recorded_by: ctx.user.id,
        }),
      ]);
    }
  );
  revalidatePath("/dashboard/operations");
}

export async function createAndDispatchTransferAction(input: {
  fromBranchId: string;
  toBranchId: string;
  transportName?: string;
  lrNumber?: string;
  vehicleNo?: string;
  ewayBillNo?: string;
  items: Array<{ variant_id: string; qty_sent: number; transfer_price: number; gst_rate: number }>;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "transfers.dispatch", { branchId: input.fromBranchId, isMutation: true });

  const transferId = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const trRes = await client.query<{ id: string }>(
        `INSERT INTO public.stock_transfers
         (tenant_id, doc_number, from_branch_id, to_branch_id, status, transport_name, lr_number, vehicle_no, eway_bill_no, idempotency_key, created_by)
         VALUES ($1, 'DRAFT', $2, $3, 'draft', $4, $5, $6, $7, $8, $9) RETURNING id`,
        [
          ctx.tenant.id,
          input.fromBranchId,
          input.toBranchId,
          input.transportName || null,
          input.lrNumber || null,
          input.vehicleNo || null,
          input.ewayBillNo || null,
          crypto.randomUUID(),
          ctx.user.id,
        ]
      );
      const tid = trRes.rows[0].id;
      for (const it of input.items) {
        await client.query(
          `INSERT INTO public.stock_transfer_items (tenant_id, transfer_id, variant_id, qty_sent, transfer_price, gst_rate)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [ctx.tenant.id, tid, it.variant_id, it.qty_sent, it.transfer_price, it.gst_rate]
        );
      }
      await client.query("SELECT public.dispatch_stock_transfer_atomic($1, $2, $3)", [
        ctx.tenant.id,
        tid,
        ctx.user.id,
      ]);
      return tid;
    }
  );

  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/stock");
  return transferId;
}

export async function receiveTransferAction(
  transferId: string,
  received: Array<{ variant_id: string; qty_received: number; discrepancy_note?: string }>
) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "transfers.receive", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("SELECT public.receive_stock_transfer_atomic($1, $2, $3, $4::jsonb)", [
        ctx.tenant.id,
        transferId,
        ctx.user.id,
        JSON.stringify(received),
      ]);
    }
  );

  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/stock");
}

export async function advanceProductionBatchStageAction(batchId: string, nextStage: ProductionStage) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "production.record", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query("SELECT public.advance_production_batch_stage_atomic($1, $2, $3, $4)", [
        ctx.tenant.id,
        batchId,
        nextStage,
        ctx.user.id,
      ]);
    }
  );
  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/stock");
}

export async function getTransferItemsAction(transferId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "transfers.receive");

  return withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<{
        id: string;
        variant_id: string;
        sku: string;
        product_name: string;
        qty_sent: string;
        qty_received: string;
        discrepancy_note: string | null;
      }>(
        `SELECT sti.id, sti.variant_id, pv.sku, p.name AS product_name,
                sti.qty_sent::text, sti.qty_received::text, sti.discrepancy_note
         FROM public.stock_transfer_items sti
         JOIN public.product_variants pv ON pv.id = sti.variant_id
         JOIN public.products p ON p.id = pv.product_id
         WHERE sti.transfer_id = $1 AND sti.tenant_id = $2
         ORDER BY pv.sku`,
        [transferId, ctx.tenant.id]
      );
      return res.rows;
    }
  );
}

export async function getCustomerHistoryAction(customerId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "customers.view");

  return withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<{
        id: string;
        invoice_number: string | null;
        invoice_type: string;
        grand_total: string;
        paid_amount: string;
        due_amount: string;
        status: string;
        created_at: string;
      }>(
        `SELECT id, invoice_number, invoice_type, grand_total::text, paid_amount::text, due_amount::text, status, created_at
         FROM public.invoices
         WHERE tenant_id = $1 AND customer_id = $2
         ORDER BY created_at DESC
         LIMIT 50`,
        [ctx.tenant.id, customerId]
      );
      return res.rows;
    }
  );
}
