import type { RatioPreset, VerticalKey } from "@/types/database";

export interface VerticalPreset {
  key: VerticalKey;
  name: string;
  defaultUom: string;
  allowDecimal: boolean;
  defaultAxes: {
    name: string;
    preset_values: string[];
    ratio_presets: RatioPreset[];
  }[];
  defaultCustomFields: {
    field_key: string;
    label: string;
    field_type: "text" | "number" | "select" | "boolean" | "date";
    options: string[];
    show_on_bill: boolean;
    show_on_website: boolean;
    show_in_catalogue: boolean;
  }[];
  starterHsnPrefixes: string[];
}

export const VERTICAL_PRESETS: Record<VerticalKey, VerticalPreset> = {
  footwear: {
    key: "footwear",
    name: "Footwear (Factory, Wholesale & Retail)",
    defaultUom: "Pair",
    allowDecimal: false,
    defaultAxes: [
      {
        name: "Size",
        preset_values: ["UK 5", "UK 6", "UK 7", "UK 8", "UK 9", "UK 10", "UK 11", "UK 12"],
        ratio_presets: [
          { name: "Gents 6–10 (1:2:3:2:1)", ratios: { "UK 6": 1, "UK 7": 2, "UK 8": 3, "UK 9": 2, "UK 10": 1 } },
          { name: "Gents 6–11 12-Pair (1:2:3:3:2:1)", ratios: { "UK 6": 1, "UK 7": 2, "UK 8": 3, "UK 9": 3, "UK 10": 2, "UK 11": 1 } },
          { name: "Ladies 4–8 (1:2:3:2:1)", ratios: { "UK 4": 1, "UK 5": 2, "UK 6": 3, "UK 7": 2, "UK 8": 1 } },
        ],
      },
      {
        name: "Colour",
        preset_values: ["Black", "Brown", "Tan", "White", "Navy"],
        ratio_presets: [],
      },
    ],
    defaultCustomFields: [
      {
        field_key: "upper_material",
        label: "Upper Material",
        field_type: "select",
        options: ["Genuine Leather", "Synthetic / PU", "Mesh / Knit", "Canvas", "EVA / Rubber"],
        show_on_bill: false,
        show_on_website: true,
        show_in_catalogue: true,
      },
      {
        field_key: "sole_type",
        label: "Sole Type",
        field_type: "select",
        options: ["PU", "TPR", "EVA", "PVC", "Airmax", "Leather"],
        show_on_bill: false,
        show_on_website: true,
        show_in_catalogue: true,
      },
      {
        field_key: "gender",
        label: "Gender",
        field_type: "select",
        options: ["Men", "Women", "Kids", "Unisex"],
        show_on_bill: false,
        show_on_website: true,
        show_in_catalogue: true,
      },
    ],
    starterHsnPrefixes: ["6401", "6402", "6403", "6404", "6405", "6406"],
  },
  apparel: {
    key: "apparel",
    name: "Apparel & Garments",
    defaultUom: "Piece",
    allowDecimal: false,
    defaultAxes: [
      {
        name: "Size",
        preset_values: ["XS", "S", "M", "L", "XL", "XXL"],
        ratio_presets: [{ name: "S–XL (1:2:2:1)", ratios: { S: 1, M: 2, L: 2, XL: 1 } }],
      },
      {
        name: "Colour",
        preset_values: ["Black", "White", "Blue", "Red", "Beige"],
        ratio_presets: [],
      },
    ],
    defaultCustomFields: [
      { field_key: "fabric", label: "Fabric", field_type: "text", options: [], show_on_bill: false, show_on_website: true, show_in_catalogue: true },
      { field_key: "fit", label: "Fit", field_type: "select", options: ["Regular", "Slim", "Relaxed"], show_on_bill: false, show_on_website: true, show_in_catalogue: true },
      { field_key: "season", label: "Season", field_type: "select", options: ["All Season", "Summer", "Winter"], show_on_bill: false, show_on_website: true, show_in_catalogue: false },
    ],
    starterHsnPrefixes: ["6105", "6109", "6203", "6204"],
  },
  electronics: {
    key: "electronics",
    name: "Electronics & Mobile",
    defaultUom: "Unit",
    allowDecimal: false,
    defaultAxes: [
      { name: "Storage", preset_values: ["64GB", "128GB", "256GB", "512GB"], ratio_presets: [] },
      { name: "Colour", preset_values: ["Black", "Silver", "Blue", "Gold"], ratio_presets: [] },
    ],
    defaultCustomFields: [
      { field_key: "warranty_months", label: "Warranty (Months)", field_type: "number", options: [], show_on_bill: true, show_on_website: true, show_in_catalogue: true },
      { field_key: "serial_required", label: "IMEI/Serial Required", field_type: "boolean", options: [], show_on_bill: false, show_on_website: false, show_in_catalogue: false },
      { field_key: "model_year", label: "Model Year", field_type: "text", options: [], show_on_bill: false, show_on_website: true, show_in_catalogue: true },
    ],
    starterHsnPrefixes: ["8517", "8471", "8528", "8504"],
  },
  fmcg: {
    key: "fmcg",
    name: "Grocery & FMCG",
    defaultUom: "Pack",
    allowDecimal: true,
    defaultAxes: [
      { name: "Pack Size", preset_values: ["100g", "250g", "500g", "1kg", "5kg"], ratio_presets: [] },
    ],
    defaultCustomFields: [
      { field_key: "batch_no", label: "Batch No", field_type: "text", options: [], show_on_bill: true, show_on_website: false, show_in_catalogue: false },
      { field_key: "expiry_date", label: "Expiry Date", field_type: "date", options: [], show_on_bill: true, show_on_website: false, show_in_catalogue: false },
      { field_key: "fssai_code", label: "FSSAI Code", field_type: "text", options: [], show_on_bill: true, show_on_website: true, show_in_catalogue: false },
    ],
    starterHsnPrefixes: ["0901", "1905", "2106", "3401"],
  },
  hardware: {
    key: "hardware",
    name: "Hardware & Industrial",
    defaultUom: "Piece",
    allowDecimal: true,
    defaultAxes: [
      { name: "Specification", preset_values: ["Standard", "Heavy Duty"], ratio_presets: [] },
      { name: "Finish", preset_values: ["Chrome", "Matte", "Brass", "Galvanized"], ratio_presets: [] },
    ],
    defaultCustomFields: [
      { field_key: "material_grade", label: "Material Grade", field_type: "text", options: [], show_on_bill: false, show_on_website: true, show_in_catalogue: true },
      { field_key: "weight_kg", label: "Weight (kg)", field_type: "number", options: [], show_on_bill: false, show_on_website: true, show_in_catalogue: true },
    ],
    starterHsnPrefixes: ["7318", "8302", "8481", "3917"],
  },
  custom: {
    key: "custom",
    name: "Custom Business",
    defaultUom: "Unit",
    allowDecimal: true,
    defaultAxes: [],
    defaultCustomFields: [],
    starterHsnPrefixes: [],
  },
};

