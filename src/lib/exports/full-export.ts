import zlib from "zlib";
import type { PoolClient } from "pg";
import * as XLSX from "xlsx";

/** Every business table, in a readable order. `global` tables only appear in platform exports. */
export const EXPORT_TABLES: Array<{ table: string; label: string; global?: boolean }> = [
  { table: "tenants", label: "Businesses" },
  { table: "branches", label: "Branches" },
  { table: "profiles", label: "Staff" },
  { table: "user_branch_assignments", label: "Staff Branches" },
  { table: "customers", label: "Customers" },
  { table: "suppliers", label: "Suppliers" },
  { table: "products", label: "Products" },
  { table: "product_variants", label: "Product Variants" },
  { table: "branch_stock", label: "Branch Stock" },
  { table: "stock_ledger", label: "Stock Ledger" },
  { table: "invoices", label: "Invoices" },
  { table: "invoice_items", label: "Invoice Items" },
  { table: "invoice_payments", label: "Invoice Payments" },
  { table: "expenses", label: "Expenses" },
  { table: "day_closes", label: "Day Closes" },
  { table: "purchase_orders", label: "Purchases" },
  { table: "purchase_items", label: "Purchase Items" },
  { table: "supplier_payments", label: "Supplier Payments" },
  { table: "production_batches", label: "Production Batches" },
  { table: "production_batch_items", label: "Production Items" },
  { table: "stock_transfers", label: "Stock Transfers" },
  { table: "stock_transfer_items", label: "Transfer Items" },
  { table: "hsn_codes", label: "HSN Codes" },
  { table: "uoms", label: "Units" },
  { table: "variant_axis_definitions", label: "Variant Axes" },
  { table: "custom_field_definitions", label: "Custom Fields" },
  { table: "bill_templates", label: "Bill Templates" },
  { table: "devices", label: "Devices" },
  { table: "tenant_role_permissions", label: "Role Permissions" },
  { table: "audit_logs", label: "Activity Log" },
  { table: "landing_enquiries", label: "Enquiries", global: true },
];

/** Credentials and security internals never leave the system in a readable export. */
const PRIVATE_COLUMNS = new Set([
  "password_hash",
  "session_version",
  "failed_login_count",
  "locked_until",
  "ip_hash",
  "idempotency_key",
]);

const NUMERIC_OIDS = new Set([20, 21, 23, 700, 701, 1700]);

export type ExportCell = string | number | boolean | null;

export interface ExportSheet {
  table: string;
  label: string;
  columns: string[];
  rows: ExportCell[][];
}

function toCell(value: unknown, numeric: boolean): ExportCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (numeric && text !== "" && Number.isFinite(Number(text))) return Number(text);
  return text;
}

/** Reads all tables one at a time. `tenantId: null` exports the whole platform. */
export async function collectExport(client: PoolClient, tenantId: string | null): Promise<ExportSheet[]> {
  const sheets: ExportSheet[] = [];
  for (const { table, label, global } of EXPORT_TABLES) {
    if (global && tenantId) continue;
    const scoped = Boolean(tenantId);
    const where = scoped ? `WHERE ${table === "tenants" ? "id" : "tenant_id"} = $1` : "";
    const res = await client.query(`SELECT * FROM public.${table} ${where}`, scoped ? [tenantId] : []);
    const numeric = new Set((res.fields ?? []).filter((f) => NUMERIC_OIDS.has(f.dataTypeID)).map((f) => f.name));
    const names = res.fields?.length ? res.fields.map((f) => f.name) : Object.keys(res.rows[0] ?? {});
    const columns = names.filter((c) => !PRIVATE_COLUMNS.has(c));
    sheets.push({
      table,
      label,
      columns,
      rows: res.rows.map((row) => columns.map((c) => toCell(row[c], numeric.has(c)))),
    });
  }
  return sheets;
}

export function buildWorkbook(sheets: ExportSheet[]): Buffer {
  const book = XLSX.utils.book_new();
  const summary: ExportCell[][] = [["Data", "Rows"], ...sheets.map((s) => [s.label, s.rows.length])];
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(summary), "Summary");
  for (const s of sheets) {
    // Excel allows 32,767 characters in a cell.
    const rows = s.rows.map((r) => r.map((c) => (typeof c === "string" && c.length > 32000 ? `${c.slice(0, 32000)}…` : c)));
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([s.columns, ...rows]), s.label.slice(0, 31));
  }
  return XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }) as Buffer;
}

/** Stops spreadsheet apps from running imported text as a formula. */
export function csvCell(value: ExportCell): string {
  if (value === null) return "";
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text) && !/^[+-]?[\d\s().-]+$/.test(text)) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(sheet: ExportSheet): string {
  const lines = [sheet.columns.map(csvCell).join(","), ...sheet.rows.map((r) => r.map(csvCell).join(","))];
  return `﻿${lines.join("\r\n")}\r\n`;
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Minimal ZIP writer, so CSV exports arrive as one file that also works on phones. */
export function buildZip(files: Array<{ name: string; content: string }>, now = new Date()): Buffer {
  const time = (now.getUTCHours() << 11) | (now.getUTCMinutes() << 5) | Math.floor(now.getUTCSeconds() / 2);
  const date = ((now.getUTCFullYear() - 1980) << 9) | ((now.getUTCMonth() + 1) << 5) | now.getUTCDate();
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const raw = Buffer.from(file.content, "utf8");
    const packed = zlib.deflateRawSync(raw);
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, packed);

    const head = Buffer.alloc(46);
    head.writeUInt32LE(0x02014b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(20, 6);
    head.writeUInt16LE(0x0800, 8);
    head.writeUInt16LE(8, 10);
    head.writeUInt16LE(time, 12);
    head.writeUInt16LE(date, 14);
    head.writeUInt32LE(crc, 16);
    head.writeUInt32LE(packed.length, 20);
    head.writeUInt32LE(raw.length, 24);
    head.writeUInt16LE(name.length, 28);
    head.writeUInt32LE(offset, 42);
    central.push(head, name);
    offset += local.length + name.length + packed.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

export function buildCsvZip(sheets: ExportSheet[]): Buffer {
  return buildZip(
    sheets.map((s) => ({ name: `${s.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`, content: toCsv(s) }))
  );
}
