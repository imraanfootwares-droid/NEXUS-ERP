import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORY_TEMPLATES } from "@/lib/catalog/category-templates";
import {
  buildPurchaseBillAiPrompt,
  formatSizesText,
  FREE_VISION_AI_CHATS,
  parsePurchaseBillAiResponse,
  parseSizesText,
} from "../purchase-bill-ai";

const CATALOG = [
  { id: "p1", name: "Classic Runner", code: "RUN-101" },
  { id: "p2", name: "Ladies Comfort Sandal", code: "LAD-202" },
];

describe("purchase-bill-ai prompt & parser", () => {
  it("builds a dynamic prompt with configured categories, sizes, and catalog products", () => {
    const prompt = buildPurchaseBillAiPrompt({
      supplierName: "Agra Footwear Factory",
      categoryTemplates: DEFAULT_CATEGORY_TEMPLATES,
      existingProducts: CATALOG,
    });
    expect(prompt).toContain("Agra Footwear Factory");
    expect(prompt).toContain("Men's Footwear");
    expect(prompt).toContain("Baby Footwear");
    expect(prompt).toContain("0-3M, 3-6M, 6-12M");
    expect(prompt).toContain("RUN-101: Classic Runner");
    expect(FREE_VISION_AI_CHATS.map((c) => c.id)).toEqual(
      expect.arrayContaining(["chatgpt", "gemini", "aistudio", "deepseek"])
    );
  });

  it("parses markdown-fenced JSON, matches existing products, and flags new products", () => {
    const aiReply = `Here is the extracted bill:
\`\`\`json
{
  "bill_no": "AG-889",
  "paid_amount": 5000,
  "payment_mode": "upi",
  "items": [
    {
      "product_name": "Classic Runner",
      "model_code": "run-101",
      "category": "Men's Footwear",
      "colour": "Black",
      "sizes": { "7": 4, "8": 6, "9": 4 },
      "cost_price": 310,
      "gst_rate": 5
    },
    {
      "product_name": "Baby Soft Bootie",
      "category": "Baby Footwear",
      "colour": "Pink",
      "sizes": { "0-3M": 6, "3-6M": 6 },
      "cost_price": 120,
      "selling_price": 249
    }
  ],
  "other_charges": [
    { "name": "Transport", "qty": 1, "rate": 300 }
  ]
}
\`\`\``;

    const res = parsePurchaseBillAiResponse(aiReply, CATALOG, "Men's Footwear");
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.data.bill_no).toBe("AG-889");
    expect(res.data.paid_amount).toBe(5000);
    expect(res.data.payment_mode).toBe("upi");
    expect(res.data.items).toHaveLength(2);

    expect(res.data.items[0].matchedProductId).toBe("p1");
    expect(res.data.items[0].isNewProduct).toBe(false);
    expect(res.data.items[0].total_qty).toBe(14);

    expect(res.data.items[1].matchedProductId).toBeNull();
    expect(res.data.items[1].isNewProduct).toBe(true);
    expect(res.data.items[1].model_code).toMatch(/^BABSO-/);
    expect(res.data.items[1].total_qty).toBe(12);

    expect(res.data.other_charges).toHaveLength(1);
    expect(res.data.other_charges[0].rate).toBe(300);
  });

  it("handles flat size/qty rows and formats/parses size strings", () => {
    const raw = JSON.stringify({
      items: [{ product_name: "Kids Sneaker", size: "3", qty: 10, cost_price: 200 }],
    });
    const res = parsePurchaseBillAiResponse(raw, CATALOG);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.items[0].sizes).toEqual({ "3": 10 });
    expect(formatSizesText({ "6": 2, "7": 4 })).toBe("6:2, 7:4");
    expect(parseSizesText("6:2, 7=4, 8:6")).toEqual({ "6": 2, "7": 4, "8": 6 });
  });

  it("returns a helpful plain-English error for invalid JSON", () => {
    const res = parsePurchaseBillAiResponse("not valid json at all", CATALOG);
    expect(res.ok).toBe(false);
  });
});
