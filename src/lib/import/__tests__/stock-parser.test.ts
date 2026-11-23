import { describe, expect, it } from "vitest";
import { buildStockTemplateWorkbook, parseStockRows } from "../stock-parser";

describe("Dynamic Bulk Stock Import Parser", () => {
  it("parses dynamic attributes, auto-generates SKUs, and flags invalid rows", () => {
    const res = parseStockRows(
      [
        {
          model_code: "imr-101",
          name: "Oxford Derby",
          hsn_code: "6403",
          gst_rate: 5,
          attr_Size: "UK 8",
          attr_Colour: "Tan",
          field_upper_material: "Leather",
          cost_price: 900,
          mrp: 2499,
          selling_price: 2199,
          wholesale_price: 1450,
          opening_qty: 12,
        },
        {
          model_code: "",
          name: "Missing Code",
          gst_rate: 5,
        },
        {
          model_code: "imr-102",
          name: "Bad Tax",
          gst_rate: 55,
        },
      ],
      ["Size", "Colour"],
      ["upper_material"],
      "Pair"
    );

    expect(res.validRows).toHaveLength(1);
    expect(res.validRows[0].sku).toBe("IMR-101-UK8-TAN");
    expect(res.validRows[0].attributes).toEqual({ Size: "UK 8", Colour: "Tan" });
    expect(res.validRows[0].custom_fields).toEqual({ upper_material: "Leather" });
    expect(res.errors).toHaveLength(2);
  });

  it("generates an xlsx template workbook buffer", () => {
    const buf = buildStockTemplateWorkbook(["Size", "Colour"], ["Upper Material"], "Pair");
    expect(buf.byteLength).toBeGreaterThan(500);
  });
});
