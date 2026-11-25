export interface WhatsAppCartLine {
  productId: string;
  variantId: string;
  name: string;
  modelCode?: string;
  sku: string;
  attrs: string;
  uom?: string;
  price: number | null;
  qty: number;
  imageUrl?: string | null;
}

export interface BuildWhatsAppMessageInput {
  tenantName: string;
  slug: string;
  origin?: string;
  items: WhatsAppCartLine[];
  customerName?: string;
  customerContact?: string;
  message?: string;
}

const fmtInr = (n: number) => Math.round(n).toLocaleString("en-IN");

/**
 * Formats a clean, grouped, WhatsApp-ready inquiry message using WhatsApp bold formatting.
 * Groups multiple sizes/colours under each product and includes clickable product links.
 */
export function buildStructuredWhatsAppMessage(input: BuildWhatsAppMessageInput): string {
  const { tenantName, slug, origin, items, customerName, customerContact, message } = input;
  const groups = new Map<
    string,
    {
      productId: string;
      name: string;
      modelCode?: string;
      uom: string;
      imageUrl?: string | null;
      lines: WhatsAppCartLine[];
    }
  >();

  for (const item of items) {
    const key = item.productId || item.name;
    const existing = groups.get(key) ?? {
      productId: item.productId,
      name: item.name,
      modelCode: item.modelCode,
      uom: item.uom || "Pair",
      imageUrl: item.imageUrl,
      lines: [],
    };
    existing.lines.push(item);
    groups.set(key, existing);
  }

  const lines: string[] = [
    `*NEW ORDER INQUIRY — ${tenantName}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    ``,
  ];

  let totalQty = 0;
  let estimatedTotal = 0;
  let hasAllPrices = items.length > 0;
  let idx = 0;

  for (const group of groups.values()) {
    idx += 1;
    const uomPlural = (q: number) => {
      const base = group.uom.toLowerCase();
      if (q === 1) return base;
      return base.endsWith("s") ? base : `${base}s`;
    };

    lines.push(`*${idx}. ${group.name}*${group.modelCode ? ` (Code: ${group.modelCode})` : ""}`);
    for (const l of group.lines) {
      totalQty += l.qty;
      const variantLabel = l.attrs || l.sku;
      if (l.price != null) {
        const lineAmt = l.price * l.qty;
        estimatedTotal += lineAmt;
        lines.push(`   • ${variantLabel} — *${l.qty.toLocaleString("en-IN")} ${uomPlural(l.qty)}* × ₹${fmtInr(l.price)} = ₹${fmtInr(lineAmt)}`);
      } else {
        hasAllPrices = false;
        lines.push(`   • ${variantLabel} — *${l.qty.toLocaleString("en-IN")} ${uomPlural(l.qty)}*`);
      }
    }

    if (origin && group.productId) {
      lines.push(`   View Product: ${origin}/s/${encodeURIComponent(slug)}/product/${group.productId}`);
    }
    if (group.imageUrl && /^https?:\/\//i.test(group.imageUrl)) {
      lines.push(`   Photo: ${group.imageUrl}`);
    }
    lines.push(``);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━━━`);
  lines.push(`*Total Quantity:* ${totalQty.toLocaleString("en-IN")} units`);
  if (hasAllPrices && estimatedTotal > 0) {
    lines.push(`*Estimated Total:* ₹${fmtInr(estimatedTotal)}`);
  }

  const buyerLines: string[] = [];
  if (customerName?.trim()) buyerLines.push(`Name: ${customerName.trim()}`);
  if (customerContact?.trim()) buyerLines.push(`Contact: ${customerContact.trim()}`);
  if (message?.trim()) buyerLines.push(`Note: ${message.trim()}`);

  if (buyerLines.length > 0) {
    lines.push(``);
    lines.push(`*Buyer Details:*`);
    lines.push(...buyerLines);
  }

  return lines.join("\n");
}