/** Generate Cartesian product of selected axis values for Variant Matrix generation. */
export function generateVariantCombinations(
  axes: Array<{ name: string; values: string[] }>
): Array<Record<string, string>> {
  const activeAxes = axes.filter((a) => a.values.length > 0);
  if (activeAxes.length === 0) return [{}];

  return activeAxes.reduce<Array<Record<string, string>>>(
    (acc, axis) => {
      const next: Array<Record<string, string>> = [];
      for (const existing of acc) {
        for (const val of axis.values) {
          next.push({ ...existing, [axis.name]: val });
        }
      }
      return next;
    },
    [{}]
  );
}

/** Build deterministic SKU from model code + variant attributes. */
export function buildVariantSku(modelCode: string, attributes: Record<string, string>): string {
  const parts = Object.values(attributes)
    .map((v) => v.trim().toUpperCase().replace(/[^A-Z0-9]+/g, ""))
    .filter(Boolean);
  const base = modelCode.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "");
  return parts.length > 0 ? `${base}-${parts.join("-")}` : base;
}

/** Compute Indian Financial Year (April 1 – March 31) in Asia/Kolkata (e.g., "26-27"). */
export function getIndianFyCode(date: Date = new Date()): string {
  const istString = date.toLocaleString("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const [yearStr, monthStr] = istString.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}
