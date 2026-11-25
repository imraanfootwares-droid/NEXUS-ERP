import { describe, expect, it } from "vitest";
import {
  computeVariantStockDeltas,
  diffInvoiceSnapshots,
  diffLedgerEntrySnapshots,
  diffPurchaseSnapshots,
  type InvoiceSnapshot,
  type LedgerEntrySnapshot,
  type PurchaseSnapshot,
} from "../revisions";

function baseInvoice(overrides: Partial<InvoiceSnapshot> = {}): InvoiceSnapshot {
  return {
    id: "inv-1",
    branch_id: "br-1",
    invoice_number: "CHN/26-27/0001",
    invoice_type: "sale",
    customer_id: "cust-1",
    customer_snapshot: {
      name: "Apex Shoes",
      phone: "9876543210",
      gstin: "33ABCDE1234F1Z5",
      state_code: "33",
      address: "Chennai",
      ship_to_name: null,
      ship_to_address: null,
    },
    tax_mode: "inclusive",
    supply_type: "intra_state",
    subtotal: 2000,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    taxable_amount: 1904.76,
    cgst_amount: 47.62,
    sgst_amount: 47.62,
    igst_amount: 0,
    round_off: 0,
    grand_total: 2000,
    paid_amount: 2000,
    due_amount: 0,
    credit_redeemed: 0,
    status: "paid",
    eway_bill_no: null,
    notes: null,
    items: [
      {
        variant_id: "var-b",
        product_name: "AeroStride UK 8",
        sku: "AERO-8",
        hsn_code: "6403",
        qty: 2,
        unit_price: 1000,
        discount_amount: 0,
        taxable_value: 1904.76,
        gst_rate: 5,
        cgst: 47.62,
        sgst: 47.62,
        igst: 0,
        line_total: 2000,
      },
    ],
    payments: [{ mode: "cash", amount: 2000 }],
    ...overrides,
  };
}

describe("diffInvoiceSnapshots", () => {
  it("detects customer, delivery, bill type, totals, and item additions/removals/edits", () => {
    const before = baseInvoice();
    const after = baseInvoice({
      invoice_type: "estimate_bill_of_supply",
      tax_mode: "none",
      customer_snapshot: {
        ...before.customer_snapshot,
        name: "Metro Footwear",
        ship_to_address: "Coimbatore Godown",
      },
      grand_total: 3500,
      paid_amount: 1500,
      due_amount: 2000,
      items: [
        { ...before.items[0], qty: 3, line_total: 3000 },
        {
          variant_id: "var-a",
          product_name: "Oxford Derby UK 9",
          sku: "OXF-9",
          hsn_code: "6403",
          qty: 1,
          unit_price: 500,
          discount_amount: 0,
          taxable_value: 500,
          gst_rate: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
          line_total: 500,
        },
      ],
    });

    const diff = diffInvoiceSnapshots(before, after);
    const fields = diff.changes.map((c) => c.field);
    expect(fields).toContain("Customer");
    expect(fields).toContain("Delivery Address");
    expect(fields).toContain("Bill Type");
    expect(fields).toContain("Grand Total");
    expect(fields).toContain("Paid Amount");
    expect(fields).toContain("Balance Due");
    expect(fields).toContain("Item: AeroStride UK 8");
    expect(fields).toContain("Item: Oxford Derby UK 9");
    expect(diff.summary).toContain("Customer: Apex Shoes → Metro Footwear");
    expect(diff.summary).toContain("more)");
  });

  it("returns clean summary when no fields changed", () => {
    const inv = baseInvoice();
    const diff = diffInvoiceSnapshots(inv, baseInvoice());
    expect(diff.changes).toHaveLength(0);
    expect(diff.summary).toBe("Saved bill without field changes");
  });
});

