import * as XLSX from "xlsx";
import { buildVariantSku } from "@/lib/catalog/verticals";

export interface ParsedStockRow {
  rowNo: number;
  model_code: string;
  name: string;
  category: string;
  brand: string;
  uom: string;
  hsn_code: string;
  gst_rate: number;
  sku: string;
  barcode: string;
  attributes: Record<string, string>;
  custom_fields: Record<string, string>;
  cost_price: number;
  mrp: number;
  selling_price: number;
  wholesale_price: number;
  opening_qty: number;
  low_stock_threshold: number;
}

export interface StockImportParseResult {
  validRows: ParsedStockRow[];
  errors: Array<{ rowNo: number; message: string }>;
}

export function buildStockTemplateWorkbook(
  axisNames: string[],
  customFieldLabels: string[],
  defaultUom = "Pair"
): Uint8Array {
  const headers = [
    "model_code",
    "name",
    "category",
    "brand",
    "uom",
    "hsn_code",
    "gst_rate",
    ...axisNames.map((a) => `attr_${a}`),
    ...customFieldLabels.map((c) => `field_${c}`),
    "sku",
    "barcode",
    "cost_price",
    "mrp",
    "selling_price",
    "wholesale_price",
    "opening_qty",
    "low_stock_threshold",
  ];

  const sample: Record<string, string | number> = {
    model_code: "IMR-501",
    name: "Classic Formal Oxford",
    category: "Formal",
    brand: "Imraan",
    uom: defaultUom,
    hsn_code: "6403",
    gst_rate: 5,
    sku: "",
    barcode: "",
    cost_price: 900,
    mrp: 2499,
    selling_price: 2199,
    wholesale_price: 1450,
    opening_qty: 20,
    low_stock_threshold: 5,
  };
  for (const a of axisNames) sample[`attr_${a}`] = a.toLowerCase().includes("size") ? "UK 8" : "Black";
  for (const c of customFieldLabels) sample[`field_${c}`] = "";

  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Stock_Import");
  return new Uint8Array(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);
}

export function parseStockRows(
  rawRows: Array<Record<string, unknown>>,
  axisNames: string[],
  customFieldKeys: string[],
  defaultUom = "Pair"
): StockImportParseResult {
  const validRows: ParsedStockRow[] = [];
  const errors: Array<{ rowNo: number; message: string }> = [];

  rawRows.forEach((raw, idx) => {
    const rowNo = idx + 2;
    const modelCode = String(raw.model_code ?? "").trim().toUpperCase();
    const name = String(raw.name ?? "").trim();

    if (!modelCode || !name) {
      errors.push({ rowNo, message: "model_code and name are required." });
      return;
    }

    const gstRate = Number(raw.gst_rate ?? 5);
    if (Number.isNaN(gstRate) || gstRate < 0 || gstRate > 40) {
      errors.push({ rowNo, message: "gst_rate must be between 0 and 40." });
      return;
    }

    const costPrice = Number(raw.cost_price ?? 0);
    const mrp = Number(raw.mrp ?? 0);
    const sellingPrice = Number(raw.selling_price ?? 0);
    const wholesalePrice = Number(raw.wholesale_price ?? 0);
    const openingQty = Number(raw.opening_qty ?? 0);
    const lowThresh = Number(raw.low_stock_threshold ?? 5);

    if ([costPrice, mrp, sellingPrice, wholesalePrice, openingQty].some((n) => Number.isNaN(n) || n < 0)) {
      errors.push({ rowNo, message: "Prices and opening_qty must be non-negative numbers." });
      return;
    }

    const attributes: Record<string, string> = {};
    for (const ax of axisNames) {
      const val = String(raw[`attr_${ax}`] ?? raw[ax] ?? "").trim();
      if (val) attributes[ax] = val;
    }

    const custom_fields: Record<string, string> = {};
    for (const cf of customFieldKeys) {
      const val = String(raw[`field_${cf}`] ?? raw[cf] ?? "").trim();
      if (val) custom_fields[cf] = val;
    }

    const sku = String(raw.sku ?? "").trim().toUpperCase() || buildVariantSku(modelCode, attributes);
    const barcode = String(raw.barcode ?? "").trim() || sku;

    validRows.push({
      rowNo,
      model_code: modelCode,
      name,
      category: String(raw.category ?? "").trim(),
      brand: String(raw.brand ?? "").trim(),
      uom: String(raw.uom ?? defaultUom).trim() || defaultUom,
      hsn_code: String(raw.hsn_code ?? "").trim(),
      gst_rate: gstRate,
      sku,
      barcode,
      attributes,
      custom_fields,
      cost_price: costPrice,
      mrp,
      selling_price: sellingPrice,
      wholesale_price: wholesalePrice,
      opening_qty: openingQty,
      low_stock_threshold: Number.isNaN(lowThresh) ? 5 : lowThresh,
    });
  });

  return { validRows, errors };
}
