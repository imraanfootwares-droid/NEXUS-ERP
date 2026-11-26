/**
 * Fetches an image URL and returns a base64 PNG/JPEG data URI that
 * `@react-pdf/renderer` can embed without native C++ addons (Cloudflare Workers safe).
 * Returns null if the image cannot be fetched or is an unsupported format (e.g. WebP).
 */
export async function fetchImageForPdf(
  url: string | null | undefined,
  _opts?: { format?: "jpeg" | "png"; maxDim?: number }
): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/png;base64,") || url.startsWith("data:image/jpeg;base64,")) {
    return url;
  }
  if (url.startsWith("data:image/")) {
    // @react-pdf/renderer only supports PNG and JPEG data URIs
    return null;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        cache: "force-cache",
      });
      if (!res.ok) return null;
      const contentType = (res.headers.get("content-type") || "").toLowerCase().split(";")[0].trim();
      if (contentType !== "image/png" && contentType !== "image/jpeg" && contentType !== "image/jpg") {
        return null;
      }
      const normalizedType = contentType === "image/jpg" ? "image/jpeg" : contentType;
      const buf = Buffer.from(await res.arrayBuffer());
      return `data:${normalizedType};base64,${buf.toString("base64")}`;
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return null;
  }
}
