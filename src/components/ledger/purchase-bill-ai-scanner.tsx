"use client";

import React, { useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  ImagePlus,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button, Input, Label, Select } from "@/components/ui/primitives";
import {
  buildPurchaseBillAiPrompt,
  formatSizesText,
  FREE_VISION_AI_CHATS,
  parsePurchaseBillAiResponse,
  parseSizesText,
  type ExistingCatalogProductSummary,
  type ParsedAiBillItem,
  type ParsedAiPurchaseBill,
} from "@/lib/ledger/purchase-bill-ai";
import type { CategoryTemplate } from "@/types/database";

interface PurchaseBillAiScannerProps {
  supplierName: string;
  categoryTemplates: CategoryTemplate[];
  existingProducts: ExistingCatalogProductSummary[];
  applying: boolean;
  onApplyParsedBill: (bill: ParsedAiPurchaseBill) => Promise<void>;
}

const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export function PurchaseBillAiScanner({
  supplierName,
  categoryTemplates,
  existingProducts,
  applying,
  onApplyParsedBill,
}: PurchaseBillAiScannerProps) {
  const [open, setOpen] = useState(false);
  const [showPromptText, setShowPromptText] = useState(false);
  const [copied, setCopied] = useState(false);
  const [rawReply, setRawReply] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ParsedAiPurchaseBill | null>(null);

  const promptText = useMemo(
    () =>
      buildPurchaseBillAiPrompt({
        supplierName,
        categoryTemplates,
        existingProducts,
      }),
    [supplierName, categoryTemplates, existingProducts]
  );

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(promptText);
      setCopied(true);
      toast.success("Prompt copied! Open any free AI chat below, attach your bill photo, and paste.");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setShowPromptText(true);
      toast.error("Could not auto-copy — select and copy the prompt shown below.");
    }
  };

  const handleParse = () => {
    setParseError(null);
    const res = parsePurchaseBillAiResponse(
      rawReply,
      existingProducts,
      categoryTemplates[0]?.category ?? ""
    );
    if (!res.ok) {
      setPreview(null);
      setParseError(res.error);
      return;
    }
    setPreview(res.data);
    toast.success(`Read ${res.data.items.length} item(s) — review below before applying to your bill.`);
  };

  const updateItem = (idx: number, patch: Partial<ParsedAiBillItem>) => {
    setPreview((prev) => {
      if (!prev) return prev;
      const nextItems = prev.items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
      return { ...prev, items: nextItems };
    });
  };

  const removeItem = (idx: number) => {
    setPreview((prev) => {
      if (!prev) return prev;
      return { ...prev, items: prev.items.filter((_, i) => i !== idx) };
    });
  };

  const totalPreviewPairs = preview
    ? preview.items.reduce((s, it) => s + it.total_qty, 0)
    : 0;
  const totalPreviewAmount = preview
    ? preview.items.reduce((s, it) => s + it.total_qty * it.cost_price, 0) +
      preview.other_charges.reduce((s, c) => s + c.qty * c.rate, 0)
    : 0;
  const newProductsCount = preview ? preview.items.filter((i) => i.isNewProduct).length : 0;

  return (
    <div className="rounded-xl border border-[#e5e5e7] bg-[#fafafa] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-[#f4f4f6] transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#171717] text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold text-[#171717]">
              Scan Physical Bill with Free AI (₹0 Cost)
            </p>
            <p className="text-[11px] text-[#77777d]">
              Copy prompt → upload bill photo to ChatGPT, Gemini, AI Studio or DeepSeek → paste reply to auto-fill stock.
            </p>
          </div>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white border border-[#e5e5e7] px-2.5 py-1 text-[11px] font-semibold text-[#171717]">
          {open ? (
            <>
              Hide <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Open <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </span>
      </button>

      {open && (
        <div className="border-t border-[#e5e5e7] bg-white p-3.5 space-y-4 text-xs">
          {/* Step 1: Copy Smart Prompt */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-semibold text-[#171717]">
                Step 1 · Copy Your Shop&apos;s Bill Prompt
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPromptText((v) => !v)}
                  className="text-[11px] font-medium text-[#77777d] hover:text-[#171717] underline cursor-pointer"
                >
                  {showPromptText ? "Hide prompt" : "View prompt"}
                </button>
                <Button type="button" size="sm" onClick={copyPrompt}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied!" : "Copy Prompt"}
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-[#77777d]">
              Automatically includes your configured categories ({categoryTemplates.map((c) => c.category).slice(0, 4).join(", ")}), sizes, and existing product codes so the AI formats the bill to match your shop.
            </p>
            {showPromptText && (
              <textarea
                readOnly
                rows={7}
                value={promptText}
                className="w-full rounded-lg border border-[#e5e5e7] bg-[#fafafa] p-2.5 font-mono text-[10.5px] text-[#171717]"
              />
            )}
          </div>

          {/* Step 2: 1-Click Free Vision AI Chats */}
          <div className="space-y-2 border-t border-[#f1f1f3] pt-3">
            <p className="font-semibold text-[#171717]">
              Step 2 · Open Any Free AI Chat, Upload Your Bill Photo &amp; Paste the Prompt
            </p>
            <div className="flex flex-wrap gap-1.5">
              {FREE_VISION_AI_CHATS.map((tool) => (
                <a
                  key={tool.id}
                  href={tool.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#e5e5e7] bg-[#fafafa] px-3 py-1.5 text-[11.5px] font-semibold text-[#171717] hover:bg-[#171717] hover:text-white hover:border-[#171717] transition-colors"
                  title={tool.note}
                >
                  {tool.name} <ExternalLink className="h-3 w-3 opacity-70" />
                </a>
              ))}
            </div>
          </div>

          {/* Step 3: Paste JSON Reply & Preview Stock Before Saving */}
          <div className="space-y-2.5 border-t border-[#f1f1f3] pt-3">
            <Label className="mb-0">Step 3 · Paste the AI&apos;s JSON Reply Here</Label>
            <textarea
              rows={4}
              value={rawReply}
              onChange={(e) => setRawReply(e.target.value)}
              placeholder='Paste the JSON reply from ChatGPT / Gemini / DeepSeek here (e.g. { "bill_no": "INV-104", "items": [...] })'
              className="w-full rounded-lg border border-[#d4d4d8] bg-white p-2.5 font-mono text-[11px] text-[#171717] focus:border-[#171717] focus:outline-none"
            />
            {parseError && (
              <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-[11.5px] text-rose-700">
                {parseError}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-[#77777d]">
                Nothing is saved yet — you will review and edit every item first.
              </span>
              <Button type="button" size="sm" variant="outline" onClick={handleParse}>
                <ImagePlus className="h-3.5 w-3.5" /> Read &amp; Preview Stock
              </Button>
            </div>
          </div>

          {/* Editable Stock Preview Table */}
          {preview && (
            <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50/40 p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-bold text-emerald-950">
                    Preview: What Will Be Added to Stock
                  </p>
                  <p className="text-[11px] text-emerald-800">
                    {preview.items.length} product(s) · <strong>{totalPreviewPairs} pairs/pcs</strong> · Est. Total{" "}
                    <strong>{money(totalPreviewAmount)}</strong>
                    {newProductsCount > 0 && ` · ${newProductsCount} new product(s) will be auto-created`}
                  </p>
                </div>
                {preview.bill_no && (
                  <span className="rounded-full bg-white border border-emerald-200 px-2.5 py-0.5 text-[11px] font-mono font-semibold text-emerald-900">
                    Bill #{preview.bill_no}
                  </span>
                )}
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {preview.items.map((item, idx) => (
                  <div
                    key={item.key}
                    className="rounded-lg border border-[#e5e5e7] bg-white p-2.5 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          item.isNewProduct
                            ? "bg-amber-100 text-amber-900"
                            : "bg-emerald-100 text-emerald-900"
                        }`}
                      >
                        {item.isNewProduct ? "New Product (Auto-Create)" : "Matched in Stock"}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[#171717]">
                          {item.total_qty} pcs × {money(item.cost_price)} = {money(item.total_qty * item.cost_price)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeItem(idx)}
                          className="cursor-pointer rounded p-1 text-rose-600 hover:bg-rose-50"
                          title="Remove row"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-12">
                      <div className="sm:col-span-4">
                        <Label className="text-[10px]">Product Name</Label>
                        <Input
                          value={item.product_name}
                          onChange={(e) => updateItem(idx, { product_name: e.target.value })}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-[10px]">Code</Label>
                        <Input
                          value={item.model_code}
                          onChange={(e) => updateItem(idx, { model_code: e.target.value.toUpperCase() })}
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <Label className="text-[10px]">Category</Label>
                        <Select
                          value={item.category}
                          onChange={(e) => updateItem(idx, { category: e.target.value })}
                          className="h-8 text-xs"
                        >
                          <option value="">General</option>
                          {categoryTemplates.map((t) => (
                            <option key={t.category} value={t.category}>
                              {t.category}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div className="sm:col-span-3">
                        <Label className="text-[10px]">Colour</Label>
                        <Input
                          value={item.colour}
                          onChange={(e) => updateItem(idx, { colour: e.target.value })}
                          placeholder="e.g. Black"
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
                      <div className="col-span-2 sm:col-span-6">
                        <Label className="text-[10px]">Sizes &amp; Qty (e.g. 6:2, 7:4, 8:6)</Label>
                        <Input
                          value={formatSizesText(item.sizes)}
                          onChange={(e) => {
                            const nextSizes = parseSizesText(e.target.value);
                            const sum = Object.values(nextSizes).reduce((s, q) => s + q, 0);
                            updateItem(idx, {
                              sizes: nextSizes,
                              total_qty: sum > 0 ? sum : item.total_qty,
                            });
                          }}
                          placeholder="Leave blank if using Total Qty"
                          className="h-8 text-xs font-mono"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-[10px]">Total Qty</Label>
                        <Input
                          type="number"
                          min={0}
                          value={item.total_qty || ""}
                          onChange={(e) => updateItem(idx, { total_qty: Math.max(0, Number(e.target.value) || 0) })}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-[10px]">Buy Cost ₹</Label>
                        <Input
                          type="number"
                          min={0}
                          value={item.cost_price || ""}
                          onChange={(e) => updateItem(idx, { cost_price: Math.max(0, Number(e.target.value) || 0) })}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <Label className="text-[10px]">GST %</Label>
                        <Input
                          type="number"
                          min={0}
                          value={item.gst_rate}
                          onChange={(e) => updateItem(idx, { gst_rate: Math.max(0, Number(e.target.value) || 0) })}
                          className="h-8 text-xs"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {preview.other_charges.length > 0 && (
                <div className="rounded-lg border border-[#e5e5e7] bg-white px-3 py-2 text-[11px] text-[#52525b]">
                  <strong>Extra charges:</strong>{" "}
                  {preview.other_charges.map((c) => `${c.name} (${money(c.qty * c.rate)})`).join(", ")}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
                <Button type="button" size="sm" variant="outline" onClick={() => setPreview(null)}>
                  Clear Preview
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={applying || (preview.items.length === 0 && preview.other_charges.length === 0)}
                  onClick={async () => {
                    await onApplyParsedBill(preview);
                    setPreview(null);
                    setRawReply("");
                    setOpen(false);
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  {applying
                    ? "Loading into Bill..."
                    : newProductsCount > 0
                    ? `Create ${newProductsCount} New & Load into Bill`
                    : "Load All into Purchase Bill"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
