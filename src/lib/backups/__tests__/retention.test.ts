import { describe, expect, it } from "vitest";
import { backupsToPrune } from "../retention";
import { encodeRestoreValue } from "../restore-encoding";

const now = new Date("2026-11-24T00:00:00.000Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

describe("backup retention", () => {
  it("keeps every backup from the last 2 days", () => {
    const list = Array.from({ length: 7 }, (_, i) => ({ id: `b${i}`, created_at: hoursAgo(i * 8) }));
    expect(backupsToPrune(list, now)).toEqual([]);
  });

  it("keeps one per day after 2 days", () => {
    const list = [
      { id: "new", created_at: hoursAgo(1) },
      { id: "new2", created_at: hoursAgo(2) },
      { id: "new3", created_at: hoursAgo(3) },
      { id: "dayLate", created_at: "2026-11-10T12:00:00.000Z" },
      { id: "dayEarly", created_at: "2026-11-10T04:00:00.000Z" },
    ];
    expect(backupsToPrune(list, now)).toEqual(["dayEarly"]);
  });

  it("never removes the three newest, however old", () => {
    const list = ["2024-01-01", "2024-01-02", "2024-01-03", "2024-01-04"].map((d) => ({ id: d, created_at: `${d}T00:00:00Z` }));
    expect(backupsToPrune(list, now)).toEqual(["2024-01-01"]);
  });

  it("restores JSON columns without damaging other values", () => {
    expect(encodeRestoreValue(["a"], "jsonb")).toBe('["a"]');
    expect(encodeRestoreValue(["a"], "ARRAY")).toEqual(["a"]);
    expect(encodeRestoreValue(null, "jsonb")).toBeNull();
  });
});
