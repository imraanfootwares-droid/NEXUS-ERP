import { NextResponse } from "next/server";
import { buildCsvZip, buildWorkbook, type ExportSheet } from "./full-export";
import { buildExportPdf } from "./full-export-pdf";

const CONTENT: Record<string, { ext: string; type: string }> = {
  xlsx: { ext: "xlsx", type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  csv: { ext: "zip", type: "application/zip" },
  pdf: { ext: "pdf", type: "application/pdf" },
};

export const isExportFormat = (format: string) => format in CONTENT;

export async function exportResponse(sheets: ExportSheet[], format: string, name: string, title: string) {
  const now = new Date();
  const body =
    format === "xlsx"
      ? buildWorkbook(sheets)
      : format === "csv"
      ? buildCsvZip(sheets)
      : await buildExportPdf(sheets, title, now.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }));
  const { ext, type } = CONTENT[format]!;
  const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "nexus";
  const stamp = new Date(now.getTime() + 5.5 * 3600_000).toISOString().slice(0, 16).replace(/[T:]/g, "-");
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${safeName}-full-export-${stamp}.${ext}"`,
      "Content-Length": String(body.length),
      "Cache-Control": "private, no-store",
    },
  });
}
