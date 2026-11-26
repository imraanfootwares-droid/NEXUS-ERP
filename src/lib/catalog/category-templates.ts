import type { BrandConfig, CategoryTemplate, CustomFieldRow, VariantAxisRow, VerticalKey } from "@/types/database";

export interface VerticalCategoryPreset {
  key: Exclude<VerticalKey, "custom">;
  label: string;
  description: string;
  categories: CategoryTemplate[];
}

export const VERTICAL_CATEGORY_PRESETS: VerticalCategoryPreset[] = [
  {
    key: "footwear",
    label: "Footwear",
    description: "Men's, Women's, Children's & Baby Footwear with separate size ranges",
    categories: [
      {
        category: "Men's Footwear",
        default_sizes: ["6", "7", "8", "9", "10", "11"],
        default_colours: ["Black", "Brown", "Tan", "White"],
        default_pieces_per_carton: 20,
        extra_fields: ["Sole Type", "Upper Material"],
      },
      {
        category: "Women's Footwear",
        default_sizes: ["4", "5", "6", "7", "8"],
        default_colours: ["Black", "Beige", "Pink", "White"],
        default_pieces_per_carton: 20,
        extra_fields: ["Sole Type", "Heel Type"],
      },
      {
        category: "Children's Footwear",
        default_sizes: ["1", "2", "3", "4", "5", "11x3"],
        default_colours: ["Blue", "Black", "Red", "Mix"],
        default_pieces_per_carton: 24,
        extra_fields: ["Sole Type", "Closure Type"],
      },
      {
        category: "Baby Footwear",
        default_sizes: ["0-3M", "3-6M", "6-12M", "12-18M", "18-24M"],
        default_colours: ["Mix", "Pink", "Blue", "White"],
        default_pieces_per_carton: 24,
        extra_fields: ["Soft Sole", "Closure Type"],
      },
    ],
  },
  {
    key: "apparel",
    label: "Apparel & Garments",
    description: "Men's, Women's, Kids & Baby Wear with clothing sizes",
    categories: [
      {
        category: "Men's Wear",
        default_sizes: ["S", "M", "L", "XL", "XXL"],
        default_colours: ["Black", "White", "Navy", "Grey"],
        default_pieces_per_carton: 12,
        extra_fields: ["Fabric", "Fit"],
      },
      {
        category: "Women's Wear",
        default_sizes: ["XS", "S", "M", "L", "XL"],
        default_colours: ["Black", "Beige", "Pink", "Blue"],
        default_pieces_per_carton: 12,
        extra_fields: ["Fabric", "Fit", "Season"],
      },
      {
        category: "Kids Wear",
        default_sizes: ["2-3Y", "4-5Y", "6-7Y", "8-9Y", "10-11Y"],
        default_colours: ["Blue", "Red", "Yellow", "Mix"],
        default_pieces_per_carton: 18,
        extra_fields: ["Fabric", "Season"],
      },
      {
        category: "Baby Wear",
        default_sizes: ["0-3M", "3-6M", "6-12M", "12-18M"],
        default_colours: ["White", "Pink", "Blue", "Mix"],
        default_pieces_per_carton: 24,
        extra_fields: ["Fabric"],
      },
    ],
  },
  {
    key: "electronics",
    label: "Electronics & Mobile",
    description: "Phones, Laptops, Accessories & Audio with storage / capacity options",
    categories: [
      {
        category: "Smartphones",
        default_sizes: ["64GB", "128GB", "256GB", "512GB"],
        default_colours: ["Black", "Blue", "Silver", "Gold"],
        default_pieces_per_carton: 10,
        extra_fields: ["Warranty (Months)", "Model Year"],
      },
      {
        category: "Laptops & Tablets",
        default_sizes: ["8GB/256GB", "8GB/512GB", "16GB/512GB", "16GB/1TB"],
        default_colours: ["Silver", "Space Grey", "Black"],
        default_pieces_per_carton: 5,
        extra_fields: ["Warranty (Months)", "Model Year"],
      },
      {
        category: "Mobile Accessories",
        default_sizes: ["Type-C", "Lightning", "Micro-USB", "Universal"],
        default_colours: ["Black", "White"],
        default_pieces_per_carton: 50,
        extra_fields: ["Warranty (Months)"],
      },
      {
        category: "Audio & Wearables",
        default_sizes: ["Standard", "Pro"],
        default_colours: ["Black", "White", "Blue"],
        default_pieces_per_carton: 20,
        extra_fields: ["Warranty (Months)", "Battery Backup"],
      },
    ],
  },
  {
    key: "fmcg",
    label: "Grocery & FMCG",
    description: "Staples, Snacks, Personal Care & Dairy with pack weights",
    categories: [
      {
        category: "Grains & Staples",
        default_sizes: ["500g", "1kg", "5kg", "10kg", "25kg"],
        default_colours: [],
        default_pieces_per_carton: 10,
        extra_fields: ["Batch No", "Expiry Date", "FSSAI Code"],
      },
      {
        category: "Snacks & Beverages",
        default_sizes: ["50g", "100g", "250g", "500ml", "1L"],
        default_colours: [],
        default_pieces_per_carton: 24,
        extra_fields: ["Batch No", "Expiry Date"],
      },
      {
        category: "Personal Care",
        default_sizes: ["50ml", "100ml", "200ml", "500ml"],
        default_colours: [],
        default_pieces_per_carton: 24,
        extra_fields: ["Batch No", "Expiry Date"],
      },
    ],
  },
  {
    key: "hardware",
    label: "Hardware & Industrial",
    description: "Fasteners, Plumbing, Electricals & Tools with sizes and grades",
    categories: [
      {
        category: "Fasteners & Bolts",
        default_sizes: ["M6", "M8", "M10", "M12", "M16"],
        default_colours: ["Galvanized", "Stainless Steel", "Brass"],
        default_pieces_per_carton: 100,
        extra_fields: ["Material Grade", "Weight (kg)"],
      },
      {
        category: "Plumbing & Pipes",
        default_sizes: ["1/2 inch", "3/4 inch", "1 inch", "2 inch"],
        default_colours: ["White", "Grey", "Brass"],
        default_pieces_per_carton: 20,
        extra_fields: ["Material Grade", "Pressure Rating"],
      },
      {
        category: "Electricals",
        default_sizes: ["6A", "16A", "32A", "1.5 sqmm", "2.5 sqmm"],
        default_colours: ["White", "Black", "Red", "Blue"],
        default_pieces_per_carton: 20,
        extra_fields: ["Warranty (Months)", "ISI Certified"],
      },
    ],
  },
];

