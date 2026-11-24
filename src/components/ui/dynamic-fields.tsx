"use client";

import React, { useMemo, useState } from "react";
import { Check, Search, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { matchSizeRun, sizeAxisKey, variantOptions, type SizeRunVariant } from "@/lib/catalog/size-run";
import { INDIAN_STATES } from "@/lib/constants/saas";
import type { CustomFieldRow, HsnCodeRow, RatioPreset } from "@/types/database";
import { Button, Input, Label, Select } from "./primitives";

/** Renders dynamic tenant-defined Custom Product Fields cleanly across any vertical. */
export function CustomFieldRenderer({
  fields,
  values,
  onChange,
}: {
  fields: CustomFieldRow[];
  values: Record<string, string | number | boolean | null>;
  onChange: (next: Record<string, string | number | boolean | null>) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {fields.map((f) => {
        const val = values[f.field_key] ?? "";
        const update = (v: string | number | boolean | null) =>
          onChange({ ...values, [f.field_key]: v });

        return (
          <div key={f.id}>
            <Label>
              {f.label}
              {f.is_required ? " *" : ""}
            </Label>
            {f.field_type === "select" ? (
              <Select
                value={String(val)}
                onChange={(e) => update(e.target.value)}
                required={f.is_required}
              >
                <option value="">Select {f.label}...</option>
                {f.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            ) : f.field_type === "boolean" ? (
              <Select
                value={val === true ? "true" : val === false ? "false" : ""}
                onChange={(e) => update(e.target.value === "true")}
              >
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            ) : (
              <Input
                type={f.field_type === "number" ? "number" : f.field_type === "date" ? "date" : "text"}
                value={String(val)}
                onChange={(e) =>
                  update(f.field_type === "number" ? Number(e.target.value) : e.target.value)
                }
                required={f.is_required}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Reusable 2D Matrix Grid with sticky row labels & >= 44px touch inputs.
 * Used in Stock Matrix, Production Batches, Transfers, and Wholesale Quick Entry.
 */
export function VariantMatrixGrid({
  rowAxisLabel,
  colAxisLabel,
  rows,
  cols,
  getCellValue,
  onCellChange,
  readOnly = false,
  getCellHint,
}: {
  rowAxisLabel: string;
  colAxisLabel: string;
  rows: string[];
  cols: string[];
  getCellValue: (rowVal: string, colVal: string) => number | string;
  onCellChange?: (rowVal: string, colVal: string, nextVal: number) => void;
  readOnly?: boolean;
  getCellHint?: (rowVal: string, colVal: string) => string | undefined;
}) {
  return (
    <div className="overflow-x-auto rounded-[10px] border border-slate-200 bg-white">
      <table className="w-full text-xs sm:text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200">
            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 text-left font-semibold text-slate-700 border-r border-slate-200 whitespace-nowrap">
              {rowAxisLabel} \ {colAxisLabel}
            </th>
            {cols.map((c) => (
              <th key={c} className="px-2.5 py-2.5 text-center font-semibold text-slate-700 whitespace-nowrap min-w-[68px]">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r}>
              <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium text-slate-800 border-r border-slate-200 whitespace-nowrap">
                {r}
              </td>
              {cols.map((c) => {
                const val = getCellValue(r, c);
                const hint = getCellHint?.(r, c);
                return (
                  <td key={c} className="p-1.5 text-center">
                    {readOnly ? (
                      <div className="min-h-[36px] flex flex-col items-center justify-center rounded bg-slate-50 px-2 font-semibold text-slate-800">
                        <span>{val}</span>
                        {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center">
                        <input
                          type="number"
                          min={0}
                          value={val}
                          onChange={(e) => onCellChange?.(r, c, Math.max(0, Number(e.target.value) || 0))}
                          className="w-16 min-h-[44px] sm:min-h-[36px] rounded-md border border-slate-300 text-center text-sm font-medium focus:border-sky-500 focus:outline-none"
                        />
                        {hint && <span className="text-[10px] text-slate-400 mt-0.5">{hint}</span>}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Reusable 1-Click Size-Run / Carton Ratio Quick Fill bar. */
export function SizeRunQuickFill<T extends SizeRunVariant>({
  presets,
  variants,
  onApply,
}: {
  presets: RatioPreset[];
  /** Variants of the selected product. */
  variants: T[];
  onApply: (hits: Array<{ variant: T; qty: number }>) => void;
}) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [sets, setSets] = useState(1);
  const [picked, setPicked] = useState("");

  const allSizes = useMemo(() => presets.flatMap((p) => Object.keys(p.ratios)), [presets]);
  const options = useMemo(() => variantOptions(variants, allSizes), [variants, allSizes]);

  if (presets.length === 0) return null;

  // One colour is selected for you. With several, you must choose, so stock is never guessed.
  const option = options.length === 1 ? options[0] : options.includes(picked) ? picked : "";
  const needsChoice = options.length > 1 && !option;
  const sizeKey = sizeAxisKey(variants, allSizes);
  const optionLabel = Object.keys(variants[0]?.attributes ?? {}).filter((k) => k !== sizeKey).join(" / ") || "Colour";

  const apply = () => {
    const preset = presets[selectedIdx] ?? presets[0];
    const out: Record<string, number> = {};
    for (const [size, qty] of Object.entries(preset.ratios)) {
      out[size] = qty * Math.max(1, sets);
    }
    const { hits, missing } = matchSizeRun(variants, out, option, allSizes);
    const name = option || "this product";
    if (hits.length === 0) {
      toast.error(`${name} is not available in these sizes.`);
      return;
    }
    onApply(hits);
    const pairs = hits.reduce((sum, h) => sum + h.qty, 0);
    if (missing.length > 0) toast.warning(`Added ${pairs} of ${name}. Not available: ${missing.join(", ")}.`);
    else toast.success(`Added ${pairs} of ${name}.`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[10px] border border-sky-200 bg-sky-50/70 p-3">
      <div className="flex-1 min-w-[180px]">
        <Label>Size-Run Ratio Preset</Label>
        <Select value={String(selectedIdx)} onChange={(e) => setSelectedIdx(Number(e.target.value))}>
          {presets.map((p, idx) => (
            <option key={p.name} value={idx}>
              {p.name}
            </option>
          ))}
        </Select>
      </div>
      {options.length > 0 ? (
        <div className="flex-1 min-w-[130px]">
          <Label>{optionLabel}</Label>
          <Select aria-label={optionLabel} value={option} onChange={(e) => setPicked(e.target.value)}>
            {options.length > 1 ? <option value="">Choose {optionLabel.toLowerCase()}</option> : null}
            {options.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      <div className="w-24">
        <Label>Sets / Cartons</Label>
        <Input
          type="number"
          min={1}
          value={sets}
          onChange={(e) => setSets(Math.max(1, Number(e.target.value) || 1))}
        />
      </div>
      <Button variant="secondary" disabled={needsChoice} onClick={apply}>
        <Sparkles className="h-4 w-4" />
        Fill Size-Run
      </Button>
    </div>
  );
}

/** Searchable Indian HSN / SAC Code Combobox. */
export function HsnCombobox({
  hsnList,
  value,
  onSelect,
}: {
  hsnList: HsnCodeRow[];
  value: string;
  onSelect: (hsn: HsnCodeRow) => void;
}) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return hsnList.slice(0, 20);
    return hsnList
      .filter(
        (h) =>
          h.code.toLowerCase().includes(q) ||
          h.description.toLowerCase().includes(q) ||
          h.category.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [hsnList, search]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={open ? search : value}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          placeholder="Search HSN (e.g. 6403, leather, sports)..."
          className="pl-9"
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-60 w-full overflow-y-auto rounded-[10px] border border-slate-200 bg-white shadow-xl">
          {filtered.length === 0 ? (
            <div className="p-3 text-xs text-slate-500">No matching HSN codes.</div>
          ) : (
            filtered.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => {
                  onSelect(h);
                  setSearch("");
                  setOpen(false);
                }}
                className="flex w-full items-start justify-between gap-2 px-3 py-2.5 text-left text-xs hover:bg-sky-50 border-b border-slate-100 last:border-0 cursor-pointer"
              >
                <div>
                  <span className="font-semibold text-slate-900">{h.code}</span>
                  <span className="ml-2 text-slate-500">{h.category}</span>
                  <p className="text-slate-600 line-clamp-1 mt-0.5">{h.description}</p>
                </div>
                <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-700">
                  {h.rate_rule_type === "price_threshold"
                    ? `${h.rate_below_threshold}%/${h.rate_above_threshold}%`
                    : `${h.default_gst_rate}%`}
                </span>
              </button>
            ))
          )}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="w-full py-1.5 text-center text-xs text-slate-500 hover:bg-slate-50 border-t border-slate-100 cursor-pointer"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}

/** GSTIN input with regex + mod-36 validation & automatic Indian state-code extraction. */
const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
export function isValidGstin(gstin: string): boolean {
  const clean = gstin.trim().toUpperCase();
  if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const code = GSTIN_CHARS.indexOf(clean[i]);
    const factor = i % 2 === 0 ? 1 : 2;
    const prod = code * factor;
    sum += Math.floor(prod / 36) + (prod % 36);
  }
  const checkIdx = (36 - (sum % 36)) % 36;
  return clean[14] === GSTIN_CHARS[checkIdx];
}

export function GstinInput({
  value,
  onChange,
  onStateDetected,
}: {
  value: string;
  onChange: (gstin: string) => void;
  onStateDetected?: (stateCode: string) => void;
}) {
  const upper = value.toUpperCase();
  const valid = upper.length === 0 || isValidGstin(upper);
  const stateCode = upper.slice(0, 2);

  return (
    <div>
      <div className="relative">
        <Input
          value={upper}
          maxLength={15}
          placeholder="e.g. 33AABCU9603R1ZM"
          onChange={(e) => {
            const next = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
            onChange(next);
            const sc = next.slice(0, 2);
            if (sc.length === 2 && INDIAN_STATES[sc]) {
              onStateDetected?.(sc);
            }
          }}
        />
        {upper.length === 15 && valid && (
          <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
        )}
      </div>
      {upper.length > 0 && !valid && (
        <p className="text-xs text-rose-600 mt-1">Invalid GSTIN format or checksum.</p>
      )}
      {upper.length >= 2 && INDIAN_STATES[stateCode] && (
        <p className="text-xs text-slate-500 mt-0.5">
          State: {stateCode} — {INDIAN_STATES[stateCode]}
        </p>
      )}
    </div>
  );
}
