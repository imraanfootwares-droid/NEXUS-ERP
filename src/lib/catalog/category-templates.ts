import type { BrandConfig, CategoryTemplate } from "@/types/database";

export const DEFAULT_CATEGORY_TEMPLATES: CategoryTemplate[] = [
  {
    category: "Slipper",
    default_sizes: ["5x8", "6x9", "7x10", "11x3"],
    default_colours: ["MIX", "BLK", "BRN"],
    default_pieces_per_carton: 20,
    extra_fields: ["Sole Type", "Strap Material", "Packaging"],
  },
  {
    category: "Shoe",
    default_sizes: ["6", "7", "8", "9", "10", "40x43"],
    default_colours: ["BLK", "TAN", "WHT", "MIX"],
    default_pieces_per_carton: 24,
    extra_fields: ["Upper Material", "Sole Type", "Lace / Slip-On"],
  },
  {
    category: "Sandal",
    default_sizes: ["5x8", "6x9", "7x10"],
    default_colours: ["BLK", "BRN", "MIX"],
    default_pieces_per_carton: 20,
    extra_fields: ["Sole Type", "Closure Type"],
  },
];

export function resolveCategoryTemplates(brandConfig?: BrandConfig | null): CategoryTemplate[] {
  const saved = brandConfig?.category_templates;
  if (Array.isArray(saved) && saved.length > 0) return saved;
  return DEFAULT_CATEGORY_TEMPLATES.map((t) => ({
    ...t,
    default_sizes: [...t.default_sizes],
    default_colours: [...t.default_colours],
    extra_fields: [...t.extra_fields],
  }));
}