export const DEFAULT_CATEGORY_TEMPLATES: CategoryTemplate[] = VERTICAL_CATEGORY_PRESETS[0].categories;

export const FOOTWEAR_CATEGORY_STARTERS: CategoryTemplate[] = VERTICAL_CATEGORY_PRESETS[0].categories;

export function getPresetCategoriesForVertical(vertical?: VerticalKey | null): CategoryTemplate[] {
  const found = VERTICAL_CATEGORY_PRESETS.find((p) => p.key === vertical) ?? VERTICAL_CATEGORY_PRESETS[0];
  return found.categories.map((t) => ({
    ...t,
    default_sizes: [...t.default_sizes],
    default_colours: [...t.default_colours],
    extra_fields: [...t.extra_fields],
  }));
}

const norm = (value: string) => value.trim().toLowerCase();

export function parseCommaList(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
}

export function resolveCategoryTemplates(
  brandConfig?: BrandConfig | null,
  vertical?: VerticalKey | null
): CategoryTemplate[] {
  const saved = brandConfig?.category_templates;
  if (Array.isArray(saved) && saved.length > 0) {
    return saved.map((t) => ({
      ...t,
      default_sizes: Array.isArray(t.default_sizes) ? [...t.default_sizes] : [],
      default_colours: Array.isArray(t.default_colours) ? [...t.default_colours] : [],
      extra_fields: Array.isArray(t.extra_fields) ? [...t.extra_fields] : [],
    }));
  }
  return getPresetCategoriesForVertical(vertical);
}

export function findCategoryTemplate(
  templates: CategoryTemplate[],
  categoryName: string | null | undefined
): CategoryTemplate | null {
  if (!categoryName || !categoryName.trim()) return null;
  const target = norm(categoryName);
  return templates.find((t) => norm(t.category) === target) ?? null;
}

/**
 * Returns the sizes for a chosen category.
 * If the category has its own sizes set, ONLY those sizes are returned so
 * Men's / Women's / Children's / Baby sizes never get mixed up.
 * Otherwise falls back to the general "Size" option group.
 */
export function resolveSizesForCategory(
  templates: CategoryTemplate[],
  categoryName: string | null | undefined,
  axes: Pick<VariantAxisRow, "name" | "preset_values">[]
): { sizes: string[]; source: "category" | "general"; template: CategoryTemplate | null } {
  const tpl = findCategoryTemplate(templates, categoryName);
  if (tpl && tpl.default_sizes.length > 0) {
    return { sizes: Array.from(new Set(tpl.default_sizes)), source: "category", template: tpl };
  }
  const sizeAxis = axes.find((a) => norm(a.name) === "size" || norm(a.name) === "sizes");
  return {
    sizes: sizeAxis ? Array.from(new Set(sizeAxis.preset_values)) : [],
    source: "general",
    template: tpl,
  };
}

