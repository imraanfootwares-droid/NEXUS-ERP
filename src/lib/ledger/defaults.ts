import type { BrandConfig, LedgerConfig, LedgerFieldDef } from "@/types/database";

export const DEFAULT_ITEM_COLUMNS: LedgerFieldDef[] = [
  { key: "colour", label: "Colour", enabled: true },
  { key: "size", label: "Size", enabled: true },
  { key: "ctn", label: "Ctn", enabled: true },
  { key: "pack", label: "Pack.", enabled: true },
  { key: "pair", label: "Pair / Qty", enabled: true },
  { key: "rate", label: "Rate", enabled: true },
  { key: "disc_pct", label: "%", enabled: true },
];

export const DEFAULT_HEADER_FIELDS: LedgerFieldDef[] = [
  { key: "transport", label: "Transport (TPT)", enabled: true },
  { key: "lr_no", label: "B.No. / LR No.", enabled: true },
  { key: "cartons", label: "Cartons", enabled: true },
  { key: "agent_ref", label: "Agent / Ref", enabled: false },
];

export function resolveLedgerConfig(brandConfig?: BrandConfig | null): LedgerConfig {
  const saved = brandConfig?.ledger_config;
  if (!saved) {
    return {
      item_columns: DEFAULT_ITEM_COLUMNS.map((c) => ({ ...c })),
      header_fields: DEFAULT_HEADER_FIELDS.map((f) => ({ ...f })),
    };
  }
  return {
    item_columns:
      Array.isArray(saved.item_columns) && saved.item_columns.length > 0
        ? saved.item_columns
        : DEFAULT_ITEM_COLUMNS.map((c) => ({ ...c })),
    header_fields:
      Array.isArray(saved.header_fields) && saved.header_fields.length > 0
        ? saved.header_fields
        : DEFAULT_HEADER_FIELDS.map((f) => ({ ...f })),
  };
}
