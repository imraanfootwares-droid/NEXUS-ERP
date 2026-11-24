import zlib from "zlib";
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildCsvZip, buildWorkbook, csvCell, toCsv, type ExportSheet } from "../full-export";

const sheet: ExportSheet = {
  table: "customers",
  label: "Customers",
  columns: ["name", "phone", "due"],
  rows: [
    ['Asha, "Rao"', "+91 91234 56780", 1200.5],
    ["=2+2", null, 0],
  ],
};

describe("full data export", () => {
  it("escapes CSV and blocks spreadsheet formulas", () => {
    expect(csvCell('Asha, "Rao"')).toBe('"Asha, ""Rao"""');
    expect(csvCell("=2+2")).toBe("'=2+2");
    expect(csvCell("+91 91234 56780")).toBe("+91 91234 56780");
    expect(csvCell(null)).toBe("");
  });

  it("writes a workbook with a summary and every row", () => {
    const book = XLSX.read(buildWorkbook([sheet]));
    expect(book.SheetNames).toEqual(["Summary", "Customers"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(book.Sheets.Customers!);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.due).toBe(1200.5);
  });

  it("creates a valid zip containing the CSV", () => {
    const zip = buildCsvZip([sheet]);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const nameLength = zip.readUInt16LE(26);
    expect(zip.subarray(30, 30 + nameLength).toString()).toBe("customers.csv");
    const packedLength = zip.readUInt32LE(18);
    const raw = zlib.inflateRawSync(zip.subarray(30 + nameLength, 30 + nameLength + packedLength));
    expect(raw.toString("utf8")).toBe(toCsv(sheet));
  });
});
