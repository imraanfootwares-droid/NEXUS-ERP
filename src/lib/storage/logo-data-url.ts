export const LOGO_HIDE_SENTINEL = "__HIDE__";

/**
 * Resolves which company logo to print on a bill or PDF.
 * Priority:
 *   1. Per-bill override (on a single invoice; "__HIDE__" hides logo for this bill)
 *   2. Bill design template override (configured in Bill Designs)
 *   3. Shop Profile default logo (uploaded once in Settings & Profile)
 */
export function resolveEffectiveLogoUrl(params: {
  perBillOverride?: string | null;
  templateOverride?: string | null;
  profileDefault?: string | null;
}): string | null {
  if (params.perBillOverride === LOGO_HIDE_SENTINEL) return null;
  if (params.perBillOverride) return params.perBillOverride;
  if (params.templateOverride === LOGO_HIDE_SENTINEL) return null;
  if (params.templateOverride) return params.templateOverride;
  return params.profileDefault || null;
}

/**
 * Browser-side helper: shrinks any uploaded image (PNG/JPG/WebP/SVG) into a
 * crisp <=220px PNG data URL that works in HTML bills AND React-PDF documents
 * with zero external network latency.
 */
export async function fileToLogoPngDataUrl(file: File, maxDim = 220): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Could not read logo image."));
      el.src = objectUrl;
    });
    const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * ratio));
    const h = Math.max(1, Math.round(img.height * ratio));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) throw new Error("Canvas unavailable");
    ctx2d.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
