import type { CategoryTemplate } from "@/types/database";

export interface FreeVisionAiTool {
  id: string;
  name: string;
  url: string;
  note: string;
}

export const FREE_VISION_AI_CHATS: FreeVisionAiTool[] = [
  { id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/", note: "Upload bill photo & paste" },
  { id: "gemini", name: "Google Gemini", url: "https://gemini.google.com/app", note: "Free photo scan" },
  { id: "aistudio", name: "Google AI Studio", url: "https://aistudio.google.com/prompts/new_chat", note: "Fast & accurate" },
  { id: "deepseek", name: "DeepSeek", url: "https://chat.deepseek.com/", note: "Free chat" },
  { id: "claude", name: "Claude", url: "https://claude.ai/new", note: "Clean JSON output" },
];

export interface ExistingCatalogProductSummary {
  id: string;
  name: string;
  code: string;
}

export interface ParsedAiBillItem {
  key: string;
  product_name: string;
  model_code: string;
  category: string;
  colour: string;
  /** Map of size -> pairs/pieces (e.g. { "6": 2, "7": 4, "8": 6 }). Empty if only total_qty was given. */
  sizes: Record<string, number>;
  total_qty: number;
  cost_price: number;
  selling_price: number;
  hsn_code: string;
  gst_rate: number;
  matchedProductId: string | null;
  isNewProduct: boolean;
}

export interface ParsedAiOtherCharge {
  key: string;
  name: string;
  qty: number;
  rate: number;
}

export interface ParsedAiPurchaseBill {
  bill_no: string;
  paid_amount: number;
  payment_mode: "cash" | "upi" | "bank_transfer" | "card";
  items: ParsedAiBillItem[];
  other_charges: ParsedAiOtherCharge[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const normCode = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9-]+/g, "");

/**
 * Generates a plain, strict prompt tailored to the shop's configured
 * product categories, sizes, colours, attached fields, and existing catalog.
 */
export function buildPurchaseBillAiPrompt(params: {
  supplierName: string;
  categoryTemplates: CategoryTemplate[];
  existingProducts: ExistingCatalogProductSummary[];
}): string {
  const { supplierName, categoryTemplates, existingProducts } = params;

  const categoryLines =
    categoryTemplates.length > 0
      ? categoryTemplates
          .map((t) => {
            const sizes = t.default_sizes.length > 0 ? t.default_sizes.join(", ") : "any";
            const colours = t.default_colours.length > 0 ? t.default_colours.join(", ") : "any";
            const fields = t.extra_fields.length > 0 ? t.extra_fields.join(", ") : "none";
            return `- Category "${t.category}" | Sizes: [${sizes}] | Colours: [${colours}] | Box size: ${t.default_pieces_per_carton} | Extra fields: [${fields}]`;
          })
          .join("\n")
      : '- Category "General" | Sizes: [any] | Colours: [any]';

  const existingLines =
    existingProducts.length > 0
      ? existingProducts
          .slice(0, 60)
          .map((p) => `- ${p.code}: ${p.name}`)
          .join("\n")
      : "(No existing products yet — generate short clean model_code like ART-101 for each item.)";

  return [
    `You are reading a supplier purchase bill / invoice photo for supplier "${supplierName}".`,
    `Extract every product line, size breakdown, quantity, unit cost price, GST %, and any extra charges (freight, packing, transport).`,
    ``,
    `OUR SHOP'S PRODUCT CATEGORIES & SIZES:`,
    categoryLines,
    ``,
    `OUR EXISTING CATALOG (reuse the exact model_code if an item matches):`,
    existingLines,
    ``,
    `RULES:`,
    `1. Return ONLY valid JSON — no markdown explanation, no extra text.`,
    `2. If a product has size-wise quantities (e.g. size 6=2, 7=4, 8=6), put them in "sizes": { "6": 2, "7": 4, "8": 6 } and set "total_qty" to the sum (18).`,
    `3. If the bill only gives a total quantity or cartons (e.g. 2 cartons x 20 pairs = 40), set "sizes": {} and "total_qty": 40.`,
    `4. "cost_price" must be the per-pair / per-piece buy rate (numbers only, no ₹ symbol).`,
    `5. Pick the closest "category" from OUR SHOP'S PRODUCT CATEGORIES above.`,
    `6. Put transport, freight, packing, or non-stock charges inside "other_charges".`,
    ``,
    `REQUIRED JSON FORMAT:`,
    `{`,
    `  "bill_no": "INV-104",`,
    `  "paid_amount": 0,`,
    `  "payment_mode": "cash",`,
    `  "items": [`,
    `    {`,
    `      "product_name": "Classic Runner",`,
    `      "model_code": "RUN-101",`,
    `      "category": "${categoryTemplates[0]?.category || "Men's Footwear"}",`,
    `      "colour": "Black",`,
    `      "sizes": { "6": 2, "7": 4, "8": 6 },`,
    `      "total_qty": 12,`,
    `      "cost_price": 320,`,
    `      "selling_price": 599,`,
    `      "hsn_code": "6403",`,
    `      "gst_rate": 5`,
    `    }`,
    `  ],`,
    `  "other_charges": [`,
    `    { "name": "Transport", "qty": 1, "rate": 250 }`,
    `  ]`,
    `}`,
  ].join("\n");
}

function extractJsonString(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

const safeNum = (v: unknown, fallback = 0): number => {
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, v);
  if (typeof v === "string") {
    const cleaned = v.replace(/[^0-9.-]/g, "");
    const n = Number(cleaned);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return fallback;
};

function autoModelCode(name: string, index: number): string {
  const words = name
    .replace(/[^a-zA-Z0-9\s]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const prefix =
    words.length >= 2
      ? (words[0].slice(0, 3) + words[1].slice(0, 2)).toUpperCase()
      : (words[0] || "ITEM").slice(0, 5).toUpperCase();
  return `${prefix}-${101 + index}`;
}

export function formatSizesText(sizes: Record<string, number>): string {
  return Object.entries(sizes)
    .filter(([, q]) => q > 0)
    .map(([sz, q]) => `${sz}:${q}`)
    .join(", ");
}

export function parseSizesText(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const sep = trimmed.includes(":") ? ":" : trimmed.includes("=") ? "=" : null;
    if (sep) {
      const [sz, qtyStr] = trimmed.split(sep);
      const q = Math.floor(safeNum(qtyStr, 0));
      if (sz?.trim() && q > 0) out[sz.trim()] = q;
    }
  }
  return out;
}

export function parsePurchaseBillAiResponse(
  rawText: string,
  existingProducts: ExistingCatalogProductSummary[],
  defaultCategory = ""
): { ok: true; data: ParsedAiPurchaseBill } | { ok: false; error: string } {
  if (!rawText.trim()) {
    return { ok: false, error: "Paste the JSON reply from your AI chat first." };
  }

  let parsed: Record<string, unknown>;
  try {
    const jsonStr = extractJsonString(rawText);
    const obj = JSON.parse(jsonStr);
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return { ok: false, error: "Could not find a JSON object. Copy the full JSON reply from your AI chat." };
    }
    parsed = obj as Record<string, unknown>;
  } catch {
    return {
      ok: false,
      error: "The pasted text is not valid JSON. Ask the AI to reply with JSON only, then paste it again.",
    };
  }

  const rawItems = Array.isArray(parsed.items) ? parsed.items : [];
  const rawCharges = Array.isArray(parsed.other_charges) ? parsed.other_charges : [];

  const byCode = new Map(existingProducts.map((p) => [normCode(p.code), p]));
  const byName = new Map(existingProducts.map((p) => [norm(p.name), p]));

  const items: ParsedAiBillItem[] = [];
  rawItems.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") return;
    const r = entry as Record<string, unknown>;
    const rawName = String(r.product_name ?? r.name ?? "").trim();
    const rawCode = String(r.model_code ?? r.code ?? "").trim();
    if (!rawName && !rawCode) return;

    const matched =
      (rawCode ? byCode.get(normCode(rawCode)) : undefined) ??
      (rawName ? byName.get(norm(rawName)) : undefined) ??
      null;

    const sizes: Record<string, number> = {};
    if (r.sizes && typeof r.sizes === "object" && !Array.isArray(r.sizes)) {
      for (const [k, v] of Object.entries(r.sizes as Record<string, unknown>)) {
        const q = Math.floor(safeNum(v, 0));
        if (k.trim() && q > 0) sizes[k.trim()] = q;
      }
    } else if (typeof r.size === "string" && r.size.trim()) {
      const q = Math.floor(safeNum(r.qty ?? r.total_qty ?? r.quantity, 0));
      if (q > 0) sizes[r.size.trim()] = q;
    }

    const sizeSum = Object.values(sizes).reduce((s, q) => s + q, 0);
    const cartons = safeNum(r.cartons, 0);
    const perCarton = safeNum(r.pairs_per_carton ?? r.per_carton, 0);
    const fallbackTotal =
      safeNum(r.total_qty ?? r.qty ?? r.quantity, 0) || (cartons > 0 && perCarton > 0 ? cartons * perCarton : 0);
    const totalQty = sizeSum > 0 ? sizeSum : Math.floor(fallbackTotal);

    const costPrice = safeNum(r.cost_price ?? r.rate ?? r.price, 0);
    const sellingPrice = safeNum(r.selling_price ?? r.mrp, 0) || costPrice;

    items.push({
      key: `ai-item-${idx + 1}`,
      product_name: matched?.name || rawName || rawCode,
      model_code: matched?.code || (rawCode ? normCode(rawCode) : autoModelCode(rawName, idx)),
      category: String(r.category ?? "").trim() || defaultCategory,
      colour: String(r.colour ?? r.color ?? "").trim(),
      sizes,
      total_qty: totalQty,
      cost_price: costPrice,
      selling_price: sellingPrice,
      hsn_code: String(r.hsn_code ?? r.hsn ?? "6403").trim() || "6403",
      gst_rate: safeNum(r.gst_rate ?? r.gst, 5),
      matchedProductId: matched?.id ?? null,
      isNewProduct: !matched,
    });
  });

  const otherCharges: ParsedAiOtherCharge[] = [];
  rawCharges.forEach((entry, idx) => {
    if (!entry || typeof entry !== "object") return;
    const r = entry as Record<string, unknown>;
    const name = String(r.name ?? r.description ?? "").trim();
    if (!name) return;
    otherCharges.push({
      key: `ai-chg-${idx + 1}`,
      name,
      qty: Math.max(1, safeNum(r.qty ?? r.quantity, 1)),
      rate: safeNum(r.rate ?? r.amount ?? r.price, 0),
    });
  });

  if (items.length === 0 && otherCharges.length === 0) {
    return { ok: false, error: "No items or charges were found in that JSON. Check the AI reply and try again." };
  }

  const rawMode = String(parsed.payment_mode ?? "cash").toLowerCase().trim();
  const paymentMode: ParsedAiPurchaseBill["payment_mode"] =
    rawMode === "upi" || rawMode === "bank_transfer" || rawMode === "card" ? rawMode : "cash";

  return {
    ok: true,
    data: {
      bill_no: String(parsed.bill_no ?? parsed.invoice_no ?? "").trim(),
      paid_amount: safeNum(parsed.paid_amount, 0),
      payment_mode: paymentMode,
      items,
      other_charges: otherCharges,
    },
  };
}
