"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Link2,
  Maximize2,
  Minimize2,
  Package,
  Plus,
  RotateCcw,
  Ruler,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Trash2,
  Unlink2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label } from "@/components/ui/primitives";
import {
  parseCommaList,
  removeCategoryTemplate,
  upsertCategoryTemplate,
  VERTICAL_CATEGORY_PRESETS,
} from "@/lib/catalog/category-templates";
import type { CategoryTemplate, CustomFieldRow } from "@/types/database";

interface VisualProductBuilderProps {
  templates: CategoryTemplate[];
  customFields: CustomFieldRow[];
  canManage: boolean;
  saving: boolean;
  onSaveTemplates: (next: CategoryTemplate[], successMessage?: string) => Promise<void>;
  onCreateField?: (input: { label: string; fieldType: "text" | "number" | "select" | "boolean" | "date"; options: string[] }) => Promise<void>;
}

const PRODUCT_X = 32;
const CATEGORY_X = 300;
const SIZE_X = 590;
const FIELD_X = 890;

const PRODUCT_W = 210;
const CATEGORY_W = 228;
const SIZE_W = 236;
const FIELD_W = 220;

const ROW_H = 112;
const FIELD_ROW_H = 82;
const TOP_PAD = 44;

const ACCENTS = ["#171717", "#2f7fe0", "#16a34a", "#ea7a12", "#7c5cdb", "#db2777"];

function bezierPath(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.48);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

type Selection =
  | { kind: "product" }
  | { kind: "category"; name: string }
  | { kind: "sizes"; name: string }
  | { kind: "field"; label: string }
  | { kind: "new_category" }
  | { kind: "new_field" };