describe("diffPurchaseSnapshots", () => {
  it("tracks bill number, paid amount, and item modifications", () => {
    const before: PurchaseSnapshot = {
      id: "po-1",
      branch_id: "br-1",
      supplier_id: "sup-1",
      bill_number: "PO-101",
      purchase_type: "finished_goods",
      total_amount: 10000,
      paid_amount: 4000,
      itc_cgst: 0,
      itc_sgst: 0,
      itc_igst: 0,
      notes: "Initial",
      items: [
        { variant_id: "v1", item_description: "Loafer UK 8", qty: 20, unit_cost: 500, gst_rate: 5, line_total: 10000 },
      ],
    };
    const after: PurchaseSnapshot = {
      ...before,
      bill_number: "PO-101A",
      total_amount: 13500,
      paid_amount: 6000,
      items: [
        { variant_id: "v1", item_description: "Loafer UK 8", qty: 25, unit_cost: 500, gst_rate: 5, line_total: 12500 },
        { variant_id: "v2", item_description: "Loafer UK 9", qty: 2, unit_cost: 500, gst_rate: 5, line_total: 1000 },
      ],
    };

    const diff = diffPurchaseSnapshots(before, after);
    expect(diff.changes.map((c) => c.field)).toEqual([
      "Supplier Bill No.",
      "Bill Total",
      "Paid Amount",
      "Item: Loafer UK 8",
      "Item: Loafer UK 9",
    ]);
  });
});

describe("diffLedgerEntrySnapshots", () => {
  it("tracks voucher, particulars, debit/credit, items, and transport details", () => {
    const before: LedgerEntrySnapshot = {
      id: "le-1",
      party_type: "supplier",
      party_id: "sup-1",
      source_type: "manual",
      source_id: null,
      entry_date: "2026-11-25T10:00:00Z",
      voucher_no: "R1",
      particulars: "Cash paid",
      debit: 0,
      credit: 5000,
      extra_fields: { transport: "KPN" },
      items: [],
    };
    const after: LedgerEntrySnapshot = {
      ...before,
      voucher_no: "R2",
      particulars: "UPI paid",
      credit: 7500,
      extra_fields: { transport: "ABT" },
      items: [{ item: "Carton 1", amount: 7500 }],
    };

    const diff = diffLedgerEntrySnapshots(before, after);
    expect(diff.changes.map((c) => c.field)).toEqual([
      "Voucher / Bill No.",
      "Particulars",
      "Credit",
      "Item Breakdown",
      "Transport / Extra Details",
    ]);
  });
});

describe("computeVariantStockDeltas", () => {
  it("computes exact sale deltas sorted deterministically by variantId", () => {
    // Sale: selling MORE -> negative delta; selling LESS / removing -> positive delta
    const deltas = computeVariantStockDeltas(
      [
        { variant_id: "v-z", qty: 10 }, // reduced to 6 => +4 returned to stock
        { variant_id: "v-a", qty: 2 },  // increased to 5 => -3 deducted from stock
        { variant_id: "v-m", qty: 4 },  // unchanged => omitted
        { variant_id: null, qty: 99 },  // free-text => ignored
      ],
      [
        { variant_id: "v-z", qty: 6 },
        { variant_id: "v-a", qty: 5 },
        { variant_id: "v-m", qty: 4 },
        { variant_id: "v-b", qty: 3 },  // newly added => -3 deducted
      ],
      "sale"
    );

    expect(deltas).toEqual([
      { variantId: "v-a", delta: -3 },
      { variantId: "v-b", delta: -3 },
      { variantId: "v-z", delta: 4 },
    ]);
  });

  it("computes exact purchase deltas and aggregates duplicate variant rows", () => {
    // Purchase: buying MORE -> positive delta; buying LESS / deleting -> negative delta
    const deltas = computeVariantStockDeltas(
      [
        { variant_id: "v-2", qty: 10 },
        { variant_id: "v-2", qty: 5 }, // total old = 15
        { variant_id: "v-1", qty: 20 },
      ],
      [
        { variant_id: "v-2", qty: 25 }, // +10 more bought
        // v-1 removed => -20 removed from stock
      ],
      "purchase"
    );

    expect(deltas).toEqual([
      { variantId: "v-1", delta: -20 },
      { variantId: "v-2", delta: 10 },
    ]);
  });
});
