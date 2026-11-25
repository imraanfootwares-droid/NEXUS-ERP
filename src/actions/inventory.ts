"use server";

import { revalidatePath } from "next/cache";
import { assertAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import { buildVariantSku } from "@/lib/catalog/verticals";
import { withTenantTx } from "@/lib/db";
import { pgFriendlyMessage } from "@/lib/db/errors";
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
  /** undefined = leave unchanged, null/"" = no supplier */
  supplierId?: string | null;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.manage", { isMutation: true });

  const modelCode = input.modelCode?.trim().toUpperCase() ?? "";
  const name = input.name?.trim() ?? "";
  if (!modelCode) return { ok: false as const, error: "Model / Article Code is required." };
  if (!name) return { ok: false as const, error: "Product name is required." };
  const gst = Number(input.gstRate);
  if (!Number.isFinite(gst) || gst < 0 || gst > 40) return { ok: false as const, error: "GST % must be between 0 and 40." };
  for (const v of [input.mrp, input.sellingPrice, input.wholesalePrice, input.costPrice]) {
    if (v !== undefined && (!Number.isFinite(Number(v)) || Number(v) < 0)) {
      return { ok: false as const, error: "Prices must be valid numbers and cannot be negative." };
    }
  }

  try {
  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `UPDATE public.products
         SET model_code = $1, name = $2, category = $3, brand = $4, uom = $5, hsn_code = $6, gst_rate = $7
         WHERE id = $8 AND tenant_id = $9`,
        [
          modelCode,
          name,
          input.category?.trim() || null,
          input.brand?.trim() || null,
          input.uom,
          input.hsnCode?.trim() || null,
          gst,
          input.productId,
          ctx.tenant.id,
        ]
      );
      if (input.supplierId !== undefined) {
        await client.query(
          `UPDATE public.products
           SET supplier_id = (SELECT s.id FROM public.suppliers s WHERE s.id = $1::uuid AND s.tenant_id = $3)
           WHERE id = $2 AND tenant_id = $3`,
          [input.supplierId || null, input.productId, ctx.tenant.id]
        );
      }
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
  } catch (err) {
    const msg = pgFriendlyMessage(err);
    if (msg) return { ok: false as const, error: msg };
    throw err;
  }
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard/billing/new");
  revalidatePath("/dashboard/storefront");
  return { ok: true as const };
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
  revalidatePath(`/s/${ctx.tenant.slug}`);
}

export async function restoreProductAction(productId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.manage", { isMutation: true });

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        "UPDATE public.products SET is_active = true, is_published_web = true WHERE id = $1 AND tenant_id = $2",
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
  revalidatePath(`/s/${ctx.tenant.slug}`);
}

export async function updateSupplierAction(input: {
  id: string;
  name: string;
  phone?: string;
  gstin?: string;
  stateCode?: string;
  address?: string;
  materialType?: string;
  suppliedProducts?: string[];
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { isMutation: true });

  const cleanProducts = Array.from(
    new Set(
      (input.suppliedProducts ?? [])
        .map((p) => p.trim())
        .filter(Boolean)
    )
  );

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `UPDATE public.suppliers
         SET name = $1,
             phone = $2,
             gstin = $3,
             state_code = COALESCE($4, state_code),
             address = $5,
             material_type = $6,
             supplied_products = $7::text[]
         WHERE id = $8 AND tenant_id = $9`,
        [
          input.name.trim(),
          input.phone?.trim() || null,
          input.gstin?.trim().toUpperCase() || null,
          input.stateCode?.trim() || null,
          input.address?.trim() || null,
          input.materialType?.trim() || null,
          cleanProducts,
          input.id,
          ctx.tenant.id,
        ]
      );
    }
  );
  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/customers");
}

