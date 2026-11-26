import type { PoolClient } from "pg";
import type { LedgerItemLine } from "@/lib/ledger/party-ledger";

export type RevisionEntityType = "invoice" | "purchase" | "ledger_entry";
export type RevisionAction = "created" | "edited" | "reverted" | "deleted" | "cancelled";

export interface RevisionDiffItem {
  field: string;
  before: string;
  after: string;
}

export interface RevisionRow {
  id: string;
  entity_type: RevisionEntityType;
  entity_id: string;
  entity_label: string | null;
  version_no: number;
  action: RevisionAction;
  summary: string;
  changes_json: RevisionDiffItem[];
  before_snapshot?: Record<string, unknown>;
  after_snapshot?: Record<string, unknown> | null;
  reverted_from_version: number | null;
  actor_name: string | null;
  created_at: string;
}

export interface InvoiceItemSnapshot {
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  hsn_code: string | null;
  qty: number;
  unit_price: number;
  discount_amount: number;
  taxable_value: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  line_total: number;
}

export interface InvoicePaymentSnapshot {
  mode: "cash" | "upi" | "card" | "bank_transfer";
  amount: number;
  reference_no?: string | null;
}

export interface InvoiceSnapshot {
  id: string;
  branch_id: string;
  invoice_number: string | null;
  invoice_type: "sale" | "return_credit_note" | "estimate_bill_of_supply";
  customer_id: string | null;
  customer_snapshot: {
    name?: string | null;
    phone?: string | null;
    gstin?: string | null;
    state_code?: string | null;
    address?: string | null;
    ship_to_name?: string | null;
    ship_to_address?: string | null;
    custom_logo_data_url?: string | null;
  };
  tax_mode: "inclusive" | "exclusive" | "none";
  supply_type: "intra_state" | "inter_state";
  subtotal: number;
  discount_type: "percent" | "flat" | null;
  discount_value: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  round_off: number;
  grand_total: number;
  paid_amount: number;
  due_amount: number;
  credit_redeemed: number;
  status: string;
  eway_bill_no: string | null;
  notes: string | null;
  items: InvoiceItemSnapshot[];
  payments: InvoicePaymentSnapshot[];
}

export interface PurchaseItemSnapshot {
  variant_id: string | null;
  item_description: string;
  qty: number;
  unit_cost: number;
  gst_rate: number;
  line_total: number;
}

export interface PurchaseSnapshot {
  id: string;
  branch_id: string;
  supplier_id: string;
  bill_number: string | null;
  purchase_type: "finished_goods" | "raw_material";
  total_amount: number;
  paid_amount: number;
  itc_cgst: number;
  itc_sgst: number;
  itc_igst: number;
  notes: string | null;
  items: PurchaseItemSnapshot[];
}

export interface LedgerEntrySnapshot {
  id: string | null;
  party_type: "customer" | "supplier";
  party_id: string;
  source_type: "invoice" | "purchase" | "payment" | "manual";
  source_id: string | null;
  entry_date: string;
  voucher_no: string;
  particulars: string;
  debit: number;
  credit: number;
  extra_fields: Record<string, string>;
  items: LedgerItemLine[];
}

