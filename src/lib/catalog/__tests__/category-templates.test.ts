import { describe, expect, it } from "vitest";
import {
  DEFAULT_CATEGORY_TEMPLATES,
  getPresetCategoriesForVertical,
  parseCommaList,
  removeCategoryTemplate,
  resolveCategoryTemplates,
  resolveColoursForCategory,
  resolveCustomFieldsForCategory,
  resolveSizesForCategory,
  upsertCategoryTemplate,
  VERTICAL_CATEGORY_PRESETS,
} from "../category-templates";
import type { CustomFieldRow } from "@/types/database";

const SAMPLE_FIELDS: CustomFieldRow[] = [
  {
    id: "f1",
    tenant_id: "t1",
    field_key: "sole_type",
    label: "Sole Type",
    field_type: "select",
    options: ["PU", "EVA", "TPR"],
    is_required: false,
    show_on_bill: false,
    show_on_website: true,
    show_in_catalogue: true,
    sort_order: 1,
  },
  {
    id: "f2",
    tenant_id: "t1",
    field_key: "heel_type",
    label: "Heel Type",
    field_type: "text",
    options: [],
    is_required: false,
    show_on_bill: false,
    show_on_website: true,
    show_in_catalogue: true,
    sort_order: 2,
  },
];

const SAMPLE_AXES = [
  { name: "Size", preset_values: ["6", "7", "8", "9"] },
  { name: "Colour", preset_values: ["Black", "White"] },
];

describe("category-templates dynamic size & field resolution", () => {
  it("provides Men's, Women's, Children's, and Baby Footwear defaults with distinct sizes", () => {
    const defaults = resolveCategoryTemplates(null);
    const names = defaults.map((t) => t.category);
    expect(names).toEqual([
      "Men's Footwear",
      "Women's Footwear",
      "Children's Footwear",
      "Baby Footwear",
    ]);

    const mens = resolveSizesForCategory(defaults, "Men's Footwear", SAMPLE_AXES);
    const baby = resolveSizesForCategory(defaults, "Baby Footwear", SAMPLE_AXES);
    expect(mens.source).toBe("category");
    expect(mens.sizes).toEqual(["6", "7", "8", "9", "10", "11"]);
    expect(baby.source).toBe("category");
    expect(baby.sizes).toEqual(["0-3M", "3-6M", "6-12M", "12-18M", "18-24M"]);
  });

  it("falls back to general Size/Colour axes when category has no sizes or is unselected", () => {
    const sizes = resolveSizesForCategory(DEFAULT_CATEGORY_TEMPLATES, "", SAMPLE_AXES);
    expect(sizes.source).toBe("general");
    expect(sizes.sizes).toEqual(["6", "7", "8", "9"]);

    const colours = resolveColoursForCategory(DEFAULT_CATEGORY_TEMPLATES, "Unknown", SAMPLE_AXES);
    expect(colours.source).toBe("general");
    expect(colours.colours).toEqual(["Black", "White"]);
  });

  it("resolves attached category fields matching saved definitions and synthesizing custom ones", () => {
    const womens = resolveCustomFieldsForCategory(
      DEFAULT_CATEGORY_TEMPLATES,
      "Women's Footwear",
      SAMPLE_FIELDS
    );
    expect(womens.isCategoryFiltered).toBe(true);
    expect(womens.fields.map((f) => f.label)).toEqual(["Sole Type", "Heel Type"]);
    expect(womens.fields[0].field_type).toBe("select");

    const baby = resolveCustomFieldsForCategory(
      DEFAULT_CATEGORY_TEMPLATES,
      "Baby Footwear",
      SAMPLE_FIELDS
    );
    expect(baby.isCategoryFiltered).toBe(true);
    expect(baby.fields.map((f) => f.label)).toEqual(["Soft Sole", "Closure Type"]);
    expect(baby.fields[0].field_type).toBe("text");
  });

  it("supports adding, editing, renaming, and removing categories cleanly", () => {
    const added = upsertCategoryTemplate(DEFAULT_CATEGORY_TEMPLATES, {
      category: "Sports Shoes",
      default_sizes: ["7", "8", "9", "8"],
      default_colours: ["White", "Blue"],
      default_pieces_per_carton: 12,
      extra_fields: ["Sole Type", "Breathable Mesh"],
    });
    expect(added.find((t) => t.category === "Sports Shoes")?.default_sizes).toEqual(["7", "8", "9"]);

    const renamed = upsertCategoryTemplate(
      added,
      {
        category: "Running Shoes",
        default_sizes: ["6", "7", "8", "9", "10"],
        default_colours: ["Black"],
        default_pieces_per_carton: 16,
        extra_fields: ["Sole Type"],
      },
      "Sports Shoes"
    );
    expect(renamed.find((t) => t.category === "Sports Shoes")).toBeUndefined();
    expect(renamed.find((t) => t.category === "Running Shoes")?.default_pieces_per_carton).toBe(16);

    const removed = removeCategoryTemplate(renamed, "Running Shoes");
    expect(removed.find((t) => t.category === "Running Shoes")).toBeUndefined();
  });

  it("parses comma-separated lists with trimming and deduplication", () => {
    expect(parseCommaList(" 6, 7, 8, 7 , , 9 ")).toEqual(["6", "7", "8", "9"]);
  });

  it("provides 5 vertical presets (footwear, apparel, electronics, fmcg, hardware)", () => {
    expect(VERTICAL_CATEGORY_PRESETS.map((p) => p.key)).toEqual([
      "footwear",
      "apparel",
      "electronics",
      "fmcg",
      "hardware",
    ]);
    const apparel = getPresetCategoriesForVertical("apparel");
    expect(apparel.map((c) => c.category)).toContain("Men's Wear");
    expect(resolveCategoryTemplates(null, "electronics").map((c) => c.category)).toContain("Smartphones");
  });
});