/**
 * Returns colours for a chosen category, falling back to the general "Colour" option group.
 */
export function resolveColoursForCategory(
  templates: CategoryTemplate[],
  categoryName: string | null | undefined,
  axes: Pick<VariantAxisRow, "name" | "preset_values">[]
): { colours: string[]; source: "category" | "general" } {
  const tpl = findCategoryTemplate(templates, categoryName);
  if (tpl && tpl.default_colours.length > 0) {
    return { colours: Array.from(new Set(tpl.default_colours)), source: "category" };
  }
  const colourAxis = axes.find((a) => norm(a.name) === "colour" || norm(a.name) === "color");
  return {
    colours: colourAxis ? Array.from(new Set(colourAxis.preset_values)) : [],
    source: "general",
  };
}

/**
 * Returns the Extra Product Details (fields) to show for a chosen category.
 * - If the category has attached fields (`extra_fields`), returns matching saved
 *   CustomFieldRow definitions AND synthesizes simple text fields for any attached
 *   field name that isn't saved in custom_field_definitions yet.
 * - If no category is selected or the category has no specific fields attached,
 *   returns all general custom fields.
 */
export function resolveCustomFieldsForCategory(
  templates: CategoryTemplate[],
  categoryName: string | null | undefined,
  allCustomFields: CustomFieldRow[]
): { fields: CustomFieldRow[]; isCategoryFiltered: boolean; template: CategoryTemplate | null } {
  const tpl = findCategoryTemplate(templates, categoryName);
  if (!tpl || tpl.extra_fields.length === 0) {
    return { fields: allCustomFields, isCategoryFiltered: false, template: tpl };
  }

  const byLabelOrKey = new Map<string, CustomFieldRow>();
  for (const cf of allCustomFields) {
    byLabelOrKey.set(norm(cf.label), cf);
    byLabelOrKey.set(norm(cf.field_key), cf);
  }

  const resolved: CustomFieldRow[] = [];
  const seenKeys = new Set<string>();

  tpl.extra_fields.forEach((rawName, idx) => {
    const label = rawName.trim();
    if (!label) return;
    const key = label.toLowerCase().replace(/[^a-z0-9_]+/g, "_");
    const matched = byLabelOrKey.get(norm(label)) ?? byLabelOrKey.get(key);
    if (matched) {
      if (!seenKeys.has(matched.field_key)) {
        seenKeys.add(matched.field_key);
        resolved.push(matched);
      }
      return;
    }
    if (!seenKeys.has(key)) {
      seenKeys.add(key);
      resolved.push({
        id: `cat-field-${key}`,
        tenant_id: allCustomFields[0]?.tenant_id ?? "",
        field_key: key,
        label,
        field_type: "text",
        options: [],
        is_required: false,
        show_on_bill: false,
        show_on_website: true,
        show_in_catalogue: true,
        sort_order: 100 + idx,
      });
    }
  });

  return { fields: resolved, isCategoryFiltered: true, template: tpl };
}

export function upsertCategoryTemplate(
  templates: CategoryTemplate[],
  next: CategoryTemplate,
  originalCategoryName?: string | null
): CategoryTemplate[] {
  const cleanName = next.category.trim();
  if (!cleanName) return templates;
  const normalizedEntry: CategoryTemplate = {
    category: cleanName,
    default_sizes: Array.from(new Set((next.default_sizes ?? []).map((s) => s.trim()).filter(Boolean))),
    default_colours: Array.from(new Set((next.default_colours ?? []).map((c) => c.trim()).filter(Boolean))),
    default_pieces_per_carton: Math.max(1, Math.floor(Number(next.default_pieces_per_carton) || 20)),
    extra_fields: Array.from(new Set((next.extra_fields ?? []).map((f) => f.trim()).filter(Boolean))),
  };

  const matchTarget = norm(originalCategoryName || cleanName);
  let replaced = false;
  const out: CategoryTemplate[] = [];
  for (const t of templates) {
    if (norm(t.category) === matchTarget) {
      if (!replaced) {
        out.push(normalizedEntry);
        replaced = true;
      }
      continue;
    }
    if (norm(t.category) === norm(cleanName)) {
      continue;
    }
    out.push(t);
  }
  if (!replaced) out.push(normalizedEntry);
  return out;
}

export function removeCategoryTemplate(templates: CategoryTemplate[], categoryName: string): CategoryTemplate[] {
  const target = norm(categoryName);
  return templates.filter((t) => norm(t.category) !== target);
}
