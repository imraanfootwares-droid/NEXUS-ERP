import { describe, expect, it } from "vitest";
import { amountInWordsIndian, calculateInvoiceGst, type HsnRuleInput } from "../calculator";

const footwearRule: HsnRuleInput = {
  rate_rule_type: "price_threshold",
  threshold_amount: 2500,
  rate_below_threshold: 5,
  rate_above_threshold: 18,
  default_gst_rate: 5,
};

const partsRule: HsnRuleInput = {
  rate_rule_type: "flat",
  default_gst_rate: 18,
};

describe("Indian Footwear & Multi-Vertical GST Engine (Integer Paise)", () => {
  it("applies 5% for <= 2500 excl and 18% for > 2500 excl", () => {
    const resLow = calculateInvoiceGst({
      invoice_type: "sale",
      tax_mode: "exclusive",
      branch_state_code: "33",
      items: [{ product_name: "Shoe A", hsn_code: "6403", qty: 1, unit_price: 2500, hsn_rule: footwearRule }],
    });
    expect(resLow.items[0].gst_rate).toBe(5);
    expect(resLow.grand_total).toBe(2625);

    const resHigh = calculateInvoiceGst({
      invoice_type: "sale",
      tax_mode: "exclusive",
      branch_state_code: "33",
      items: [{ product_name: "Shoe B", hsn_code: "6403", qty: 1, unit_price: 2501, hsn_rule: footwearRule }],
    });
    expect(resHigh.items[0].gst_rate).toBe(18);
    expect(resHigh.cgst_amount).toBe(225.09);
    expect(resHigh.sgst_amount).toBe(225.09);
  });

  it("handles tax-inclusive boundary accurately (2625 -> 5%, 2626 -> 18%)", () => {
    const res2625 = calculateInvoiceGst({
      invoice_type: "sale",
      tax_mode: "inclusive",
      branch_state_code: "33",
      items: [{ product_name: "Shoe Incl Low", hsn_code: "6403", qty: 1, unit_price: 2625, hsn_rule: footwearRule }],
    });
    expect(res2625.items[0].gst_rate).toBe(5);
    expect(res2625.taxable_amount).toBe(2500);

    const res2626 = calculateInvoiceGst({
      invoice_type: "sale",
      tax_mode: "inclusive",
      branch_state_code: "33",
      items: [{ product_name: "Shoe Incl High", hsn_code: "6403", qty: 1, unit_price: 2626, hsn_rule: footwearRule }],
    });
    expect(res2626.items[0].gst_rate).toBe(18);
  });

  it("re-evaluates slab to 5% when discount drops 2800 shoe to 2380", () => {
    const res = calculateInvoiceGst({
      invoice_type: "sale",
      tax_mode: "exclusive",
      branch_state_code: "07",
      place_of_supply_state_code: "33",
      bill_discount_type: "percent",
      bill_discount_value: 15,
      items: [{ product_name: "Derby", hsn_code: "6403", qty: 1, unit_price: 2800, hsn_rule: footwearRule }],
    });
    expect(res.supply_type).toBe("inter_state");
    expect(res.items[0].gst_rate).toBe(5);
    expect(res.igst_amount).toBe(119);
    expect(res.cgst_amount).toBe(0);
  });

  it("applies flat 18% on HSN 6406 parts and 0% on Estimates", () => {
    const parts = calculateInvoiceGst({
      invoice_type: "sale",
      tax_mode: "exclusive",
      branch_state_code: "33",
      items: [{ product_name: "TPR Sole", hsn_code: "6406", qty: 2, unit_price: 200, hsn_rule: partsRule }],
    });
    expect(parts.items[0].gst_rate).toBe(18);

    const est = calculateInvoiceGst({
      invoice_type: "estimate_bill_of_supply",
      tax_mode: "none",
      branch_state_code: "33",
      items: [{ product_name: "Shoe", hsn_code: "6403", qty: 1, unit_price: 3000, hsn_rule: footwearRule }],
    });
    expect(est.items[0].gst_rate).toBe(0);
    expect(est.grand_total).toBe(3000);
  });

  it("formats Indian amount in words", () => {
    expect(amountInWordsIndian(125450)).toBe("Rupees One Lakh Twenty Five Thousand Four Hundred Fifty Only");
  });
});
