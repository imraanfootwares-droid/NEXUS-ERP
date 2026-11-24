import React from "react";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ExportCell, ExportSheet } from "./full-export";

export const PDF_ROW_LIMIT = 300;
const PDF_COLUMN_LIMIT = 7;

const styles = StyleSheet.create({
  page: { padding: 24, paddingBottom: 36, fontSize: 7.5, fontFamily: "Helvetica", color: "#171717" },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 3 },
  muted: { color: "#77777d", marginBottom: 12 },
  heading: { fontSize: 11, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: "#e7e7ea", paddingVertical: 2.5 },
  head: { backgroundColor: "#f1f1f2", fontFamily: "Helvetica-Bold" },
  cell: { flex: 1, paddingHorizontal: 2.5 },
  footer: { position: "absolute", bottom: 14, left: 24, right: 24, color: "#a3a3a8", textAlign: "right" },
});

const isUseful = (column: string) => column !== "id" && column !== "tenant_id" && !column.endsWith("_id");

function pickColumns(sheet: ExportSheet): number[] {
  const useful = sheet.columns.flatMap((c, i) => {
    if (!isUseful(c)) return [];
    const isJson = sheet.rows.some((r) => typeof r[i] === "string" && /^[[{]/.test(r[i] as string));
    return isJson ? [] : [i];
  });
  return (useful.length ? useful : sheet.columns.map((_, i) => i)).slice(0, PDF_COLUMN_LIMIT);
}

const printable = (value: ExportCell) => {
  if (value === null) return "";
  const text = String(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
};

export async function buildExportPdf(sheets: ExportSheet[], title: string, generatedAt: string): Promise<Buffer> {
  const filled = sheets.filter((s) => s.rows.length > 0);
  const doc = (
    <Document title={title}>
      <Page size="A4" orientation="landscape" style={styles.page}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.muted}>Generated {generatedAt} IST. Use the Excel or CSV export for every column and row.</Text>
        <View style={[styles.row, styles.head]}>
          <Text style={styles.cell}>Data</Text>
          <Text style={styles.cell}>Rows</Text>
        </View>
        {sheets.map((s) => (
          <View key={s.table} style={styles.row} wrap={false}>
            <Text style={styles.cell}>{s.label}</Text>
            <Text style={styles.cell}>{s.rows.length}</Text>
          </View>
        ))}
        <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      </Page>
      {filled.map((s) => {
        const cols = pickColumns(s);
        return (
          <Page key={s.table} size="A4" orientation="landscape" style={styles.page} wrap>
            <Text style={styles.heading}>{s.label}</Text>
            <Text style={styles.muted}>
              {s.rows.length > PDF_ROW_LIMIT ? `First ${PDF_ROW_LIMIT} of ${s.rows.length} rows` : `${s.rows.length} rows`}
              {s.columns.length > cols.length ? `, ${cols.length} of ${s.columns.length} columns` : ""}
            </Text>
            <View style={[styles.row, styles.head]} fixed>
              {cols.map((i) => (
                <Text key={i} style={styles.cell}>{s.columns[i]}</Text>
              ))}
            </View>
            {s.rows.slice(0, PDF_ROW_LIMIT).map((row, r) => (
              <View key={r} style={styles.row} wrap={false}>
                {cols.map((i) => (
                  <Text key={i} style={styles.cell}>{printable(row[i] ?? null)}</Text>
                ))}
              </View>
            ))}
            <Text style={styles.footer} fixed render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
          </Page>
        );
      })}
    </Document>
  );
  return Buffer.from(await renderToBuffer(doc));
}
