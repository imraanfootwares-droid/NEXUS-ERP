"use client";

/**
 * Client-side WebP compression to protect Cloudflare R2 10GB free tier.
 * Produces `full` (max 1200px, q=0.80, <= 500KB) and `thumb` (400px, q=0.75, ~20KB).
 */

/** Must match the value signed by the server for public uploads. */
export const IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable";

export interface CompressedImagePair {
  fullBlob: Blob;
  thumbBlob: Blob;
  hash: string;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo format is not supported. Please use a JPG, PNG or WebP image."));
    };
    img.src = url;
  });
}

async function renderWebp(
  img: HTMLImageElement,
  maxDim: number,
  quality: number
): Promise<Blob> {
  const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * ratio));
  const height = Math.max(1, Math.round(img.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  ctx.drawImage(img, 0, 0, width, height);

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));

  const webp = await encode("image/webp");
  if (webp?.type === "image/webp") return webp;

  // iPhone Safari cannot create WebP and would return a very large PNG, so use JPEG there.
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("Could not process this photo. Please try another image.");
  return jpeg;
}

async function shortSha256Hex(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function compressProductImage(file: File): Promise<CompressedImagePair> {
  const img = await loadImage(file);
  let fullBlob = await renderWebp(img, 1200, 0.8);
  if (fullBlob.size > 500 * 1024) {
    fullBlob = await renderWebp(img, 1000, 0.72);
  }
  if (fullBlob.size > 500 * 1024) {
    throw new Error("Compressed image exceeds 500 KB limit. Please choose a smaller image.");
  }
  const thumbBlob = await renderWebp(img, 400, 0.75);
  const hash = await shortSha256Hex(fullBlob);
  return { fullBlob, thumbBlob, hash };
}

export async function compressLogoImage(file: File): Promise<{ blob: Blob; hash: string }> {
  const img = await loadImage(file);
  let blob = await renderWebp(img, 600, 0.85);
  if (blob.size > 200 * 1024) {
    blob = await renderWebp(img, 480, 0.75);
  }
  if (blob.size > 200 * 1024) {
    throw new Error("Logo exceeds 200 KB limit.");
  }
  const hash = await shortSha256Hex(blob);
  return { blob, hash };
}

export function deriveThumbKey(fullKey: string): string {
  if (fullKey.startsWith("data:") || fullKey.startsWith("http://") || fullKey.startsWith("https://")) {
    return fullKey;
  }
  if (fullKey.endsWith(".webp")) {
    return fullKey.replace(/\.webp$/, "_thumb.webp");
  }
  return `${fullKey}_thumb.webp`;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Compresses image to WebP and uploads directly to Cloudflare R2 via presigned PUT URLs.
 * In Dev Preview Mode (when R2 env vars are not yet set), falls back to an in-memory WebP Data URL.
 */
export async function uploadProductPhotoToStorage(
  file: File
): Promise<{ fullKey: string; via: "r2" | "dev_preview" }> {
  const { fullBlob, thumbBlob, hash } = await compressProductImage(file);

  const pFullRes = await fetch("/api/storage/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      purpose: "product_full",
      hash,
      contentLength: fullBlob.size,
      contentType: fullBlob.type,
    }),
  });
  const pFull = await pFullRes.json();
  if (!pFullRes.ok || pFull.error) {
    throw new Error(pFull.error || "Failed to initialize photo upload.");
  }

  if (pFull.devFallback) {
    const dataUrl = await blobToDataUrl(thumbBlob);
    return { fullKey: dataUrl, via: "dev_preview" };
  }

  const pThumbRes = await fetch("/api/storage/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      purpose: "product_thumb",
      hash,
      contentLength: thumbBlob.size,
      contentType: thumbBlob.type,
    }),
  });
  const pThumb = await pThumbRes.json();
  if (!pThumbRes.ok || pThumb.error) {
    throw new Error(pThumb.error || "Failed to initialize thumbnail upload.");
  }

  const [upFull, upThumb] = await Promise.all([
    fetch(pFull.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": fullBlob.type, "Cache-Control": IMAGE_CACHE_CONTROL },
      body: fullBlob,
    }),
    fetch(pThumb.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": thumbBlob.type, "Cache-Control": IMAGE_CACHE_CONTROL },
      body: thumbBlob,
    }),
  ]);

  if (!upFull.ok || !upThumb.ok) {
    throw new Error("Photo upload failed. Please check your internet and try again.");
  }

  return { fullKey: pFull.key, via: "r2" };
}
