/** Postgres error → message a shop user can act on. Returns null for unknown errors. */
export function pgFriendlyMessage(err: unknown): string | null {
  const e = err as { code?: string; constraint?: string; detail?: string } | null;
  if (!e || typeof e !== "object" || typeof e.code !== "string") return null;
  const c = e.constraint ?? "";
  switch (e.code) {
    case "23505":
      if (/model_code/.test(c)) return "A product with this Model / Article Code already exists. Use a different code.";
      if (/sku/.test(c)) return "One of the generated SKUs already exists. Change the Model Code or variant values.";
      if (/barcode/.test(c)) return "One of the barcodes already belongs to another product.";
      return "This record already exists.";
    case "23514":
      if (/gst_rate/.test(c)) return "GST % must be between 0 and 40.";
      if (/price|mrp|cost/.test(c)) return "Prices cannot be negative.";
      return "Some values are out of the allowed range.";
    case "23503":
      return "A linked record (branch, product or party) no longer exists. Refresh and try again.";
    case "22P02":
      return "One of the values has an invalid format.";
    case "23502":
      return "A required field is missing.";
    default:
      return null;
  }
}
