import sharp from "sharp";

/**
 * Fetches an image URL (including WebP from Cloudflare R2) and converts it into a
 * base64 data URI (JPEG or PNG) that `@react-pdf/renderer` can reliably embed.
 * Returns null if the image cannot be fetched or decoded.
 */
export async function fetchImageForPdf(
  url: string | null | undefined,
  opts?: { format?: "jpeg" | "png"; maxDim?: number }
): Promise<string | null> {
  if (!url) return null;
  if (url.startsWith("data:image/png;base64,") || url.startsWith("data:image/jpeg;base64,")) {
    return url;
  }

  const format = opts?.format ?? "jpeg";
  const maxDim = opts?.maxDim ?? 420;

  try {
    let inputBuf: Buffer;
    if (url.startsWith("data:image/")) {
      const commaIdx = url.indexOf(",");
      if (commaIdx < 0) return null;
      inputBuf = Buffer.from(url.slice(commaIdx + 1), "base64");
    } else {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(url, {
          signal: controller.signal,
          cache: "force-cache",
        });
        if (!res.ok) return null;
        inputBuf = Buffer.from(await res.arrayBuffer());
      } finally {
        clearTimeout(timeout);
      }
    }

    const pipeline = sharp(inputBuf).resize(maxDim, maxDim, {
      fit: "inside",
      withoutEnlargement: true,
    });

    if (format === "png") {
      const out = await pipeline.png({ compressionLevel: 8 }).toBuffer();
      return `data:image/png;base64,${out.toString("base64")}`;
    }

    const out = await pipeline
      .flatten({ background: "#f8fafc" })
      .jpeg({ quality: 86, mozjpeg: true })
      .toBuffer();
    return `data:image/jpeg;base64,${out.toString("base64")}`;
  } catch {
    return null;
  }
}
