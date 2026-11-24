import { describe, expect, it } from "vitest";
import { matchSizeRun, variantOptions } from "../size-run";

const v = (id: string, Size: string, Colour?: string) => ({
  id,
  attributes: (Colour ? { Size, Colour } : { Size }) as Record<string, string>,
});
const shoes = [v("b7", "UK 7", "Black"), v("b8", "UK 8", "Black"), v("r7", "UK 7", "Brown"), v("r8", "UK 8", "Brown"), v("r9", "UK 9", "Brown")];
const ratios = { "UK 7": 1, "UK 8": 2, "UK 9": 1 };

describe("size-run colour matching", () => {
  it("lists colours once", () => {
    expect(variantOptions(shoes, Object.keys(ratios))).toEqual(["Black", "Brown"]);
  });

  it("fills only the chosen colour", () => {
    const result = matchSizeRun(shoes, ratios, "Brown");
    expect(result.hits.map((h) => [h.variant.id, h.qty])).toEqual([["r7", 1], ["r8", 2], ["r9", 1]]);
    expect(result.missing).toEqual([]);
  });

  it("reports a missing size instead of using another colour", () => {
    const result = matchSizeRun(shoes, ratios, "Black");
    expect(result.hits.map((h) => h.variant.id)).toEqual(["b7", "b8"]);
    expect(result.missing).toEqual(["UK 9"]);
  });

  it("works for a product without colours", () => {
    const plain = [v("p7", "UK 7"), v("p8", "UK 8")];
    expect(variantOptions(plain, ["UK 7"])).toEqual([]);
    expect(matchSizeRun(plain, { "UK 7": 2 }, "").hits[0].variant.id).toBe("p7");
  });
});