export function VisualProductBuilder({
  templates,
  customFields,
  canManage,
  saving,
  onSaveTemplates,
  onCreateField,
}: VisualProductBuilderProps) {
  const [selection, setSelection] = useState<Selection>(() =>
    templates[0] ? { kind: "category", name: templates[0].category } : { kind: "product" }
  );

  // Canvas pan / zoom / fullscreen (same interaction model as Shops & Team)
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [zoom, setZoom] = useState(0.86);
  const [pan, setPan] = useState({ x: 18, y: 18 });
  const [panning, setPanning] = useState(false);
  const [full, setFull] = useState(false);
  const fittedRef = useRef(false);

  // Inspector form state for editing or adding a category
  const [editCatName, setEditCatName] = useState("");
  const [editCatSizes, setEditCatSizes] = useState("");
  const [editCatColours, setEditCatColours] = useState("");
  const [editCatPack, setEditCatPack] = useState("20");
  const [editCatFields, setEditCatFields] = useState<string[]>([]);
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number" | "select" | "boolean" | "date">("text");
  const [newFieldOpts, setNewFieldOpts] = useState("");
  const [creatingField, setCreatingField] = useState(false);

  // Collect all unique field labels (saved customFields + any category-attached custom names)
  const allFieldItems = useMemo(() => {
    const map = new Map<string, { label: string; typeLabel: string; isGlobal: boolean }>();
    for (const f of customFields) {
      const key = f.label.trim().toLowerCase();
      if (!key) continue;
      map.set(key, {
        label: f.label.trim(),
        typeLabel:
          f.field_type === "select"
            ? "Dropdown"
            : f.field_type === "boolean"
            ? "Yes / No"
            : f.field_type.charAt(0).toUpperCase() + f.field_type.slice(1),
        isGlobal: true,
      });
    }
    for (const t of templates) {
      for (const ef of t.extra_fields) {
        const key = ef.trim().toLowerCase();
        if (!key || map.has(key)) continue;
        map.set(key, { label: ef.trim(), typeLabel: "Text", isGlobal: false });
      }
    }
    return Array.from(map.values());
  }, [customFields, templates]);

  const activeCategoryName =
    selection.kind === "category" || selection.kind === "sizes" ? selection.name : null;

  const activeCategory = useMemo(
    () =>
      activeCategoryName
        ? templates.find((t) => t.category.toLowerCase() === activeCategoryName.toLowerCase()) ?? null
        : null,
    [templates, activeCategoryName]
  );

  // Keep inspector inputs synced when user clicks a different block
  useEffect(() => {
    if ((selection.kind === "category" || selection.kind === "sizes") && activeCategory) {
      setEditCatName(activeCategory.category);
      setEditCatSizes(activeCategory.default_sizes.join(", "));
      setEditCatColours(activeCategory.default_colours.join(", "));
      setEditCatPack(String(activeCategory.default_pieces_per_carton || 20));
      setEditCatFields([...activeCategory.extra_fields]);
    } else if (selection.kind === "new_category") {
      setEditCatName("");
      setEditCatSizes("");
      setEditCatColours("");
      setEditCatPack("20");
      setEditCatFields([]);
    }
  }, [selection, activeCategory]);

  // Compute deterministic block coordinates on canvas
  const layout = useMemo(() => {
    const catCount = Math.max(1, templates.length);
    const catBlockHeight = (catCount + 1) * ROW_H; // +1 for "+ Add Category" block
    const fieldBlockHeight = (allFieldItems.length + 1) * FIELD_ROW_H;
    const totalHeight = Math.max(420, catBlockHeight + TOP_PAD * 2, fieldBlockHeight + TOP_PAD * 2);

    const catStartY = Math.max(TOP_PAD, (totalHeight - (templates.length + 1) * ROW_H) / 2);
    const fieldStartY = Math.max(TOP_PAD, (totalHeight - (allFieldItems.length + 1) * FIELD_ROW_H) / 2);

    const categories = templates.map((t, idx) => ({
      template: t,
      x: CATEGORY_X,
      y: catStartY + idx * ROW_H,
      h: 92,
      accent: ACCENTS[idx % ACCENTS.length],
    }));

    const addCatPos = {
      x: CATEGORY_X,
      y: catStartY + templates.length * ROW_H,
      h: 64,
    };

    const sizes = categories.map((c) => ({
      template: c.template,
      x: SIZE_X,
      y: c.y,
      h: 92,
      accent: c.accent,
    }));

    const fields = allFieldItems.map((f, idx) => ({
      ...f,
      x: FIELD_X,
      y: fieldStartY + idx * FIELD_ROW_H,
      h: 68,
    }));

    const addFieldPos = {
      x: FIELD_X,
      y: fieldStartY + allFieldItems.length * FIELD_ROW_H,
      h: 58,
    };

    const productY =
      categories.length > 0
        ? (categories[0].y + categories[categories.length - 1].y) / 2
        : TOP_PAD + 40;

    return {
      width: FIELD_X + FIELD_W + 48,
      height: totalHeight,
      product: { x: PRODUCT_X, y: productY, h: 98 },
      categories,
      addCatPos,
      sizes,
      fields,
      addFieldPos,
    };
  }, [templates, allFieldItems]);

  const fitToScreen = useCallback(() => {
    const el = viewportRef.current;
    if (!el || !layout.width) return;
    const z = Math.min(
      1,
      Math.max(0.3, Math.min((el.clientWidth - 28) / layout.width, (el.clientHeight - 28) / layout.height))
    );
    setZoom(z);
    setPan({
      x: Math.max(16, (el.clientWidth - layout.width * z) / 2),
      y: Math.max(16, (el.clientHeight - layout.height * z) / 2),
    });
  }, [layout.width, layout.height]);

  useEffect(() => {
    if (!fittedRef.current && layout.width) {
      fittedRef.current = true;
      requestAnimationFrame(fitToScreen);
    }
  }, [layout.width, fitToScreen]);

  useEffect(() => {
    const t = window.setTimeout(() => requestAnimationFrame(fitToScreen), 120);
    return () => window.clearTimeout(t);
  }, [full, fitToScreen]);

  const onWheel = (e: React.WheelEvent) => {
    if (!viewportRef.current) return;
    const rect = viewportRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const next = Math.min(1.5, Math.max(0.35, zoom * (e.deltaY < 0 ? 1.08 : 0.92)));
    setPan({ x: mx - ((mx - pan.x) * next) / zoom, y: my - ((my - pan.y) * next) / zoom });
    setZoom(next);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    dragRef.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
    setPanning(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    setPan({ x: d.px + e.clientX - d.x, y: d.py + e.clientY - d.y });
  };

  const endDrag = () => {
    dragRef.current = null;
    setPanning(false);
  };

  // Toggle connection between a Category block and a Field block directly on canvas!
  const toggleFieldConnection = async (catName: string, fieldLabel: string) => {
    if (!canManage || saving) return;
    const target = templates.find((t) => t.category.toLowerCase() === catName.toLowerCase());
    if (!target) return;
    const exists = target.extra_fields.some((f) => f.toLowerCase() === fieldLabel.toLowerCase());
    const nextFields = exists
      ? target.extra_fields.filter((f) => f.toLowerCase() !== fieldLabel.toLowerCase())
      : [...target.extra_fields, fieldLabel];
    const nextTemplates = upsertCategoryTemplate(
      templates,
      { ...target, extra_fields: nextFields },
      target.category
    );
    await onSaveTemplates(
      nextTemplates,
      exists
        ? `Disconnected "${fieldLabel}" from ${target.category}`
        : `Connected "${fieldLabel}" to ${target.category}`
    );
  };

  const handleSaveCategoryInspector = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = editCatName.trim();
    if (!clean) {
      toast.error("Enter a category name first.");
      return;
    }
    const orig = selection.kind === "new_category" ? null : activeCategory?.category ?? null;
    const nextEntry: CategoryTemplate = {
      category: clean,
      default_sizes: parseCommaList(editCatSizes),
      default_colours: parseCommaList(editCatColours),
      default_pieces_per_carton: Math.max(1, Number(editCatPack || 20)),
      extra_fields: Array.from(new Set(editCatFields.map((f) => f.trim()).filter(Boolean))),
    };
    const nextTemplates = upsertCategoryTemplate(templates, nextEntry, orig);
    await onSaveTemplates(nextTemplates, orig ? `Updated "${clean}"` : `Added "${clean}"`);
    setSelection({ kind: "category", name: clean });
  };

  const handleDeleteActiveCategory = async () => {
    if (!activeCategory) return;
    if (!confirm(`Remove category "${activeCategory.category}"? Existing products won't be deleted.`)) return;
    const nextTemplates = removeCategoryTemplate(templates, activeCategory.category);
    await onSaveTemplates(nextTemplates, `Removed "${activeCategory.category}"`);
    setSelection(nextTemplates[0] ? { kind: "category", name: nextTemplates[0].category } : { kind: "product" });
  };

  const handleCreateFieldOnCanvas = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = newFieldLabel.trim();
    if (!label) {
      toast.error("Enter a field name (e.g. Sole Type).");
      return;
    }
    setCreatingField(true);
    try {
      if (onCreateField) {
        await onCreateField({
          label,
          fieldType: newFieldType,
          options: parseCommaList(newFieldOpts),
        });
      }
      // If a category was previously selected, also auto-connect the new field to it!
      if (templates.length > 0 && activeCategory) {
        const nextTemplates = upsertCategoryTemplate(
          templates,
          { ...activeCategory, extra_fields: Array.from(new Set([...activeCategory.extra_fields, label])) },
          activeCategory.category
        );
        await onSaveTemplates(nextTemplates, `Added & connected "${label}" to ${activeCategory.category}`);
      } else {
        toast.success(`Added field "${label}"!`);
      }
      setNewFieldLabel("");
      setNewFieldOpts("");
      setSelection({ kind: "field", label });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add field.");
    } finally {
      setCreatingField(false);
    }
  };

  const loadVerticalPreset = async (presetKey: string) => {
    const preset = VERTICAL_CATEGORY_PRESETS.find((p) => p.key === presetKey);
    if (!preset) return;
    if (
      !confirm(
        `Load the "${preset.label}" preset (${preset.categories
          .map((c) => c.category)
          .join(", ")})? Existing products won't be deleted.`
      )
    ) {
      return;
    }
    const nextList = preset.categories.map((c) => ({
      ...c,
      default_sizes: [...c.default_sizes],
      default_colours: [...c.default_colours],
      extra_fields: [...c.extra_fields],
    }));
    await onSaveTemplates(nextList, `Loaded ${preset.label} preset!`);
    setSelection(nextList[0] ? { kind: "category", name: nextList[0].category } : { kind: "product" });
    fittedRef.current = false;
  };

  return (
    <div
      ref={wrapRef}
      className={`rounded-2xl border border-[#e5e5e7] bg-[#f4f4f6] p-2.5 space-y-2.5 ${
        full ? "fixed inset-3 z-50 flex flex-col shadow-2xl" : ""
      }`}
    >
      {/* Top Toolbar — Mirrors Shops & Team Canvas Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 border border-[#ececee]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#171717] mr-1">
            <Sparkles className="h-3.5 w-3.5" /> Presets:
          </span>
          {VERTICAL_CATEGORY_PRESETS.map((preset) => (
            <button
              key={preset.key}
              type="button"
              disabled={!canManage || saving}
              onClick={() => loadVerticalPreset(preset.key)}
              title={preset.description}
              className="cursor-pointer rounded-full border border-[#e5e5e7] bg-[#fafafa] px-2.5 py-1 text-[11px] font-medium text-[#171717] transition-colors hover:bg-[#171717] hover:text-white hover:border-[#171717] disabled:opacity-50"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {canManage && (
            <>
              <button
                type="button"
                onClick={() => setSelection({ kind: "new_category" })}
                className="cursor-pointer inline-flex items-center gap-1 rounded-lg bg-[#171717] px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-[#2a2a2d]"
              >
                <Plus className="h-3.5 w-3.5" /> Add Category
              </button>
              <button
                type="button"
                onClick={() => setSelection({ kind: "new_field" })}
                className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-[#d4d4d8] bg-white px-2.5 py-1.5 text-[11px] font-semibold text-[#171717] hover:bg-[#fafafa]"
              >
                <Plus className="h-3.5 w-3.5" /> Add Field
              </button>
            </>
          )}
          <div className="h-4 w-px bg-[#e5e5e7] mx-0.5" />
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.35, +(z - 0.1).toFixed(2)))}
            title="Zoom out"
            className="cursor-pointer rounded-lg border border-[#e5e5e7] bg-white p-1.5 text-[#52525b] hover:text-[#171717]"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <span className="min-w-[38px] text-center text-[11px] font-mono text-[#52525b]">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(1.5, +(z + 0.1).toFixed(2)))}
            title="Zoom in"
            className="cursor-pointer rounded-lg border border-[#e5e5e7] bg-white p-1.5 text-[#52525b] hover:text-[#171717]"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={fitToScreen}
            title="Fit blocks to screen"
            className="cursor-pointer inline-flex items-center gap-1 rounded-lg border border-[#e5e5e7] bg-white px-2 py-1.5 text-[11px] font-medium text-[#52525b] hover:text-[#171717]"
          >
            <RotateCcw className="h-3 w-3" /> Fit
          </button>
          <button
            type="button"
            onClick={() => setFull((f) => !f)}
            title={full ? "Exit fullscreen" : "Fullscreen"}
            className="cursor-pointer rounded-lg border border-[#e5e5e7] bg-white p-1.5 text-[#52525b] hover:text-[#171717]"
          >
            {full ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Plain-English Hint Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-[#52525b]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#171717]" /> 1. Product
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#2f7fe0]" /> 2. Categories
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#16a34a]" /> 3. Sizes &amp; Colours
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#7c5cdb]" /> 4. Attached Fields
          </span>
        </div>
        <span>
          {activeCategory
            ? `Selected "${activeCategory.category}" — tap any Field block on the right to connect or disconnect its wire.`
            : "Click any block to inspect or edit it. Drag the background to pan."}
        </span>
      </div>

      {/* Main Split: Interactive Dotted Canvas + Right Block Inspector */}
      <div className={`grid grid-cols-1 gap-2.5 lg:grid-cols-12 ${full ? "flex-1 min-h-0" : ""}`}>
        {/* Dotted Grid Pan/Zoom Canvas (8 cols) */}
        <div
          ref={viewportRef}
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`lg:col-span-8 relative overflow-hidden rounded-xl border border-[#e5e5e7] select-none touch-none ${
            panning ? "cursor-grabbing" : "cursor-grab"
          } ${full ? "h-full min-h-[420px]" : "h-[400px] sm:h-[480px] lg:h-[580px]"}`}
          style={{
            background: "radial-gradient(circle, #dcdce0 1px, transparent 1.2px) 0 0 / 20px 20px, #fbfbfb",
          }}
        >
          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: layout.width,
              height: layout.height,
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
              transition: panning ? "none" : "transform 180ms ease-out",
            }}
          >
            {/* Column Headers on Canvas */}
            <div className="pointer-events-none absolute top-2.5 left-0 right-0 text-[10px] font-bold uppercase tracking-wider text-[#8e8e93]">
              <span style={{ position: "absolute", left: PRODUCT_X }}>1. Product</span>
              <span style={{ position: "absolute", left: CATEGORY_X }}>2. Categories</span>
              <span style={{ position: "absolute", left: SIZE_X }}>3. Category Sizes</span>
              <span style={{ position: "absolute", left: FIELD_X }}>4. Attached Fields</span>
            </div>

            {/* Curved SVG Connector Wires */}
            <svg
              width={layout.width}
              height={layout.height}
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
            >
              {/* Product -> Categories */}
              {layout.categories.map((c) => {
                const isSelected = activeCategoryName?.toLowerCase() === c.template.category.toLowerCase();
                return (
                  <path
                    key={`p-c-${c.template.category}`}
                    d={bezierPath(
                      layout.product.x + PRODUCT_W,
                      layout.product.y + layout.product.h / 2,
                      c.x,
                      c.y + c.h / 2
                    )}
                    fill="none"
                    stroke={isSelected ? "#171717" : "#cfcfd4"}
                    strokeWidth={isSelected ? 2.2 : 1.4}
                  />
                );
              })}

              {/* Categories -> Sizes */}
              {layout.categories.map((c, idx) => {
                const sz = layout.sizes[idx];
                const isSelected = activeCategoryName?.toLowerCase() === c.template.category.toLowerCase();
                return (
                  <path
                    key={`c-s-${c.template.category}`}
                    d={bezierPath(c.x + CATEGORY_W, c.y + c.h / 2, sz.x, sz.y + sz.h / 2)}
                    fill="none"
                    stroke={isSelected ? c.accent : "#cfcfd4"}
                    strokeWidth={isSelected ? 2.2 : 1.4}
                  />
                );
              })}

              {/* Sizes -> Connected Fields */}
              {layout.sizes.map((sz) => {
                const isCatSelected = activeCategoryName?.toLowerCase() === sz.template.category.toLowerCase();
                return sz.template.extra_fields.map((ef) => {
                  const targetField = layout.fields.find((f) => f.label.toLowerCase() === ef.toLowerCase());
                  if (!targetField) return null;
                  const isFieldSelected =
                    selection.kind === "field" && selection.label.toLowerCase() === targetField.label.toLowerCase();
                  const highlight = isCatSelected || isFieldSelected;
                  return (
                    <path
                      key={`s-f-${sz.template.category}-${targetField.label}`}
                      d={bezierPath(
                        sz.x + SIZE_W,
                        sz.y + sz.h / 2,
                        targetField.x,
                        targetField.y + targetField.h / 2
                      )}
                      fill="none"
                      stroke={highlight ? "#171717" : "#d4d4d8"}
                      strokeWidth={highlight ? 2.1 : 1.15}
                      strokeDasharray={highlight ? undefined : "4 3"}
                      opacity={activeCategoryName && !highlight ? 0.35 : 1}
                    />
                  );
                });
              })}
            </svg>

            {/* Block 1: Root Product Block */}
            <button
              type="button"
              onClick={() => setSelection({ kind: "product" })}
              style={{ left: layout.product.x, top: layout.product.y, width: PRODUCT_W, height: layout.product.h }}
              className={`absolute rounded-xl bg-white p-3 text-left transition-all cursor-pointer ${
                selection.kind === "product"
                  ? "ring-2 ring-[#171717] shadow-md"
                  : "shadow-[0_0_0_3px_#f1f1f2,0_0_0_4px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.05)] hover:shadow-md"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#171717] text-white shrink-0">
                  <Package className="h-3.5 w-3.5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-[#171717] truncate">Your Product</p>
                  <p className="text-[10px] text-[#77777d]">Name · Code · Price</p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-[10.5px] font-medium text-[#52525b] border-t border-[#f1f1f3] pt-2">
                <span>{templates.length} categories</span>
                <span>{allFieldItems.length} fields</span>
              </div>
            </button>

            {/* Block Column 2: Category Blocks */}
            {layout.categories.map((c) => {
              const isSelected = activeCategoryName?.toLowerCase() === c.template.category.toLowerCase();
              return (
                <button
                  key={c.template.category}
                  type="button"
                  onClick={() => setSelection({ kind: "category", name: c.template.category })}
                  style={{ left: c.x, top: c.y, width: CATEGORY_W, height: c.h }}
                  className={`absolute rounded-xl bg-white p-3 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "ring-2 ring-[#171717] shadow-md"
                      : "shadow-[0_0_0_3px_#f1f1f2,0_0_0_4px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.05)] hover:shadow-md"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="flex h-6 w-6 items-center justify-center rounded-lg text-white shrink-0"
                        style={{ backgroundColor: c.accent }}
                      >
                        <Tag className="h-3 w-3" />
                      </span>
                      <p className="text-xs font-bold text-[#171717] truncate">{c.template.category}</p>
                    </div>
                    <span className="rounded-full bg-[#f4f4f5] px-1.5 py-0.5 text-[9.5px] font-semibold text-[#52525b] shrink-0">
                      {c.template.default_pieces_per_carton}/box
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[10.5px] text-[#77777d] border-t border-[#f1f1f3] pt-2">
                    <span>{c.template.default_sizes.length} sizes</span>
                    <span>{c.template.extra_fields.length} attached fields</span>
                  </div>
                </button>
              );
            })}

            {/* + Add Category Block */}
            {canManage && (
              <button
                type="button"
                onClick={() => setSelection({ kind: "new_category" })}
                style={{
                  left: layout.addCatPos.x,
                  top: layout.addCatPos.y,
                  width: CATEGORY_W,
                  height: layout.addCatPos.h,
                }}
                className={`absolute flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-xs font-semibold transition-colors cursor-pointer ${
                  selection.kind === "new_category"
                    ? "border-[#171717] bg-white text-[#171717]"
                    : "border-[#d4d4d8] bg-white/70 text-[#77777d] hover:border-[#171717] hover:text-[#171717]"
                }`}
              >
                <Plus className="h-4 w-4" /> Add Category Block
              </button>
            )}

            {/* Block Column 3: Sizes & Colours Blocks */}
            {layout.sizes.map((sz) => {
              const isSelected = activeCategoryName?.toLowerCase() === sz.template.category.toLowerCase();
              const previewSizes = sz.template.default_sizes.slice(0, 5);
              const extraCount = Math.max(0, sz.template.default_sizes.length - previewSizes.length);
              return (
                <button
                  key={`sz-${sz.template.category}`}
                  type="button"
                  onClick={() => setSelection({ kind: "sizes", name: sz.template.category })}
                  style={{ left: sz.x, top: sz.y, width: SIZE_W, height: sz.h }}
                  className={`absolute rounded-xl bg-white p-2.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "ring-2 ring-[#171717] shadow-md"
                      : "shadow-[0_0_0_3px_#f1f1f2,0_0_0_4px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.05)] hover:shadow-md"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#171717]">
                      <Ruler className="h-3 w-3 text-[#16a34a]" /> Sizes ({sz.template.default_sizes.length})
                    </span>
                    <span className="text-[9.5px] text-[#77777d]">
                      {sz.template.default_colours.length > 0
                        ? `${sz.template.default_colours.length} colours`
                        : "General colours"}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {previewSizes.length > 0 ? (
                      <>
                        {previewSizes.map((s) => (
                          <span
                            key={s}
                            className="rounded bg-[#f4f4f5] px-1.5 py-0.5 text-[10px] font-semibold text-[#171717]"
                          >
                            {s}
                          </span>
                        ))}
                        {extraCount > 0 && (
                          <span className="rounded bg-[#171717] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                            +{extraCount}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-[10.5px] text-[#77777d] italic">Click to add sizes</span>
                    )}
                  </div>
                </button>
              );
            })}

            {/* Block Column 4: Connectable Extra Field Blocks */}
            {layout.fields.map((f) => {
              const isConnectedToActive = activeCategory
                ? activeCategory.extra_fields.some((ef) => ef.toLowerCase() === f.label.toLowerCase())
                : false;
              const isFieldSelected =
                selection.kind === "field" && selection.label.toLowerCase() === f.label.toLowerCase();
              const connectedCount = templates.filter((t) =>
                t.extra_fields.some((ef) => ef.toLowerCase() === f.label.toLowerCase())
              ).length;

              return (
                <div
                  key={`fld-${f.label}`}
                  style={{ left: f.x, top: f.y, width: FIELD_W, height: f.h }}
                  className={`absolute rounded-xl bg-white p-2.5 flex flex-col justify-between transition-all ${
                    isFieldSelected || isConnectedToActive
                      ? "ring-2 ring-[#171717] shadow-md"
                      : "shadow-[0_0_0_3px_#f1f1f2,0_0_0_4px_rgba(0,0,0,0.06),0_2px_6px_rgba(0,0,0,0.05)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <button
                      type="button"
                      onClick={() => setSelection({ kind: "field", label: f.label })}
                      className="flex items-center gap-1.5 min-w-0 text-left cursor-pointer"
                    >
                      <SlidersHorizontal className="h-3 w-3 text-[#7c5cdb] shrink-0" />
                      <span className="text-[11.5px] font-bold text-[#171717] truncate">{f.label}</span>
                    </button>
                    <span className="rounded bg-[#f4f4f5] px-1.5 py-0.5 text-[9.5px] font-medium text-[#52525b] shrink-0">
                      {f.typeLabel}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-1">
                    <span className="text-[10px] text-[#77777d]">
                      {connectedCount} {connectedCount === 1 ? "category" : "categories"}
                    </span>
                    {activeCategory && canManage ? (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => toggleFieldConnection(activeCategory.category, f.label)}
                        className={`cursor-pointer inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-colors ${
                          isConnectedToActive
                            ? "bg-[#171717] text-white hover:bg-rose-600"
                            : "bg-[#f4f4f5] text-[#171717] hover:bg-[#171717] hover:text-white"
                        }`}
                      >
                        {isConnectedToActive ? (
                          <>
                            <Unlink2 className="h-2.5 w-2.5" /> Connected
                          </>
                        ) : (
                          <>
                            <Link2 className="h-2.5 w-2.5" /> Connect
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setSelection({ kind: "field", label: f.label })}
                        className="cursor-pointer text-[10px] font-semibold text-[#171717] hover:underline"
                      >
                        Manage →
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {/* + Add Field Block */}
            {canManage && (
              <button
                type="button"
                onClick={() => setSelection({ kind: "new_field" })}
                style={{
                  left: layout.addFieldPos.x,
                  top: layout.addFieldPos.y,
                  width: FIELD_W,
                  height: layout.addFieldPos.h,
                }}
                className={`absolute flex items-center justify-center gap-1.5 rounded-xl border-2 border-dashed text-xs font-semibold transition-colors cursor-pointer ${
                  selection.kind === "new_field"
                    ? "border-[#171717] bg-white text-[#171717]"
                    : "border-[#d4d4d8] bg-white/70 text-[#77777d] hover:border-[#171717] hover:text-[#171717]"
                }`}
              >
                <Plus className="h-4 w-4" /> Add Field Block
              </button>
            )}
          </div>
        </div>

        {/* Right Block Inspector Panel (4 cols) */}
        <div
          className={`lg:col-span-4 rounded-xl border border-[#e5e5e7] bg-white p-4 overflow-y-auto ${
            full ? "h-full" : "max-h-[580px]"
          }`}
        >
          {selection.kind === "product" && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#171717] text-white">
                  <Package className="h-4 w-4" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-[#171717]">Your Product Flow</h4>
                  <p className="text-[11px] text-[#77777d]">Visual map of how Add Product works</p>
                </div>
              </div>
              <p className="text-[#52525b] leading-relaxed">
                Every product starts with its <strong>Name, Code &amp; Price</strong>, then branches into one of your{" "}
                <strong>{templates.length} Categories</strong>. Picking a category automatically loads its connected{" "}
                <strong>Sizes</strong> and <strong>Extra Details</strong>.
              </p>
              <div className="rounded-xl border border-[#ececee] bg-[#fafafa] p-3 space-y-2">
                <p className="font-semibold text-[#171717]">Quick Actions</p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => setSelection({ kind: "new_category" })}
                    disabled={!canManage}
                  >
                    <Plus className="h-3.5 w-3.5" /> New Category
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => setSelection({ kind: "new_field" })}
                    disabled={!canManage}
                  >
                    <Plus className="h-3.5 w-3.5" /> New Field
                  </Button>
                </div>
              </div>
            </div>
          )}

          {(selection.kind === "category" || selection.kind === "sizes" || selection.kind === "new_category") && (
            <form onSubmit={handleSaveCategoryInspector} className="space-y-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-[#171717]">
                    {selection.kind === "new_category"
                      ? "Add New Category Block"
                      : selection.kind === "sizes"
                      ? `Sizes for ${activeCategory?.category ?? ""}`
                      : `Edit ${activeCategory?.category ?? "Category"}`}
                  </h4>
                  <p className="text-[11px] text-[#77777d]">
                    Changes update the canvas wires and Add Product immediately.
                  </p>
                </div>
                {selection.kind !== "new_category" && activeCategory && canManage && (
                  <button
                    type="button"
                    onClick={handleDeleteActiveCategory}
                    title="Delete category"
                    className="cursor-pointer rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div>
                <Label>Category Name *</Label>
                <Input
                  value={editCatName}
                  onChange={(e) => setEditCatName(e.target.value)}
                  placeholder="e.g. Men's Footwear, Baby Footwear"
                  required
                />
              </div>

              <div>
                <Label>Sizes (separate with commas)</Label>
                <Input
                  value={editCatSizes}
                  onChange={(e) => setEditCatSizes(e.target.value)}
                  placeholder="e.g. 6, 7, 8, 9, 10, 11"
                />
                {parseCommaList(editCatSizes).length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {parseCommaList(editCatSizes).map((s) => (
                      <span
                        key={s}
                        className="rounded-md bg-[#fafafa] border border-[#e5e5e7] px-2 py-0.5 text-[10.5px] font-semibold text-[#171717]"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <Label>Colours (optional)</Label>
                  <Input
                    value={editCatColours}
                    onChange={(e) => setEditCatColours(e.target.value)}
                    placeholder="Black, Brown, Tan"
                  />
                </div>
                <div>
                  <Label>Pairs per Box</Label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    value={editCatPack}
                    onChange={(e) => setEditCatPack(e.target.value.replace(/\D/g, ""))}
                    placeholder="20"
                  />
                </div>
              </div>

              {/* Connected Fields Toggle Chips */}
              <div className="space-y-1.5 rounded-xl border border-[#ececee] bg-[#fafafa] p-3">
                <p className="font-semibold text-[#171717]">Connected Fields</p>
                <p className="text-[10.5px] text-[#77777d]">
                  Tap any field below (or click <strong>Connect</strong> directly on the canvas).
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {allFieldItems.map((f) => {
                    const active = editCatFields.some((x) => x.toLowerCase() === f.label.toLowerCase());
                    return (
                      <button
                        key={f.label}
                        type="button"
                        onClick={() =>
                          setEditCatFields((prev) =>
                            active
                              ? prev.filter((x) => x.toLowerCase() !== f.label.toLowerCase())
                              : [...prev, f.label]
                          )
                        }
                        className={`cursor-pointer rounded-lg px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                          active
                            ? "bg-[#171717] text-white border-[#171717]"
                            : "bg-white text-[#52525b] border-[#e5e5e7] hover:border-[#171717]"
                        }`}
                      >
                        {active ? "✓ " : "+ "}
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Button type="submit" size="sm" disabled={!canManage || saving} className="w-full">
                <Check className="h-3.5 w-3.5" />{" "}
                {saving
                  ? "Saving..."
                  : selection.kind === "new_category"
                  ? "Add Category Block"
                  : "Save Block Changes"}
              </Button>
            </form>
          )}

          {selection.kind === "field" && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#7c5cdb] text-white">
                  <SlidersHorizontal className="h-4 w-4" />
                </span>
                <div>
                  <h4 className="text-sm font-bold text-[#171717]">{selection.label}</h4>
                  <p className="text-[11px] text-[#77777d]">Choose which categories use this field</p>
                </div>
              </div>

              <div className="space-y-1.5">
                {templates.map((t) => {
                  const connected = t.extra_fields.some(
                    (ef) => ef.toLowerCase() === selection.label.toLowerCase()
                  );
                  return (
                    <div
                      key={t.category}
                      className="flex items-center justify-between rounded-xl border border-[#ececee] bg-[#fafafa] px-3 py-2"
                    >
                      <span className="font-semibold text-[#171717]">{t.category}</span>
                      <button
                        type="button"
                        disabled={!canManage || saving}
                        onClick={() => toggleFieldConnection(t.category, selection.label)}
                        className={`cursor-pointer inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-semibold transition-colors ${
                          connected
                            ? "bg-[#171717] text-white hover:bg-rose-600"
                            : "bg-white border border-[#d4d4d8] text-[#171717] hover:bg-[#171717] hover:text-white"
                        }`}
                      >
                        {connected ? (
                          <>
                            <Unlink2 className="h-3 w-3" /> Connected
                          </>
                        ) : (
                          <>
                            <Link2 className="h-3 w-3" /> Connect
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selection.kind === "new_field" && (
            <form onSubmit={handleCreateFieldOnCanvas} className="space-y-3 text-xs">
              <div>
                <h4 className="text-sm font-bold text-[#171717]">Add New Field Block</h4>
                <p className="text-[11px] text-[#77777d]">
                  Create a detail field (like Sole Type, Heel Height, or Soft Sole) and connect it to your categories.
                </p>
              </div>
              <div>
                <Label>Field Name *</Label>
                <Input
                  value={newFieldLabel}
                  onChange={(e) => setNewFieldLabel(e.target.value)}
                  placeholder="e.g. Sole Type, Heel Height, Soft Sole"
                  required
                />
              </div>
              <div>
                <Label>Field Type</Label>
                <select
                  value={newFieldType}
                  onChange={(e) => setNewFieldType(e.target.value as typeof newFieldType)}
                  className="w-full h-9 rounded-lg border border-[#e5e5e7] bg-white px-2.5 text-xs text-[#171717]"
                >
                  <option value="text">Text Box</option>
                  <option value="select">Dropdown List</option>
                  <option value="number">Number</option>
                  <option value="boolean">Yes / No</option>
                  <option value="date">Date</option>
                </select>
              </div>
              {newFieldType === "select" && (
                <div>
                  <Label>Dropdown Choices (comma-separated)</Label>
                  <Input
                    value={newFieldOpts}
                    onChange={(e) => setNewFieldOpts(e.target.value)}
                    placeholder="e.g. PU, EVA, TPR, Leather"
                  />
                </div>
              )}
              <Button type="submit" size="sm" disabled={!canManage || creatingField} className="w-full">
                <Plus className="h-3.5 w-3.5" /> {creatingField ? "Adding..." : "Create Field Block"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
