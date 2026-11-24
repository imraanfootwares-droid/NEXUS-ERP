import { describe, expect, it } from "vitest";
import { normalizeGstin, normalizePhone, walkInDisplayName } from "../walk-in-identity";

describe("walk-in customer identity", () => {
  it("treats common phone formats as the same number", () => {
    for (const raw of ["9123456780", "+91 91234 56780", "09123456780", "91-9123456780"]) {
      expect(normalizePhone(raw)).toBe("9123456780");
    }
  });

  it("rejects incomplete phone numbers", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
  });

  it("accepts only well-formed GSTINs", () => {
    expect(normalizeGstin(" 33aabcu9603r1zm ")).toBe("33AABCU9603R1ZM");
    expect(normalizeGstin("33AABCU")).toBeNull();
  });

  it("uses the contact when no real name was entered", () => {
    expect(walkInDisplayName("Walk-In Customer", "9123456780", null)).toBe("Customer 9123456780");
    expect(walkInDisplayName("  Asha Rao ", "9123456780", null)).toBe("Asha Rao");
  });
});