export async function deleteSupplierAction(supplierId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { isMutation: true });

  try {
    await withTenantTx(
      { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
      async (client) => {
        await client.query("DELETE FROM public.suppliers WHERE id = $1 AND tenant_id = $2", [
          supplierId,
          ctx.tenant.id,
        ]);
      }
    );
  } catch (err) {
    if ((err as { code?: string })?.code === "23503") {
      return { ok: false as const, error: "This supplier has purchase bills or payments, so it can't be deleted." };
    }
    throw err;
  }
  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/customers");
  return { ok: true as const };
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
  /** Optional: supplier / company this product is bought from. */
  supplierId?: string | null;
  openingStock?: {
    branchId: string;
    quantity: number;
    note?: string;
  };
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "stock.manage", { isMutation: true });

  const modelCode = input.modelCode?.trim().toUpperCase() ?? "";
  if (!modelCode) return { ok: false as const, error: "Model / Article Code is required." };
  if (!input.name?.trim()) return { ok: false as const, error: "Product name is required." };
  const gst = Number(input.gstRate);
  if (!Number.isFinite(gst) || gst < 0 || gst > 40) return { ok: false as const, error: "GST % must be between 0 and 40." };
  for (const v of [input.costPrice, input.mrp, input.sellingPrice, input.wholesalePrice, input.lowStockThreshold]) {
    if (!Number.isFinite(Number(v)) || Number(v) < 0) {
      return { ok: false as const, error: "Prices must be valid numbers and cannot be negative." };
    }
  }
  const openingQty = Number(input.openingStock?.quantity ?? 0);
  if (input.openingStock && (!Number.isFinite(openingQty) || openingQty < 0)) {
    return { ok: false as const, error: "Opening stock must be zero or more." };
  }
  if (input.openingStock?.branchId && openingQty > 0) {
    assertAccess(ctx, "stock.manage", { branchId: input.openingStock.branchId, isMutation: true });
  }

  let created: {
    productId: string;
    variants: Array<{
      variant_id: string;
      product_id: string;
      product_name: string;
      model_code: string;
      supplier_id: string | null;
      attributes: Record<string, string>;
      cost_price: number;
      gst_rate: number;
    }>;
  };
  try {
  created = await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const dup = await client.query(
        "SELECT 1 FROM public.products WHERE tenant_id = $1 AND model_code = $2 LIMIT 1",
        [ctx.tenant.id, modelCode]
      );
      if (dup.rowCount) {
        throw Object.assign(new Error("duplicate model code"), { code: "23505", constraint: "products_tenant_id_model_code_key" });
      }
      const pRes = await client.query<{ id: string }>(
        `INSERT INTO public.products (tenant_id, model_code, name, category, brand, uom, hsn_code, gst_rate, custom_fields, supplier_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                 (SELECT s.id FROM public.suppliers s WHERE s.id = $10::uuid AND s.tenant_id = $1))
         RETURNING id`,
        [
          ctx.tenant.id,
          modelCode,
          input.name.trim(),
          input.category?.trim() || null,
          input.brand?.trim() || null,
          input.uom,
          input.hsnCode?.trim() || null,
          gst,
          JSON.stringify(input.customFields ?? {}),
          input.supplierId || null,
        ]
      );
      const pid = pRes.rows[0].id;
      const combos = input.combinations.length > 0 ? input.combinations : [{}];
      const createdVariants: Array<{
        variant_id: string;
        product_id: string;
        product_name: string;
        model_code: string;
        supplier_id: string | null;
        attributes: Record<string, string>;
        cost_price: number;
        gst_rate: number;
      }> = [];

      const usedSkus = new Set<string>();
      for (let i = 0; i < combos.length; i++) {
        const attrs = combos[i];
        let sku =
          buildVariantSku(input.modelCode, attrs) +
          (combos.length > 1 && Object.keys(attrs).length === 0 ? `-${i + 1}` : "");
        if (usedSkus.has(sku)) {
          sku = `${sku}-${i + 1}`;
        }
        usedSkus.add(sku);
        const vRes = await client.query<{ id: string }>(
          `INSERT INTO public.product_variants
           (tenant_id, product_id, sku, barcode, attributes, cost_price, avg_cost, mrp, selling_price, wholesale_price, low_stock_threshold)
           VALUES ($1, $2, $3, $3, $4, $5, $5, $6, $7, $8, $9)
           RETURNING id`,
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
        const variantId = vRes.rows[0]?.id;
        if (variantId) {
          createdVariants.push({
            variant_id: variantId,
            product_id: pid,
            product_name: input.name.trim(),
            model_code: modelCode,
            supplier_id: input.supplierId || null,
            attributes: attrs,
            cost_price: Number(input.costPrice || 0),
            gst_rate: gst,
          });
        }
        if (
          variantId &&
          input.openingStock &&
          input.openingStock.branchId &&
          Number(input.openingStock.quantity) > 0
        ) {
          const qty = Number(input.openingStock.quantity);
          await client.query(
            `INSERT INTO public.branch_stock (tenant_id, branch_id, variant_id, quantity)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (branch_id, variant_id)
             DO UPDATE SET quantity = public.branch_stock.quantity + EXCLUDED.quantity, updated_at = now()`,
            [ctx.tenant.id, input.openingStock.branchId, variantId, qty]
          );
          await client.query(
            `INSERT INTO public.stock_ledger
               (tenant_id, branch_id, variant_id, change_qty, balance_after, reason, notes, created_by)
             VALUES ($1, $2, $3, $4, $4, 'opening', $5, $6)`,
            [
              ctx.tenant.id,
              input.openingStock.branchId,
              variantId,
              qty,
              input.openingStock.note || "Opening stock on product creation",
              ctx.user.id,
            ]
          );
        }
      }
      return { productId: pid, variants: createdVariants };
    }
  );
  } catch (err) {
    const msg = pgFriendlyMessage(err);
    if (msg) return { ok: false as const, error: msg };
    throw err;
  }
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard/billing/new");
  revalidatePath("/dashboard/storefront");
  revalidatePath("/dashboard/customers");
  return { ok: true as const, productId: created.productId, variants: created.variants };
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
  address?: string;
  materialType?: string;
  suppliedProducts?: string[];
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { isMutation: true });

  const cleanProducts = Array.from(
    new Set(
      (input.suppliedProducts ?? [])
        .map((p) => p.trim())
        .filter(Boolean)
    )
  );

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `INSERT INTO public.suppliers (tenant_id, name, phone, gstin, state_code, address, material_type, supplied_products)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[])`,
        [
          ctx.tenant.id,
          input.name.trim(),
          input.phone?.trim() || null,
          input.gstin?.trim().toUpperCase() || null,
          input.stateCode?.trim() || null,
          input.address?.trim() || null,
          input.materialType?.trim() || null,
          cleanProducts,
        ]
      );
    }
  );
  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/customers");
}

