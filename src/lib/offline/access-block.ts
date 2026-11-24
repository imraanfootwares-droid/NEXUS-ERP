import type { AccessBlock } from "@/types/database";

const keyFor = (tenantId: string, userId: string) => `nexus:access-block:${tenantId}:${userId}`;

/** Last block confirmed by the server, so the block still applies with no internet. */
export function readCachedBlock(tenantId: string, userId: string): AccessBlock | null {
  try {
    const raw = window.localStorage.getItem(keyFor(tenantId, userId));
    return raw ? (JSON.parse(raw) as AccessBlock) : null;
  } catch {
    return null;
  }
}

export function writeCachedBlock(tenantId: string, userId: string, block: AccessBlock | null): void {
  try {
    if (block) window.localStorage.setItem(keyFor(tenantId, userId), JSON.stringify(block));
    else window.localStorage.removeItem(keyFor(tenantId, userId));
  } catch {
    // Storage can be unavailable in private windows; the server still enforces the block.
  }
}

/** `known: false` means the server could not answer, so the saved state must be kept. */
export async function fetchAccessStatus(): Promise<{ known: true; block: AccessBlock | null } | { known: false }> {
  try {
    const res = await fetch("/api/access-status", { cache: "no-store" });
    if (!res.ok) return { known: false };
    const data = (await res.json()) as { block?: AccessBlock | null };
    return { known: true, block: data.block ?? null };
  } catch {
    return { known: false };
  }
}