const fmtRs = (n: number) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function diffInvoiceSnapshots(before: InvoiceSnapshot, after: InvoiceSnapshot): {
  summary: string;
  changes: RevisionDiffItem[];
} {
  const changes: RevisionDiffItem[] = [];

  const oldCust = before.customer_snapshot?.name || "Walk-In Customer";
  const newCust = after.customer_snapshot?.name || "Walk-In Customer";
  if (oldCust !== newCust) {
    changes.push({ field: "Customer", before: oldCust, after: newCust });
  }
  if ((before.customer_snapshot?.gstin || "") !== (after.customer_snapshot?.gstin || "")) {
    changes.push({
      field: "Buyer GSTIN",
      before: before.customer_snapshot?.gstin || "None",
      after: after.customer_snapshot?.gstin || "None",
    });
  }
  if ((before.customer_snapshot?.address || "") !== (after.customer_snapshot?.address || "")) {
    changes.push({
      field: "Billing Address",
      before: before.customer_snapshot?.address || "None",
      after: after.customer_snapshot?.address || "None",
    });
  }
  if ((before.customer_snapshot?.ship_to_address || "") !== (after.customer_snapshot?.ship_to_address || "")) {
    changes.push({
      field: "Delivery Address",
      before: before.customer_snapshot?.ship_to_address || "Same as billing",
      after: after.customer_snapshot?.ship_to_address || "Same as billing",
    });
  }
  if (before.invoice_type !== after.invoice_type) {
    const lbl = (t: string) => (t === "estimate_bill_of_supply" ? "Normal Bill" : t === "sale" ? "GST Bill" : t);
    changes.push({ field: "Bill Type", before: lbl(before.invoice_type), after: lbl(after.invoice_type) });
  }
  if (before.tax_mode !== after.tax_mode) {
    changes.push({ field: "Tax Mode", before: before.tax_mode, after: after.tax_mode });
  }
  if (Math.abs(before.discount_amount - after.discount_amount) > 0.005) {
    changes.push({ field: "Discount", before: fmtRs(before.discount_amount), after: fmtRs(after.discount_amount) });
  }
  if (Math.abs(before.grand_total - after.grand_total) > 0.005) {
    changes.push({ field: "Grand Total", before: fmtRs(before.grand_total), after: fmtRs(after.grand_total) });
  }
  if (Math.abs(before.paid_amount - after.paid_amount) > 0.005) {
    changes.push({ field: "Paid Amount", before: fmtRs(before.paid_amount), after: fmtRs(after.paid_amount) });
  }
  if (Math.abs(before.due_amount - after.due_amount) > 0.005) {
    changes.push({ field: "Balance Due", before: fmtRs(before.due_amount), after: fmtRs(after.due_amount) });
  }
  if ((before.notes || "") !== (after.notes || "")) {
    changes.push({ field: "Notes", before: before.notes || "—", after: after.notes || "—" });
  }

  // Compare items by variant_id or product_name
  const keyOf = (it: InvoiceItemSnapshot, idx: number) => it.variant_id || `${it.product_name}::${idx}`;
  const oldMap = new Map(before.items.map((it, idx) => [keyOf(it, idx), it]));
  const newMap = new Map(after.items.map((it, idx) => [keyOf(it, idx), it]));

  for (const [k, oldIt] of oldMap) {
    const newIt = newMap.get(k);
    if (!newIt) {
      changes.push({
        field: `Item: ${oldIt.product_name}`,
        before: `${oldIt.qty} × ${fmtRs(oldIt.unit_price)}`,
        after: "Removed",
      });
    } else if (
      oldIt.qty !== newIt.qty ||
      Math.abs(oldIt.unit_price - newIt.unit_price) > 0.005 ||
      oldIt.gst_rate !== newIt.gst_rate
    ) {
      changes.push({
        field: `Item: ${newIt.product_name}`,
        before: `${oldIt.qty} × ${fmtRs(oldIt.unit_price)} (GST ${oldIt.gst_rate}%)`,
        after: `${newIt.qty} × ${fmtRs(newIt.unit_price)} (GST ${newIt.gst_rate}%)`,
      });
    }
  }
  for (const [k, newIt] of newMap) {
    if (!oldMap.has(k)) {
      changes.push({
        field: `Item: ${newIt.product_name}`,
        before: "Not in bill",
        after: `Added ${newIt.qty} × ${fmtRs(newIt.unit_price)}`,
      });
    }
  }

  const summary =
    changes.length === 0
      ? "Saved bill without field changes"
      : changes
          .slice(0, 3)
          .map((c) => `${c.field}: ${c.before} → ${c.after}`)
          .join(" · ") + (changes.length > 3 ? ` (+${changes.length - 3} more)` : "");

  return { summary, changes };
}