export async function recordPurchaseAction(input: {
  branchId: string;
  supplierId: string;
  billNumber?: string;
  purchaseType: "finished_goods" | "raw_material";
  paidAmount: number;
  /** How the "paid today" money was given. Defaults to cash. */
  paidMode?: "cash" | "upi" | "bank_transfer" | "card";
  itcCgst: number;
  itcSgst: number;
  itcIgst: number;
  notes?: string;
  items: Array<{ variant_id?: string | null; item_description: string; qty: number; unit_cost: number; gst_rate: number; line_total: number }>;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage", { branchId: input.branchId, isMutation: true });

  const items = (input.items ?? []).filter((i) => Number(i.qty) > 0);
  if (!input.supplierId) return { ok: false as const, error: "Choose the supplier." };
  if (!input.branchId) return { ok: false as const, error: "Choose the branch that receives the goods." };
  if (items.length === 0) return { ok: false as const, error: "Add at least one item with quantity." };
  for (const i of items) {
    if (!i.item_description?.trim()) return { ok: false as const, error: "Every item needs a name." };
    if (!Number.isFinite(Number(i.qty)) || !Number.isFinite(Number(i.unit_cost)) || Number(i.unit_cost) < 0) {
      return { ok: false as const, error: "Check the quantity and price of each item." };
    }
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const cleanItems = items.map((i) => ({
    ...i,
    qty: Number(i.qty),
    unit_cost: round2(Number(i.unit_cost)),
    gst_rate: Math.min(40, Math.max(0, Number(i.gst_rate) || 0)),
    line_total: round2(Number(i.qty) * Number(i.unit_cost)),
  }));
  const totalAmount = round2(cleanItems.reduce((s, i) => s + i.line_total, 0));
  const paid = round2(Math.min(totalAmount, Math.max(0, Number(input.paidAmount) || 0)));

  try {
    const poId = await withTenantTx(
      { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
      async (client) => {
        const sup = await client.query("SELECT 1 FROM public.suppliers WHERE id = $1 AND tenant_id = $2", [
          input.supplierId,
          ctx.tenant.id,
        ]);
        if (!sup.rowCount) throw Object.assign(new Error("supplier"), { code: "23503" });

        const res = await client.query<{ id: string }>("SELECT public.record_purchase_atomic($1, $2::jsonb) AS id", [
          ctx.tenant.id,
          JSON.stringify({
            idempotency_key: crypto.randomUUID(),
            branch_id: input.branchId,
            supplier_id: input.supplierId,
            bill_number: input.billNumber?.trim() || null,
            purchase_type: input.purchaseType,
            total_amount: totalAmount,
            itc_cgst: input.itcCgst,
            itc_sgst: input.itcSgst,
            itc_igst: input.itcIgst,
            paid_amount: paid,
            notes: input.notes?.trim() || null,
            created_by: ctx.user.id,
            items: cleanItems,
          }),
        ]);
        const id = res.rows[0].id;
        // The RPC already lowers the supplier due by the paid amount; record that money
        // as a payment row too so the supplier ledger shows it.
        if (paid > 0) {
          await client.query(
            `INSERT INTO public.supplier_payments (tenant_id, supplier_id, purchase_order_id, mode, amount, reference_no, notes, recorded_by)
             VALUES ($1, $2, $3, $4, $5, $6, 'Paid with purchase bill', $7)`,
            [ctx.tenant.id, input.supplierId, id, input.paidMode ?? "cash", paid, input.billNumber?.trim() || null, ctx.user.id]
          );
        }
        // Remember where each product comes from (only when not already set).
        const variantIds = cleanItems.map((i) => i.variant_id).filter((v): v is string => Boolean(v));
        if (variantIds.length > 0) {
          await client.query(
            `UPDATE public.products p SET supplier_id = $1
             WHERE p.tenant_id = $2 AND p.supplier_id IS NULL
               AND p.id IN (SELECT pv.product_id FROM public.product_variants pv WHERE pv.id = ANY($3::uuid[]) AND pv.tenant_id = $2)`,
            [input.supplierId, ctx.tenant.id, variantIds]
          );
        }
        return id;
      }
    );
    revalidatePath("/dashboard/operations");
    revalidatePath("/dashboard/stock");
    revalidatePath("/dashboard/customers");
    revalidatePath(`/dashboard/customers/ledger/supplier/${input.supplierId}`);
    return { ok: true as const, purchaseId: poId, total: totalAmount };
  } catch (err) {
    const msg = pgFriendlyMessage(err);
    if (msg) return { ok: false as const, error: msg };
    throw err;
  }
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
  revalidatePath("/dashboard/customers");
}

export async function getSupplierHistoryAction(supplierId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "suppliers.manage");

  return withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const res = await client.query<{
        id: string;
        bill_number: string | null;
        purchase_type: string;
        total_amount: string;
        paid_amount: string;
        created_at: string;
      }>(
        `SELECT id, bill_number, purchase_type, total_amount::text, paid_amount::text, created_at
         FROM public.purchase_orders
         WHERE supplier_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC
         LIMIT 50`,
        [supplierId, ctx.tenant.id]
      );
      return res.rows;
    }
  );
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
