import type { InvoiceType, SupplyType, TaxMode } from "@/types/database";

export interface HsnRuleInput {
  rate_rule_type: "flat" | "price_threshold";
  threshold_amount?: number | null; // rupees
  rate_below_threshold?: number | null;
  rate_above_threshold?: number | null;
  default_gst_rate: number;
}

export interface CalcLineInput {
  variant_id?: string | null;
  product_name: string;
  sku?: string | null;
  hsn_code?: string | null;
  qty: number;
  unit_price: number; // rupees
  line_discount_amount?: number; // rupees (total discount on line)
  hsn_rule?: HsnRuleInput;
  fallback_gst_rate?: number;
}

export interface CalcInvoiceInput {
  invoice_type: InvoiceType;
  tax_mode: TaxMode;
  branch_state_code: string;
  place_of_supply_state_code?: string | null;
  bill_discount_type?: "percent" | "flat" | null;
  bill_discount_value?: number;
  items: CalcLineInput[];
}

export interface CalcLineOutput {
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

export interface CalcInvoiceOutput {
  supply_type: SupplyType;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  round_off: number;
  grand_total: number;
  items: CalcLineOutput[];
  hsn_summary: Array<{
    hsn_code: string;
    qty: number;
    taxable_value: number;
    gst_rate: number;
    cgst: number;
    sgst: number;
    igst: number;
  }>;
}

const toPaise = (rupees: number): number => Math.round((rupees || 0) * 100);
const toRupees = (paise: number): number => Math.round(paise) / 100;

export function resolveUnitGstRate(
  unitNetPaise: number,
  taxMode: TaxMode,
  invoiceType: InvoiceType,
  rule?: HsnRuleInput,
  fallbackRate = 5
): number {
  if (invoiceType === "estimate_bill_of_supply" || taxMode === "none") return 0;
  if (!rule || rule.rate_rule_type === "flat") {
    return rule ? Number(rule.default_gst_rate) : fallbackRate;
  }

  const thresholdPaise = toPaise(Number(rule.threshold_amount ?? 2500));
  const rateBelow = Number(rule.rate_below_threshold ?? 5);
  const rateAbove = Number(rule.rate_above_threshold ?? 18);

  if (taxMode === "exclusive") {
    return unitNetPaise <= thresholdPaise ? rateBelow : rateAbove;
  }

  // Inclusive: try lower rate first per §2.4 rule
  const taxableAtLow = Math.round((unitNetPaise * 100) / (100 + rateBelow));
  return taxableAtLow <= thresholdPaise ? rateBelow : rateAbove;
}

export function calculateInvoiceGst(input: CalcInvoiceInput): CalcInvoiceOutput {
  const posState = (input.place_of_supply_state_code || input.branch_state_code || "33").trim();
  const supplyType: SupplyType =
    posState === (input.branch_state_code || "33").trim() ? "intra_state" : "inter_state";

  // 1. Compute line gross & line-level net in integer paise
  const lineBases = input.items.map((item) => {
    const grossPaise = Math.round(toPaise(item.unit_price) * item.qty);
    const lineDiscPaise = Math.min(grossPaise, toPaise(item.line_discount_amount ?? 0));
    return {
      item,
      grossPaise,
      lineDiscPaise,
      afterLineDiscPaise: Math.max(0, grossPaise - lineDiscPaise),
    };
  });

  const subtotalAfterLinePaise = lineBases.reduce((s, l) => s + l.afterLineDiscPaise, 0);
  const subtotalGrossPaise = lineBases.reduce((s, l) => s + l.grossPaise, 0);

  // 2. Compute bill-level discount in paise & apportion across lines by value
  let billDiscPaise = 0;
  if (input.bill_discount_type === "percent") {
    const pct = Math.min(100, Math.max(0, input.bill_discount_value ?? 0));
    billDiscPaise = Math.round((subtotalAfterLinePaise * pct) / 100);
  } else if (input.bill_discount_type === "flat") {
    billDiscPaise = Math.min(subtotalAfterLinePaise, toPaise(input.bill_discount_value ?? 0));
  }

  const apportionedBillDisc = lineBases.map((l) =>
    subtotalAfterLinePaise > 0
      ? Math.floor((billDiscPaise * l.afterLineDiscPaise) / subtotalAfterLinePaise)
      : 0
  );
  const remainderPaise = billDiscPaise - apportionedBillDisc.reduce((s, d) => s + d, 0);
  if (remainderPaise > 0 && lineBases.length > 0) {
    let maxIdx = 0;
    for (let i = 1; i < lineBases.length; i++) {
      if (lineBases[i].afterLineDiscPaise > lineBases[maxIdx].afterLineDiscPaise) maxIdx = i;
    }
    apportionedBillDisc[maxIdx] += remainderPaise;
  }

  // 3. Evaluate GST rate & tax components per line in paise
  const itemsOut: CalcLineOutput[] = [];
  let totalTaxablePaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let rawTotalPaise = 0;
  const hsnMap = new Map<
    string,
    { hsn_code: string; qty: number; taxable: number; gst_rate: number; cgst: number; sgst: number; igst: number }
  >();

  for (let i = 0; i < lineBases.length; i++) {
    const { item, lineDiscPaise, afterLineDiscPaise } = lineBases[i];
    const totalLineDiscPaise = lineDiscPaise + apportionedBillDisc[i];
    const netLinePaise = Math.max(0, afterLineDiscPaise - apportionedBillDisc[i]);
    const unitNetPaise = item.qty > 0 ? Math.round(netLinePaise / item.qty) : 0;

    const rate = resolveUnitGstRate(
      unitNetPaise,
      input.tax_mode,
      input.invoice_type,
      item.hsn_rule,
      item.fallback_gst_rate ?? 5
    );

    let taxablePaise = netLinePaise;
    let totalTaxPaise = 0;
    let lineTotalPaise = netLinePaise;

    if (rate > 0) {
      if (input.tax_mode === "inclusive") {
        taxablePaise = Math.round((netLinePaise * 100) / (100 + rate));
        totalTaxPaise = netLinePaise - taxablePaise;
        lineTotalPaise = netLinePaise;
      } else if (input.tax_mode === "exclusive") {
        taxablePaise = netLinePaise;
        totalTaxPaise = Math.round((taxablePaise * rate) / 100);
        lineTotalPaise = taxablePaise + totalTaxPaise;
      }
    }

    let cgstPaise = 0;
    let sgstPaise = 0;
    let igstPaise = 0;
    if (supplyType === "intra_state") {
      cgstPaise = Math.floor(totalTaxPaise / 2);
      sgstPaise = totalTaxPaise - cgstPaise;
    } else {
      igstPaise = totalTaxPaise;
    }

    totalTaxablePaise += taxablePaise;
    totalCgstPaise += cgstPaise;
    totalSgstPaise += sgstPaise;
    totalIgstPaise += igstPaise;
    rawTotalPaise += lineTotalPaise;

    const hsnKey = `${item.hsn_code || "NA"}:${rate}`;
    const existingHsn = hsnMap.get(hsnKey) ?? {
      hsn_code: item.hsn_code || "NA",
      qty: 0,
      taxable: 0,
      gst_rate: rate,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
    existingHsn.qty += item.qty;
    existingHsn.taxable += taxablePaise;
    existingHsn.cgst += cgstPaise;
    existingHsn.sgst += sgstPaise;
    existingHsn.igst += igstPaise;
    hsnMap.set(hsnKey, existingHsn);

    itemsOut.push({
      variant_id: item.variant_id ?? null,
      product_name: item.product_name,
      sku: item.sku ?? null,
      hsn_code: item.hsn_code ?? null,
      qty: item.qty,
      unit_price: item.unit_price,
      discount_amount: toRupees(totalLineDiscPaise),
      taxable_value: toRupees(taxablePaise),
      gst_rate: rate,
      cgst: toRupees(cgstPaise),
      sgst: toRupees(sgstPaise),
      igst: toRupees(igstPaise),
      line_total: toRupees(lineTotalPaise),
    });
  }

  const roundedPaise = Math.round(rawTotalPaise / 100) * 100;
  const roundOffPaise = roundedPaise - rawTotalPaise;

  return {
    supply_type: supplyType,
    subtotal: toRupees(subtotalGrossPaise),
    discount_amount: toRupees(
      lineBases.reduce((s, l) => s + l.lineDiscPaise, 0) + billDiscPaise
    ),
    taxable_amount: toRupees(totalTaxablePaise),
    cgst_amount: toRupees(totalCgstPaise),
    sgst_amount: toRupees(totalSgstPaise),
    igst_amount: toRupees(totalIgstPaise),
    round_off: toRupees(roundOffPaise),
    grand_total: toRupees(roundedPaise),
    items: itemsOut,
    hsn_summary: Array.from(hsnMap.values()).map((h) => ({
      hsn_code: h.hsn_code,
      qty: h.qty,
      taxable_value: toRupees(h.taxable),
      gst_rate: h.gst_rate,
      cgst: toRupees(h.cgst),
      sgst: toRupees(h.sgst),
      igst: toRupees(h.igst),
    })),
  };
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rem = n % 100;
  return `${h ? ONES[h] + " Hundred" + (rem ? " " : "") : ""}${rem ? twoDigits(rem) : ""}`;
}

export function amountInWordsIndian(amount: number): string {
  const whole = Math.floor(Math.abs(amount));
  if (whole === 0) return "Rupees Zero Only";

  const crore = Math.floor(whole / 10000000);
  const lakh = Math.floor((whole % 10000000) / 100000);
  const thousand = Math.floor((whole % 100000) / 1000);
  const rest = whole % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  return `Rupees ${parts.join(" ")} Only`;
}