export function diffPurchaseSnapshots(before: PurchaseSnapshot, after: PurchaseSnapshot): {
  summary: string;
  changes: RevisionDiffItem[];
} {
  const changes: RevisionDiffItem[] = [];
  if ((before.bill_number || "") !== (after.bill_number || "")) {
    changes.push({
      field: "Supplier Bill No.",
      before: before.bill_number || "—",
      after: after.bill_number || "—",
    });
  }
  if (Math.abs(before.total_amount - after.total_amount) > 0.005) {
    changes.push({ field: "Bill Total", before: fmtRs(before.total_amount), after: fmtRs(after.total_amount) });
  }
  if (Math.abs(before.paid_amount - after.paid_amount) > 0.005) {
    changes.push({ field: "Paid Amount", before: fmtRs(before.paid_amount), after: fmtRs(after.paid_amount) });
  }
  if ((before.notes || "") !== (after.notes || "")) {
    changes.push({ field: "Notes", before: before.notes || "—", after: after.notes || "—" });
  }

  const keyOf = (it: PurchaseItemSnapshot, idx: number) => it.variant_id || `${it.item_description}::${idx}`;
  const oldMap = new Map(before.items.map((it, idx) => [keyOf(it, idx), it]));
  const newMap = new Map(after.items.map((it, idx) => [keyOf(it, idx), it]));

  for (const [k, oldIt] of oldMap) {
    const newIt = newMap.get(k);
    if (!newIt) {
      changes.push({
        field: `Item: ${oldIt.item_description}`,
        before: `${oldIt.qty} × ${fmtRs(oldIt.unit_cost)}`,
        after: "Removed",
      });
    } else if (oldIt.qty !== newIt.qty || Math.abs(oldIt.unit_cost - newIt.unit_cost) > 0.005) {
      changes.push({
        field: `Item: ${newIt.item_description}`,
        before: `${oldIt.qty} × ${fmtRs(oldIt.unit_cost)}`,
        after: `${newIt.qty} × ${fmtRs(newIt.unit_cost)}`,
      });
    }
  }
  for (const [k, newIt] of newMap) {
    if (!oldMap.has(k)) {
      changes.push({
        field: `Item: ${newIt.item_description}`,
        before: "Not in purchase",
        after: `Added ${newIt.qty} × ${fmtRs(newIt.unit_cost)}`,
      });
    }
  }

  const summary =
    changes.length === 0
      ? "Updated purchase bill"
      : changes
          .slice(0, 3)
          .map((c) => `${c.field}: ${c.before} → ${c.after}`)
          .join(" · ") + (changes.length > 3 ? ` (+${changes.length - 3} more)` : "");

  return { summary, changes };
}

export function diffLedgerEntrySnapshots(before: LedgerEntrySnapshot, after: LedgerEntrySnapshot): {
  summary: string;
  changes: RevisionDiffItem[];
} {
  const changes: RevisionDiffItem[] = [];
  if (before.voucher_no !== after.voucher_no) {
    changes.push({ field: "Voucher / Bill No.", before: before.voucher_no || "—", after: after.voucher_no || "—" });
  }
  if (before.particulars !== after.particulars) {
    changes.push({ field: "Particulars", before: before.particulars || "—", after: after.particulars || "—" });
  }
  if (Math.abs(before.debit - after.debit) > 0.005) {
    changes.push({ field: "Debit", before: fmtRs(before.debit), after: fmtRs(after.debit) });
  }
  if (Math.abs(before.credit - after.credit) > 0.005) {
    changes.push({ field: "Credit", before: fmtRs(before.credit), after: fmtRs(after.credit) });
  }
  if (before.items.length !== after.items.length || JSON.stringify(before.items) !== JSON.stringify(after.items)) {
    changes.push({
      field: "Item Breakdown",
      before: `${before.items.length} item(s)`,
      after: `${after.items.length} item(s)`,
    });
  }
  if (JSON.stringify(before.extra_fields) !== JSON.stringify(after.extra_fields)) {
    changes.push({
      field: "Transport / Extra Details",
      before: Object.values(before.extra_fields).filter(Boolean).join(", ") || "—",
      after: Object.values(after.extra_fields).filter(Boolean).join(", ") || "—",
    });
  }

  const summary =
    changes.length === 0
      ? "Updated ledger entry"
      : changes
          .slice(0, 3)
          .map((c) => `${c.field}: ${c.before} → ${c.after}`)
          .join(" · ") + (changes.length > 3 ? ` (+${changes.length - 3} more)` : "");

  return { summary, changes };
}

