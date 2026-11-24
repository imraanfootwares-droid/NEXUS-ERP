export interface SizeRunVariant {
  attributes: Record<string, string>;
}

export interface SizeRunMatch<T> {
  hits: Array<{ variant: T; qty: number }>;
  missing: string[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The attribute that holds sizes is the one whose values appear in the carton presets. */
export function sizeAxisKey(variants: SizeRunVariant[], sizes: string[]): string | null {
  const scores = new Map<string, number>();
  for (const variant of variants) {
    for (const [key, value] of Object.entries(variant.attributes)) {
      if (sizes.some((size) => same(size, value))) scores.set(key, (scores.get(key) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  for (const [key, score] of scores) {
    if (best === null || score > (scores.get(best) ?? 0)) best = key;
  }
  return best;
}

/** Everything except size, such as "Black" or "Black / Leather". */
export function variantOption(variant: SizeRunVariant, sizeKey: string | null): string {
  return Object.entries(variant.attributes)
    .filter(([key]) => key !== sizeKey)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value)
    .join(" / ");
}

export function variantOptions(variants: SizeRunVariant[], sizes: string[]): string[] {
  const sizeKey = sizeAxisKey(variants, sizes);
  return [...new Set(variants.map((v) => variantOption(v, sizeKey)).filter(Boolean))];
}

/** Matches a carton to one exact colour. A size without that colour is reported, never swapped. */
export function matchSizeRun<T extends SizeRunVariant>(
  variants: T[],
  ratios: Record<string, number>,
  option: string,
  allSizes: string[] = Object.keys(ratios)
): SizeRunMatch<T> {
  const sizeKey = sizeAxisKey(variants, [...allSizes, ...Object.keys(ratios)]);
  const hits: SizeRunMatch<T>["hits"] = [];
  const missing: string[] = [];
  for (const [size, qty] of Object.entries(ratios)) {
    if (qty <= 0) continue;
    const variant = sizeKey
      ? variants.find((v) => same(v.attributes[sizeKey] ?? "", size) && variantOption(v, sizeKey) === option)
      : undefined;
    if (variant) hits.push({ variant, qty });
    else missing.push(size);
  }
  return { hits, missing };
}