/** Computes net stock delta per variant_id (sorted ascending to prevent deadlocks). */
export function computeVariantStockDeltas(
  oldItems: Array<{ variant_id: string | null; qty: number }>,
  newItems: Array<{ variant_id: string | null; qty: number }>,
  direction: "sale" | "purchase"
): Array<{ variantId: string; delta: number }> {
  const oldByVariant = new Map<string, number>();
  for (const it of oldItems) {
    if (!it.variant_id) continue;
    oldByVariant.set(it.variant_id, (oldByVariant.get(it.variant_id) ?? 0) + Number(it.qty || 0));
  }
  const newByVariant = new Map<string, number>();
  for (const it of newItems) {
    if (!it.variant_id) continue;
    newByVariant.set(it.variant_id, (newByVariant.get(it.variant_id) ?? 0) + Number(it.qty || 0));
  }
  const allIds = Array.from(new Set([...oldByVariant.keys(), ...newByVariant.keys()])).sort();
  const deltas: Array<{ variantId: string; delta: number }> = [];
  for (const vid of allIds) {
    const oldQ = oldByVariant.get(vid) ?? 0;
    const newQ = newByVariant.get(vid) ?? 0;
    // For a sale: selling MORE reduces stock (oldQ - newQ < 0); selling LESS puts stock back (oldQ - newQ > 0).
    // For a purchase: buying MORE adds stock (newQ - oldQ > 0); buying LESS removes stock (newQ - oldQ < 0).
    const delta = direction === "sale" ? oldQ - newQ : newQ - oldQ;
    if (Math.abs(delta) > 1e-6) {
      deltas.push({ variantId: vid, delta });
    }
  }
  return deltas;
}

export async function recordBillRevision(
  client: PoolClient,
  params: {
    tenantId: string;
    entityType: RevisionEntityType;
    entityId: string;
    entityLabel?: string | null;
    action: RevisionAction;
    summary: string;
    changes: RevisionDiffItem[];
    beforeSnapshot: unknown;
    afterSnapshot?: unknown;
    revertedFromVersion?: number | null;
    actorId: string;
    actorName: string;
  }
): Promise<number> {
  const verRes = await client.query<{ next_ver: number }>(
    `SELECT COALESCE(MAX(version_no), 0) + 1 AS next_ver
     FROM public.bill_revisions
     WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3`,
    [params.tenantId, params.entityType, params.entityId]
  );
  const versionNo = Number(verRes.rows[0]?.next_ver ?? 1);

  await client.query(
    `INSERT INTO public.bill_revisions
       (tenant_id, entity_type, entity_id, entity_label, version_no, action, summary, changes_json,
        before_snapshot, after_snapshot, reverted_from_version, actor_id, actor_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13)`,
    [
      params.tenantId,
      params.entityType,
      params.entityId,
      params.entityLabel ?? null,
      versionNo,
      params.action,
      params.summary,
      JSON.stringify(params.changes ?? []),
      JSON.stringify(params.beforeSnapshot ?? {}),
      params.afterSnapshot !== undefined ? JSON.stringify(params.afterSnapshot) : null,
      params.revertedFromVersion ?? null,
      params.actorId,
      params.actorName,
    ]
  );

  // Auto-trim older revisions for this record beyond the tenant's configurable caps
  // (default: keep last 50 versions per bill & 180 days retention; editable by Super Admin).
  const capRes = await client.query<{ max_revs: number; retention_days: number }>(
    `SELECT COALESCE(max_revisions_per_bill, 50) AS max_revs,
            COALESCE(revision_retention_days, 180) AS retention_days
     FROM public.tenants WHERE id = $1`,
    [params.tenantId]
  );
  const maxRevs = Math.max(5, Number(capRes.rows[0]?.max_revs ?? 50));
  const retentionDays = Math.max(7, Number(capRes.rows[0]?.retention_days ?? 180));

  const trimBelowVersion = versionNo - maxRevs;
  await client.query(
    `DELETE FROM public.bill_revisions
     WHERE tenant_id = $1 AND entity_type = $2 AND entity_id = $3
       AND (
         version_no <= $4::int
         OR created_at < now() - make_interval(days => $5::int)
       )`,
    [params.tenantId, params.entityType, params.entityId, trimBelowVersion, retentionDays]
  );

  return versionNo;
}
