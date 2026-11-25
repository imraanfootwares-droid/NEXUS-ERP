"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Download, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { amountInWordsIndian } from "@/lib/gst/calculator";
import type { BillDesignStyle, BillTemplateConfig, SellerBankDetails } from "@/types/database";

export function PrintShareToolbar({
  backHref,
  backLabel,
  pdfUrl,
  docTitle,
}: {
  backHref: string;
  backLabel: string;
  pdfUrl: string;
  docTitle: string;
}) {
  const [sharing, setSharing] = useState(false);

  const handleSharePdf = async () => {
    setSharing(true);
    try {
      const res = await fetch(pdfUrl);
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const file = new File([blob], `${docTitle.replace(/[^a-zA-Z0-9-_]+/g, "-")}.pdf`, {
        type: "application/pdf",
      });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: docTitle, files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        window.open(url, "_blank");
        toast.info("Opened PDF (Web Share API not supported on this browser).");
      }
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        toast.error(err instanceof Error ? err.message : "Share failed");
      }
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="no-print flex flex-wrap items-center justify-between gap-2 max-w-3xl mx-auto">
      <Link href={backHref} className="text-xs font-medium text-sky-600 hover:underline">
        {backLabel}
      </Link>
      <div className="flex flex-wrap gap-2">
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 min-h-[38px]"
        >
          <Download className="h-3.5 w-3.5" /> PDF
        </a>
        <button
          type="button"
          onClick={handleSharePdf}
          disabled={sharing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800 hover:bg-sky-100 min-h-[38px] cursor-pointer disabled:opacity-50"
        >
          <Share2 className="h-3.5 w-3.5" /> {sharing ? "Preparing..." : "Share PDF"}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 min-h-[38px] cursor-pointer"
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
      </div>
    </div>
  );
}

export interface InvoicePreviewData {
  logoUrl?: string | null;
  builtBy?: string | null;
  invoiceNumber: string;
  invoiceType: string;
  dateStr: string;
  // Seller (configured in My Profile)
  sellerName?: string | null;
  sellerAddress?: string | null;
  sellerPhone?: string | null;
  sellerEmail?: string | null;
  sellerGstin?: string | null;
  signatoryName?: string | null;
  bankDetails?: SellerBankDetails | null;
  // Branch fallbacks
  branchName: string;
  branchAddress?: string | null;
  branchGstin?: string | null;
  // Buyer (Bill To)
  customerName: string;
  customerPhone?: string | null;
  customerGstin?: string | null;
  customerAddress?: string | null;
  // Delivery / Consignee (Ship To)
  shipToName?: string | null;
  shipToAddress?: string | null;
  placeOfSupply?: string | null;
  // Totals
  subtotal?: number;
  discountAmount?: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  items: Array<{
    product_name: string;
    sku?: string | null;
    hsn_code?: string | null;
    qty: number;
    unit_price: number;
    taxable_value?: number;
    gst_rate: number;
    line_total: number;
  }>;
}

const fmtAmt = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function inferEffectiveTaxPct(taxPart: number, baseAmount: number): string {
  if (taxPart <= 0 || baseAmount <= 0) return "";
  const pct = (taxPart / baseAmount) * 100;
  return `${pct.toFixed(2)}%`;
}

function normalizeStyle(style?: BillDesignStyle, isGst?: boolean): BillDesignStyle {
  if (!style) return isGst ? "gst_classic_grid" : "normal_clean";
  if (style === "gst_full") return "gst_classic_grid";
  if (style === "classic") return isGst ? "gst_classic_grid" : "normal_clean";
  if (style === "modern") return isGst ? "gst_executive_band" : "normal_banner";
  if (style === "minimal") return isGst ? "gst_sidebar_accent" : "normal_boutique";
  if (style === "bordered") return isGst ? "gst_royal_frame" : "normal_cash_memo";
  if (style === "bold") return isGst ? "gst_compact_split" : "normal_counter";
  return style;
}

export function InvoiceRenderer({
  format,
  config,
  data,
}: {
  format: "a4" | "a5" | "thermal_80mm" | "thermal_58mm";
  config: BillTemplateConfig;
  data: InvoicePreviewData;
}) {
  const isThermal = format === "thermal_80mm" || format === "thermal_58mm";
  const is58 = format === "thermal_58mm";
  const isA5 = format === "a5";
  const accent = config.accent_color || "#1d528a";

  const hasGst =
    data.cgstAmount > 0 ||
    data.sgstAmount > 0 ||
    data.igstAmount > 0 ||
    data.items.some((it) => Number(it.gst_rate || 0) > 0);
  const showGstDetails = Boolean(config.show_gst_summary) && (hasGst || config.bill_category === "gst");
  const style = normalizeStyle(config.design_style, showGstDetails);

  const sellerName = (config.header_title || data.sellerName || data.branchName || "MY BUSINESS").trim();
  const sellerAddress = data.sellerAddress || data.branchAddress || null;
  const sellerPhone = data.sellerPhone || null;
  const sellerEmail = data.sellerEmail || null;
  const sellerGstin = data.sellerGstin || data.branchGstin || null;
  const signatoryName = data.signatoryName || sellerName;

  const bank: SellerBankDetails = {
    account_holder: data.bankDetails?.account_holder || undefined,
    bank_name: data.bankDetails?.bank_name || undefined,
    account_number: data.bankDetails?.account_number || undefined,
    ifsc_code: data.bankDetails?.ifsc_code || undefined,
    branch_name: data.bankDetails?.branch_name || undefined,
    upi_id: data.bankDetails?.upi_id || config.upi_id || undefined,
  };
  const hasBank = Boolean(bank.account_holder || bank.bank_name || bank.account_number || bank.ifsc_code);
  const showBank = (config.show_bank_details ?? true) && hasBank;
  const showShipTo = config.show_ship_to ?? true;
  const shipToName = data.shipToName?.trim() || data.customerName;
  const shipToAddress = data.shipToAddress?.trim() || data.customerAddress || null;

  const totalQty = data.items.reduce((s, it) => s + Number(it.qty || 0), 0);
  const itemsSubTotal =
    data.subtotal != null && data.subtotal > 0
      ? data.subtotal
      : showGstDetails && data.taxableAmount > 0
      ? data.taxableAmount
      : data.items.reduce((s, it) => s + Number(it.line_total || 0), 0);
  const discountAmt = Number(data.discountAmount || 0);
  const cgstPct = inferEffectiveTaxPct(data.cgstAmount, data.taxableAmount || itemsSubTotal);
  const sgstPct = inferEffectiveTaxPct(data.sgstAmount, data.taxableAmount || itemsSubTotal);
  const igstPct = inferEffectiveTaxPct(data.igstAmount, data.taxableAmount || itemsSubTotal);
  const copyLabel = config.copy_label || "ORIGINAL";

  const docLabel =
    data.invoiceType === "return_credit_note"
      ? "CREDIT NOTE"
      : data.invoiceType === "estimate_bill_of_supply"
      ? "ESTIMATE / BILL"
      : showGstDetails
      ? "TAX INVOICE"
      : "CASH MEMO / BILL";

  const widthClass =
    format === "thermal_58mm"
      ? "max-w-[248px] print-58mm text-[11px]"
      : format === "thermal_80mm"
      ? "max-w-[330px] print-80mm text-xs"
      : format === "a5"
      ? "max-w-[580px] text-xs"
      : "max-w-3xl text-sm";

  // ═══════════════════════════════════════════════════════════════════════════
  // THERMAL RECEIPT (80mm / 58mm) — Works cleanly for any template
  // ═══════════════════════════════════════════════════════════════════════════
  if (isThermal) {
    const darkHeader = style === "normal_counter" || style === "gst_executive_band" || style === "normal_banner";
    return (
      <div className={`print-doc mx-auto overflow-hidden rounded-lg border border-slate-300 bg-white print:border-0 print:shadow-none ${widthClass}`}>
        <div
          className={`px-3.5 py-3 text-center ${darkHeader ? "text-white" : "border-b border-dashed border-slate-400"}`}
          style={darkHeader ? { backgroundColor: style === "normal_counter" ? "#171717" : accent } : undefined}
        >
          {config.show_logo && data.logoUrl && (
            <img src={data.logoUrl} alt={sellerName} className="mx-auto mb-1.5 h-9 w-auto max-w-[110px] rounded bg-white/95 p-0.5 object-contain" />
          )}
          <h2 className={`font-bold tracking-tight ${is58 ? "text-sm" : "text-base"}`}>{sellerName}</h2>
          {sellerAddress && <p className={`mt-0.5 text-[10px] ${darkHeader ? "text-white/80" : "text-slate-600"}`}>{sellerAddress}</p>}
          {sellerPhone && <p className={`text-[10px] ${darkHeader ? "text-white/80" : "text-slate-600"}`}>Ph: {sellerPhone}</p>}
          {showGstDetails && sellerGstin && (
            <p className={`text-[10px] font-mono font-semibold ${darkHeader ? "text-white" : "text-slate-800"}`}>GSTIN: {sellerGstin}</p>
          )}
          <div className="mt-1.5 text-[10.5px] font-bold uppercase tracking-wider">{docLabel}</div>
          <div className={`text-[10px] font-mono ${darkHeader ? "text-white/85" : "text-slate-600"}`}>
            {data.invoiceNumber} · {data.dateStr}
          </div>
        </div>

        <div className="p-3 space-y-2.5 text-[11px]">
          <div className="text-[10.5px]">
            <span className="text-slate-500">Customer:</span> <strong className="text-slate-900">{data.customerName}</strong>
            {data.customerPhone && <div className="text-slate-600">Ph: {data.customerPhone}</div>}
            {showGstDetails && data.customerGstin && <div className="font-mono text-slate-700">GSTIN: {data.customerGstin}</div>}
          </div>

          {is58 ? (
            <div className="border-y border-dashed border-slate-400 py-2 space-y-1.5">
              {data.items.map((it, i) => (
                <div key={i}>
                  <div className="font-medium text-slate-900 leading-snug">{it.product_name}</div>
                  <div className="flex justify-between font-mono text-[10px] text-slate-700">
                    <span>{it.qty} × ₹{fmtAmt(it.unit_price)}</span>
                    <span className="font-semibold text-slate-900">₹{fmtAmt(it.line_total)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full border-collapse text-left text-[11px]">
              <thead>
                <tr className="border-y border-dashed border-slate-400 text-[10px] uppercase text-slate-600">
                  <th className="py-1 pr-1">Item</th>
                  <th className="py-1 px-1 text-right">Qty</th>
                  <th className="py-1 px-1 text-right">Rate</th>
                  <th className="py-1 pl-1 text-right">Amt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((it, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-1 font-medium text-slate-900">{it.product_name}</td>
                    <td className="py-1 px-1 text-right font-mono">{it.qty}</td>
                    <td className="py-1 px-1 text-right font-mono">{fmtAmt(it.unit_price)}</td>
                    <td className="py-1 pl-1 text-right font-mono font-semibold">{fmtAmt(it.line_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <div className="space-y-1 border-t border-dashed border-slate-400 pt-2 text-[11px]">
            {showGstDetails && (
              <>
                <div className="flex justify-between font-mono"><span>Taxable</span><span>₹{fmtAmt(data.taxableAmount)}</span></div>
                {data.cgstAmount > 0 && <div className="flex justify-between font-mono"><span>CGST {cgstPct}</span><span>₹{fmtAmt(data.cgstAmount)}</span></div>}
                {data.sgstAmount > 0 && <div className="flex justify-between font-mono"><span>SGST {sgstPct}</span><span>₹{fmtAmt(data.sgstAmount)}</span></div>}
                {data.igstAmount > 0 && <div className="flex justify-between font-mono"><span>IGST {igstPct}</span><span>₹{fmtAmt(data.igstAmount)}</span></div>}
              </>
            )}
            {discountAmt > 0 && <div className="flex justify-between font-mono text-emerald-700"><span>Discount</span><span>-₹{fmtAmt(discountAmt)}</span></div>}
            <div className="flex justify-between border-t border-slate-900 pt-1 text-sm font-bold">
              <span>TOTAL</span>
              <span className="font-mono">₹{fmtAmt(data.grandTotal)}</span>
            </div>
            <div className="flex justify-between font-mono text-[10px] text-slate-600">
              <span>Paid: ₹{fmtAmt(data.paidAmount)}</span>
              <span>Due: ₹{fmtAmt(data.dueAmount)}</span>
            </div>
          </div>

          {config.show_upi_qr && bank.upi_id && (
            <div className="rounded border border-dashed border-slate-300 bg-slate-50 px-2 py-1.5 text-center font-mono text-[10px]">
              UPI: <strong>{bank.upi_id}</strong>
            </div>
          )}
          {config.footer_note && <p className="pt-1 text-center text-[10.5px] font-semibold text-slate-700">{config.footer_note}</p>}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GST LAYOUT 1: CLASSIC TAX GRID (Matches Hayath Enterprises Sample Invoice)
  // ═══════════════════════════════════════════════════════════════════════════
  if (style === "gst_classic_grid") {
    const fillerCount = isA5 ? 0 : Math.max(0, Math.min(6, 10 - data.items.length));
    return (
      <div className={`print-doc mx-auto overflow-hidden border-[1.5px] border-slate-900 bg-white text-slate-900 print:shadow-none ${widthClass}`}>
        {/* Top Seller + Tax Invoice Header */}
        <div className="grid grid-cols-12 border-b border-slate-900">
          <div className="col-span-7 border-r border-slate-900 p-3">
            <div className="flex items-start gap-2.5">
              {config.show_logo && data.logoUrl && (
                <img src={data.logoUrl} alt={sellerName} className="h-11 w-11 shrink-0 object-contain" />
              )}
              <div className="space-y-0.5 text-[11px] leading-snug">
                <h2 className="text-[15px] font-extrabold uppercase tracking-tight text-red-700">
                  {sellerName}
                </h2>
                {config.header_subtitle && (
                  <p className="text-[10.5px] font-semibold text-slate-600">{config.header_subtitle}</p>
                )}
                {sellerAddress && <p className="font-bold uppercase text-slate-900">{sellerAddress}</p>}
                {sellerPhone && <p className="font-bold text-slate-900">PHONE : {sellerPhone}</p>}
                {sellerEmail && (
                  <p className="font-bold text-slate-900">
                    EMAIL : <span className="text-blue-800 underline">{sellerEmail}</span>
                  </p>
                )}
                <p className="font-bold uppercase text-slate-900">
                  GSTIN : {sellerGstin || "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="col-span-5 flex flex-col">
            <div className="px-2.5 py-1 text-right text-[10.5px] font-extrabold uppercase tracking-wider text-slate-900">
              {copyLabel}
            </div>
            <div
              className="px-3 py-1 text-[12px] font-extrabold uppercase tracking-wide text-white"
              style={{ backgroundColor: accent }}
            >
              {docLabel}
            </div>
            <div className="flex-1 space-y-1 p-3 text-[11px] font-bold">
              <div className="grid grid-cols-12">
                <span className="col-span-6 uppercase">INVOICE NUMBER</span>
                <span className="col-span-1 text-center">:</span>
                <span className="col-span-5 font-mono">{data.invoiceNumber}</span>
              </div>
              <div className="grid grid-cols-12">
                <span className="col-span-6 uppercase">INVOICE DATE</span>
                <span className="col-span-1 text-center">:</span>
                <span className="col-span-5 font-mono">{data.dateStr}</span>
              </div>
              {data.placeOfSupply && (
                <div className="grid grid-cols-12">
                  <span className="col-span-6 uppercase">PLACE OF SUPPLY</span>
                  <span className="col-span-1 text-center">:</span>
                  <span className="col-span-5">{data.placeOfSupply}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Buyer (Bill To) + Consignee (Ship To) */}
        <div className="grid grid-cols-12 border-b border-slate-900 text-[11px] leading-snug">
          <div className={`${showShipTo ? "col-span-6 border-r border-slate-900" : "col-span-12"} p-3 space-y-0.5`}>
            <p className="font-extrabold uppercase underline">BUYER (BILL TO)</p>
            <p className="font-extrabold uppercase" style={{ color: accent }}>
              {data.customerName}
            </p>
            {data.customerAddress && <p className="font-bold uppercase text-slate-900">{data.customerAddress}</p>}
            {data.customerPhone && <p className="font-bold text-slate-800">PHONE : {data.customerPhone}</p>}
            {data.customerGstin && <p className="font-bold uppercase text-slate-900">GSTIN : {data.customerGstin}</p>}
          </div>
          {showShipTo && (
            <div className="col-span-6 p-3 space-y-0.5">
              <p className="font-extrabold uppercase underline">CONSIGNEE (SHIP TO)</p>
              <p className="font-extrabold uppercase" style={{ color: accent }}>
                {shipToName}
              </p>
              {shipToAddress ? (
                <p className="font-bold uppercase text-slate-900">{shipToAddress}</p>
              ) : (
                <p className="text-[10.5px] italic text-slate-500">Same as Buyer Address</p>
              )}
            </div>
          )}
        </div>

        {/* Items Table */}
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-slate-900 font-bold uppercase text-white" style={{ backgroundColor: accent }}>
              <th className="w-10 border-r border-slate-900 px-2 py-1.5 text-center">S.NO</th>
              <th className="border-r border-slate-900 px-2.5 py-1.5 text-center">PARTICULARS</th>
              {config.show_hsn && <th className="w-24 border-r border-slate-900 px-2 py-1.5 text-center">HSN CODE</th>}
              <th className="w-16 border-r border-slate-900 px-2 py-1.5 text-center">QTY</th>
              <th className="w-20 border-r border-slate-900 px-2 py-1.5 text-center">RATE</th>
              <th className="w-28 px-2.5 py-1.5 text-center">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => {
              const rateNum = Number(it.gst_rate || 0);
              const gross = Number(it.qty) * Number(it.unit_price);
              const baseAmt =
                it.taxable_value != null && it.taxable_value > 0
                  ? Number(it.taxable_value)
                  : rateNum > 0 && Math.abs(Number(it.line_total) - gross) < 1
                  ? Number(it.line_total) / (1 + rateNum / 100)
                  : rateNum > 0
                  ? gross
                  : Number(it.line_total);
              return (
                <tr key={i} className="border-b border-slate-800 font-bold">
                  <td className="border-r border-slate-900 px-2 py-1 text-center font-mono">{i + 1}</td>
                  <td className="border-r border-slate-900 px-2.5 py-1 uppercase">{it.product_name}</td>
                  {config.show_hsn && (
                    <td className="border-r border-slate-900 px-2 py-1 text-center font-mono">{it.hsn_code || "—"}</td>
                  )}
                  <td className="border-r border-slate-900 px-2 py-1 text-center font-mono">{it.qty}</td>
                  <td className="border-r border-slate-900 px-2 py-1 text-center font-mono">{Number(it.unit_price)}</td>
                  <td className="px-2.5 py-1 text-right font-mono">{fmtAmt(baseAmt)}</td>
                </tr>
              );
            })}
            {Array.from({ length: fillerCount }).map((_, idx) => (
              <tr key={`empty-${idx}`} className="border-b border-slate-800 h-6">
                <td className="border-r border-slate-900">&nbsp;</td>
                <td className="border-r border-slate-900" />
                {config.show_hsn && <td className="border-r border-slate-900" />}
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td />
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total Qty + Sub Total Bar */}
        <div className="grid grid-cols-12 border-b border-slate-900 text-[11px] font-extrabold">
          <div className="col-span-6 border-r border-slate-900 px-2.5 py-1" />
          <div
            className="col-span-2 border-r border-slate-900 px-2 py-1 text-center font-mono text-white"
            style={{ backgroundColor: accent }}
          >
            {totalQty}
          </div>
          <div className="col-span-2 border-r border-slate-900 px-2 py-1 text-center uppercase">SUB TOTAL</div>
          <div
            className="col-span-2 px-2.5 py-1 text-right font-mono text-white"
            style={{ backgroundColor: accent }}
          >
            {fmtAmt(data.taxableAmount || itemsSubTotal)}
          </div>
        </div>

        {/* Amount in Words + Tax Breakdown */}
        <div className="grid grid-cols-12 border-b border-slate-900 text-[11px]">
          <div className="col-span-6 flex flex-col justify-between border-r border-slate-900">
            <div>
              <div className="border-b border-slate-900 px-2.5 py-1 font-extrabold" style={{ color: accent }}>
                Amount in Words :
              </div>
              <div className="px-2.5 py-2 text-center font-extrabold uppercase leading-snug">
                {amountInWordsIndian(data.grandTotal)}
              </div>
            </div>
            <div className="border-t border-slate-900 px-2.5 py-1.5 font-extrabold uppercase">
              {config.footer_note || "THANKS FOR YOUR BUSINESS"}
            </div>
          </div>

          <div className="col-span-6 flex flex-col justify-between">
            <div className="divide-y divide-slate-200 font-bold">
              <div className="grid grid-cols-12 px-2.5 py-1">
                <span className="col-span-5 text-center">Add : CGST</span>
                <span className="col-span-3 text-center font-mono">{cgstPct}</span>
                <span className="col-span-4 text-right font-mono">{data.cgstAmount > 0 ? fmtAmt(data.cgstAmount) : ""}</span>
              </div>
              <div className="grid grid-cols-12 px-2.5 py-1">
                <span className="col-span-5 text-center">Add : SGST</span>
                <span className="col-span-3 text-center font-mono">{sgstPct}</span>
                <span className="col-span-4 text-right font-mono">{data.sgstAmount > 0 ? fmtAmt(data.sgstAmount) : ""}</span>
              </div>
              <div className="grid grid-cols-12 px-2.5 py-1">
                <span className="col-span-5 text-center">Add : IGST</span>
                <span className="col-span-3 text-center font-mono">{igstPct}</span>
                <span className="col-span-4 text-right font-mono">{data.igstAmount > 0 ? fmtAmt(data.igstAmount) : ""}</span>
              </div>
              <div className="grid grid-cols-12 px-2.5 py-1">
                <span className="col-span-5 text-center">Discount</span>
                <span className="col-span-3" />
                <span className="col-span-4 text-right font-mono">{discountAmt > 0 ? `-${fmtAmt(discountAmt)}` : ""}</span>
              </div>
            </div>
            <div
              className="grid grid-cols-12 border-t border-slate-900 px-2.5 py-1.5 font-extrabold text-white"
              style={{ backgroundColor: accent }}
            >
              <span className="col-span-6 text-center uppercase">TOTAL</span>
              <span className="col-span-6 text-right font-mono text-[12.5px]">{fmtAmt(data.grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Bottom Bank Details + Authorised Signature */}
        <div className="grid grid-cols-12 text-[11px]">
          <div className="col-span-6 border-r border-slate-900">
            {showBank ? (
              <div className="divide-y divide-slate-900 text-center font-bold">
                <div className="bg-slate-950 px-2.5 py-1 font-extrabold uppercase text-white">BANK DETAILS :</div>
                {bank.account_holder && <div className="px-2.5 py-1 font-extrabold uppercase text-red-700">{bank.account_holder}</div>}
                {bank.bank_name && <div className="px-2.5 py-1 uppercase">{bank.bank_name}{bank.branch_name ? ` — ${bank.branch_name}` : ""}</div>}
                {bank.account_number && <div className="px-2.5 py-1 font-mono">ACC NO : {bank.account_number}</div>}
                {bank.ifsc_code && <div className="px-2.5 py-1 font-mono">IFSC CODE : {bank.ifsc_code}</div>}
              </div>
            ) : (
              <div className="p-3 text-[10.5px] text-slate-600">
                {config.terms ? <><strong className="text-slate-900">Terms:</strong> {config.terms}</> : "Add your Bank Details in My Profile to show them here."}
              </div>
            )}
          </div>
          <div className="col-span-6 flex flex-col justify-between p-3 text-right">
            <p className="font-extrabold" style={{ color: accent }}>For {signatoryName}</p>
            <div className="mt-10">
              {config.terms && showBank && <p className="mb-2 text-left text-[9.5px] text-slate-500">{config.terms}</p>}
              <p className="font-extrabold" style={{ color: accent }}>Authorised Signature</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GST LAYOUT 2: MODERN TOP BANNER (Executive Corporate Band)
  // ═══════════════════════════════════════════════════════════════════════════
  if (style === "gst_executive_band") {
    return (
      <div className={`print-doc mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs print:border-0 print:shadow-none ${widthClass}`}>
        <div className="flex flex-wrap items-start justify-between gap-4 px-6 py-5 text-white" style={{ backgroundColor: accent }}>
          <div className="flex items-start gap-3 max-w-[62%]">
            {config.show_logo && data.logoUrl && (
              <img src={data.logoUrl} alt={sellerName} className="h-12 w-12 shrink-0 rounded-lg bg-white p-1 object-contain" />
            )}
            <div className="space-y-0.5">
              <h2 className="text-lg font-extrabold tracking-tight uppercase">{sellerName}</h2>
              {config.header_subtitle && <p className="text-xs text-white/80">{config.header_subtitle}</p>}
              {sellerAddress && <p className="text-[11px] text-white/85 leading-snug">{sellerAddress}</p>}
              <p className="text-[11px] text-white/85">
                {[sellerPhone && `Ph: ${sellerPhone}`, sellerEmail].filter(Boolean).join(" · ")}
              </p>
              {sellerGstin && <p className="font-mono text-[11px] font-bold text-white">GSTIN: {sellerGstin}</p>}
            </div>
          </div>
          <div className="rounded-xl bg-white px-4 py-2.5 text-right text-slate-900 shadow-xs">
            <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-slate-600">
              {copyLabel}
            </span>
            <p className="mt-1 text-sm font-extrabold uppercase tracking-wide" style={{ color: accent }}>{docLabel}</p>
            <p className="font-mono text-xs font-bold">#{data.invoiceNumber}</p>
            <p className="text-[11px] text-slate-500">{data.dateStr}</p>
          </div>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div className={`grid gap-3 ${showShipTo ? "grid-cols-2" : "grid-cols-1"}`}>
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-0.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Buyer (Bill To)</p>
              <p className="text-sm font-bold text-slate-900">{data.customerName}</p>
              {data.customerAddress && <p className="text-[11px] text-slate-600">{data.customerAddress}</p>}
              {data.customerPhone && <p className="text-[11px] text-slate-600">Phone: {data.customerPhone}</p>}
              {data.customerGstin && <p className="font-mono text-[11px] font-semibold text-slate-800">GSTIN: {data.customerGstin}</p>}
            </div>
            {showShipTo && (
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3.5 space-y-0.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Consignee (Ship To)</p>
                <p className="text-sm font-bold text-slate-900">{shipToName}</p>
                {shipToAddress ? (
                  <p className="text-[11px] text-slate-600">{shipToAddress}</p>
                ) : (
                  <p className="text-[11px] italic text-slate-400">Same as billing address</p>
                )}
                {data.placeOfSupply && <p className="text-[11px] text-slate-600">State: <strong>{data.placeOfSupply}</strong></p>}
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-left text-[11.5px]">
              <thead>
                <tr className="bg-slate-100 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                  <th className="px-3 py-2 text-center w-10">#</th>
                  <th className="px-3 py-2">Particulars</th>
                  {config.show_hsn && <th className="px-2.5 py-2 text-center">HSN</th>}
                  <th className="px-2.5 py-2 text-right">Qty</th>
                  <th className="px-2.5 py-2 text-right">Rate</th>
                  <th className="px-3 py-2 text-right">Amount (₹)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((it, i) => (
                  <tr key={i} className={i % 2 === 1 ? "bg-slate-50/60" : ""}>
                    <td className="px-3 py-2 text-center font-mono text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 font-semibold text-slate-900">{it.product_name}</td>
                    {config.show_hsn && <td className="px-2.5 py-2 text-center font-mono text-slate-600">{it.hsn_code || "—"}</td>}
                    <td className="px-2.5 py-2 text-right font-mono">{it.qty}</td>
                    <td className="px-2.5 py-2 text-right font-mono">₹{fmtAmt(it.unit_price)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold">₹{fmtAmt(Number(it.qty) * Number(it.unit_price))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-12 gap-4 items-start">
            <div className="col-span-7 space-y-3">
              <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount in Words</p>
                <p className="mt-0.5 font-semibold text-slate-900">{amountInWordsIndian(data.grandTotal)}</p>
              </div>
              {showBank && (
                <div className="rounded-xl border border-slate-200 p-3 space-y-0.5 text-[11px]">
                  <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: accent }}>Bank Transfer Details</p>
                  {bank.account_holder && <p className="font-bold text-slate-900">{bank.account_holder}</p>}
                  {bank.bank_name && <p className="text-slate-700">{bank.bank_name}{bank.branch_name ? ` (${bank.branch_name})` : ""}</p>}
                  <div className="flex flex-wrap gap-x-4 font-mono text-slate-800">
                    {bank.account_number && <span>A/C: <strong>{bank.account_number}</strong></span>}
                    {bank.ifsc_code && <span>IFSC: <strong>{bank.ifsc_code}</strong></span>}
                  </div>
                  {config.show_upi_qr && bank.upi_id && <p className="font-mono text-slate-700">UPI: <strong>{bank.upi_id}</strong></p>}
                </div>
              )}
            </div>

            <div className="col-span-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/60">
              <div className="divide-y divide-slate-200/80 px-3.5 py-1 text-[11.5px]">
                <div className="flex justify-between py-1.5"><span>Total Qty ({totalQty}) · Sub Total</span><span className="font-mono font-semibold">₹{fmtAmt(data.taxableAmount || itemsSubTotal)}</span></div>
                {data.cgstAmount > 0 && <div className="flex justify-between py-1.5"><span>CGST {cgstPct}</span><span className="font-mono">₹{fmtAmt(data.cgstAmount)}</span></div>}
                {data.sgstAmount > 0 && <div className="flex justify-between py-1.5"><span>SGST {sgstPct}</span><span className="font-mono">₹{fmtAmt(data.sgstAmount)}</span></div>}
                {data.igstAmount > 0 && <div className="flex justify-between py-1.5"><span>IGST {igstPct}</span><span className="font-mono">₹{fmtAmt(data.igstAmount)}</span></div>}
                {discountAmt > 0 && <div className="flex justify-between py-1.5 text-emerald-700"><span>Discount</span><span className="font-mono">-₹{fmtAmt(discountAmt)}</span></div>}
              </div>
              <div className="flex items-center justify-between px-3.5 py-2.5 text-sm font-extrabold text-white" style={{ backgroundColor: accent }}>
                <span>GRAND TOTAL</span>
                <span className="font-mono">₹{fmtAmt(data.grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between border-t border-slate-200 pt-3 text-[11px] text-slate-600">
            <div>
              {config.terms && <p className="text-[10.5px]">{config.terms}</p>}
              {config.footer_note && <p className="mt-0.5 font-semibold text-slate-800">{config.footer_note}</p>}
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-900">For {signatoryName}</p>
              <p className="mt-7 border-t border-slate-400 pt-1 text-[10.5px]">Authorised Signature</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GST LAYOUT 3: SIDE STRIPE EDITORIAL (Left Accent Bar)
  // ═══════════════════════════════════════════════════════════════════════════
  if (style === "gst_sidebar_accent") {
    return (
      <div className={`print-doc mx-auto flex overflow-hidden rounded-xl border border-slate-200 bg-white print:border-0 print:shadow-none ${widthClass}`}>
        <div className="w-2.5 shrink-0" style={{ backgroundColor: accent }} />
        <div className="flex-1 p-6 space-y-4 text-xs">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="space-y-1 max-w-[60%]">
              <div className="flex items-center gap-2.5">
                {config.show_logo && data.logoUrl && (
                  <img src={data.logoUrl} alt={sellerName} className="h-10 w-10 rounded object-contain" />
                )}
                <h2 className="text-lg font-extrabold tracking-tight text-slate-900">{sellerName}</h2>
              </div>
              {sellerAddress && <p className="text-[11px] text-slate-600">{sellerAddress}</p>}
              <p className="text-[11px] text-slate-600">
                {[sellerPhone && `Phone: ${sellerPhone}`, sellerEmail && `Email: ${sellerEmail}`].filter(Boolean).join(" | ")}
              </p>
              {sellerGstin && <p className="font-mono text-[11px] font-bold" style={{ color: accent }}>GSTIN: {sellerGstin}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{copyLabel}</p>
              <p className="text-xl font-black tracking-tight uppercase" style={{ color: accent }}>{docLabel}</p>
              <p className="mt-1 font-mono text-xs font-bold text-slate-900">Invoice #{data.invoiceNumber}</p>
              <p className="text-[11px] text-slate-500">Date: {data.dateStr}</p>
            </div>
          </div>

          <div className={`grid gap-4 ${showShipTo ? "grid-cols-2" : "grid-cols-1"}`}>
            <div className="border-l-2 pl-3 space-y-0.5" style={{ borderColor: accent }}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Buyer (Bill To)</p>
              <p className="font-bold text-slate-900 text-[13px]">{data.customerName}</p>
              {data.customerAddress && <p className="text-[11px] text-slate-600">{data.customerAddress}</p>}
              {data.customerGstin && <p className="font-mono text-[11px] font-semibold text-slate-800">GSTIN: {data.customerGstin}</p>}
            </div>
            {showShipTo && (
              <div className="border-l-2 border-slate-300 pl-3 space-y-0.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Consignee (Ship To)</p>
                <p className="font-bold text-slate-900 text-[13px]">{shipToName}</p>
                <p className="text-[11px] text-slate-600">{shipToAddress || "Same as billing address"}</p>
              </div>
            )}
          </div>

          <table className="w-full border-collapse text-left text-[11.5px]">
            <thead>
              <tr className="border-y-2 border-slate-900 text-[10px] font-bold uppercase tracking-wider text-slate-700">
                <th className="py-2 pr-2 w-8">#</th>
                <th className="py-2 pr-2">Particulars</th>
                {config.show_hsn && <th className="py-2 px-2 text-center">HSN</th>}
                <th className="py-2 px-2 text-right">Qty</th>
                <th className="py-2 px-2 text-right">Rate</th>
                <th className="py-2 pl-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.items.map((it, i) => (
                <tr key={i}>
                  <td className="py-2 pr-2 font-mono text-slate-400">{i + 1}</td>
                  <td className="py-2 pr-2 font-medium text-slate-900">{it.product_name}</td>
                  {config.show_hsn && <td className="py-2 px-2 text-center font-mono text-slate-600">{it.hsn_code || "—"}</td>}
                  <td className="py-2 px-2 text-right font-mono">{it.qty}</td>
                  <td className="py-2 px-2 text-right font-mono">₹{fmtAmt(it.unit_price)}</td>
                  <td className="py-2 pl-2 text-right font-mono font-semibold">₹{fmtAmt(Number(it.qty) * Number(it.unit_price))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="grid grid-cols-12 gap-4 pt-1">
            <div className="col-span-7 space-y-2.5">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Amount in Words</p>
                <p className="font-semibold text-slate-900">{amountInWordsIndian(data.grandTotal)}</p>
              </div>
              {showBank && (
                <div className="rounded-lg bg-slate-50 p-3 text-[11px] space-y-0.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Bank Details</p>
                  <p className="font-bold text-slate-900">{bank.account_holder || sellerName}</p>
                  <p className="text-slate-700">{[bank.bank_name, bank.branch_name].filter(Boolean).join(" · ")}</p>
                  <p className="font-mono text-slate-800">
                    {[bank.account_number && `A/C: ${bank.account_number}`, bank.ifsc_code && `IFSC: ${bank.ifsc_code}`].filter(Boolean).join(" | ")}
                  </p>
                </div>
              )}
            </div>
            <div className="col-span-5 space-y-1 text-[11.5px]">
              <div className="flex justify-between py-0.5"><span className="text-slate-600">Sub Total ({totalQty} qty)</span><span className="font-mono">₹{fmtAmt(data.taxableAmount || itemsSubTotal)}</span></div>
              {data.cgstAmount > 0 && <div className="flex justify-between py-0.5"><span className="text-slate-600">CGST {cgstPct}</span><span className="font-mono">₹{fmtAmt(data.cgstAmount)}</span></div>}
              {data.sgstAmount > 0 && <div className="flex justify-between py-0.5"><span className="text-slate-600">SGST {sgstPct}</span><span className="font-mono">₹{fmtAmt(data.sgstAmount)}</span></div>}
              {data.igstAmount > 0 && <div className="flex justify-between py-0.5"><span className="text-slate-600">IGST {igstPct}</span><span className="font-mono">₹{fmtAmt(data.igstAmount)}</span></div>}
              {discountAmt > 0 && <div className="flex justify-between py-0.5 text-emerald-700"><span>Discount</span><span className="font-mono">-₹{fmtAmt(discountAmt)}</span></div>}
              <div className="mt-2 flex justify-between rounded-lg bg-slate-900 px-3 py-2 text-sm font-extrabold text-white">
                <span>TOTAL</span>
                <span className="font-mono">₹{fmtAmt(data.grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between border-t border-slate-200 pt-3 text-[11px]">
            <p className="font-medium text-slate-600">{config.footer_note || "Thanks for your business!"}</p>
            <div className="text-right">
              <p className="font-bold text-slate-900">For {signatoryName}</p>
              <p className="mt-6 border-t border-slate-400 pt-1 text-[10px] text-slate-600">Authorised Signature</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GST LAYOUT 4: SHOWROOM DOUBLE FRAME (Traditional Centered Letterhead)
  // ═══════════════════════════════════════════════════════════════════════════
  if (style === "gst_royal_frame") {
    return (
      <div className={`print-doc mx-auto border-4 border-double border-slate-800 bg-white p-4 text-slate-900 print:shadow-none ${widthClass}`}>
        <div className="border border-slate-400">
          {/* Centered Letterhead */}
          <div className="border-b border-slate-800 px-4 py-3 text-center space-y-0.5">
            <div className="flex items-center justify-between text-[10px] font-bold uppercase text-slate-500">
              <span>GSTIN: {sellerGstin || "—"}</span>
              <span>{copyLabel}</span>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-1">
              {config.show_logo && data.logoUrl && (
                <img src={data.logoUrl} alt={sellerName} className="h-10 w-10 object-contain" />
              )}
              <h2 className="text-xl font-black tracking-wide uppercase" style={{ color: accent }}>{sellerName}</h2>
            </div>
            {config.header_subtitle && <p className="text-[11px] font-medium text-slate-600">{config.header_subtitle}</p>}
            {sellerAddress && <p className="text-[11px] text-slate-700">{sellerAddress}</p>}
            <p className="text-[11px] font-semibold text-slate-700">
              {[sellerPhone && `Ph: ${sellerPhone}`, sellerEmail && `Email: ${sellerEmail}`].filter(Boolean).join("  •  ")}
            </p>
          </div>

          {/* Centered Ribbon Bar */}
          <div className="flex items-center justify-between border-b border-slate-800 bg-slate-100 px-4 py-1.5 text-[11px] font-bold">
            <span>Invoice No: <span className="font-mono">{data.invoiceNumber}</span></span>
            <span className="rounded px-3 py-0.5 text-xs font-extrabold uppercase tracking-widest text-white" style={{ backgroundColor: accent }}>
              {docLabel}
            </span>
            <span>Date: <span className="font-mono">{data.dateStr}</span></span>
          </div>

          {/* Buyer + Ship To */}
          <div className="grid grid-cols-12 border-b border-slate-800 text-[11px]">
            <div className={`${showShipTo ? "col-span-6 border-r border-slate-800" : "col-span-12"} p-3 space-y-0.5`}>
              <p className="text-[10px] font-bold uppercase text-slate-500">Buyer (Bill To)</p>
              <p className="font-bold text-slate-900">{data.customerName}</p>
              {data.customerAddress && <p className="text-slate-700">{data.customerAddress}</p>}
              {data.customerGstin && <p className="font-mono font-semibold">GSTIN: {data.customerGstin}</p>}
            </div>
            {showShipTo && (
              <div className="col-span-6 p-3 space-y-0.5">
                <p className="text-[10px] font-bold uppercase text-slate-500">Consignee (Ship To)</p>
                <p className="font-bold text-slate-900">{shipToName}</p>
                <p className="text-slate-700">{shipToAddress || "Same as Buyer"}</p>
              </div>
            )}
          </div>

          {/* Table */}
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-50 text-[10px] font-bold uppercase">
                <th className="w-10 border-r border-slate-400 px-2 py-1.5 text-center">S.No</th>
                <th className="border-r border-slate-400 px-2.5 py-1.5 text-left">Description of Goods</th>
                {config.show_hsn && <th className="w-24 border-r border-slate-400 px-2 py-1.5 text-center">HSN Code</th>}
                <th className="w-16 border-r border-slate-400 px-2 py-1.5 text-right">Qty</th>
                <th className="w-20 border-r border-slate-400 px-2 py-1.5 text-right">Rate</th>
                <th className="w-28 px-2.5 py-1.5 text-right">Amount (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-300">
              {data.items.map((it, i) => (
                <tr key={i}>
                  <td className="border-r border-slate-400 px-2 py-1.5 text-center font-mono">{i + 1}</td>
                  <td className="border-r border-slate-400 px-2.5 py-1.5 font-semibold">{it.product_name}</td>
                  {config.show_hsn && <td className="border-r border-slate-400 px-2 py-1.5 text-center font-mono">{it.hsn_code || "—"}</td>}
                  <td className="border-r border-slate-400 px-2 py-1.5 text-right font-mono">{it.qty}</td>
                  <td className="border-r border-slate-400 px-2 py-1.5 text-right font-mono">{fmtAmt(it.unit_price)}</td>
                  <td className="px-2.5 py-1.5 text-right font-mono font-semibold">{fmtAmt(Number(it.qty) * Number(it.unit_price))}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Bottom Summary + Bank + Sign */}
          <div className="grid grid-cols-12 border-t border-slate-800 text-[11px]">
            <div className="col-span-7 border-r border-slate-800 p-3 space-y-2.5">
              <div>
                <p className="text-[10px] font-bold uppercase text-slate-500">Amount in Words</p>
                <p className="font-bold uppercase">{amountInWordsIndian(data.grandTotal)}</p>
              </div>
              {showBank && (
                <div className="border border-slate-400 bg-slate-50 p-2.5 space-y-0.5 text-[10.5px]">
                  <p className="font-bold uppercase" style={{ color: accent }}>Bank Details</p>
                  <p className="font-bold">{bank.account_holder || sellerName}</p>
                  <p>{bank.bank_name}{bank.branch_name ? ` — ${bank.branch_name}` : ""}</p>
                  <p className="font-mono">A/C No: {bank.account_number || "—"} | IFSC: {bank.ifsc_code || "—"}</p>
                </div>
              )}
            </div>
            <div className="col-span-5 divide-y divide-slate-300">
              <div className="flex justify-between px-3 py-1.5"><span>Sub Total ({totalQty})</span><span className="font-mono font-semibold">₹{fmtAmt(data.taxableAmount || itemsSubTotal)}</span></div>
              {data.cgstAmount > 0 && <div className="flex justify-between px-3 py-1.5"><span>CGST {cgstPct}</span><span className="font-mono">₹{fmtAmt(data.cgstAmount)}</span></div>}
              {data.sgstAmount > 0 && <div className="flex justify-between px-3 py-1.5"><span>SGST {sgstPct}</span><span className="font-mono">₹{fmtAmt(data.sgstAmount)}</span></div>}
              {data.igstAmount > 0 && <div className="flex justify-between px-3 py-1.5"><span>IGST {igstPct}</span><span className="font-mono">₹{fmtAmt(data.igstAmount)}</span></div>}
              {discountAmt > 0 && <div className="flex justify-between px-3 py-1.5"><span>Discount</span><span className="font-mono">-₹{fmtAmt(discountAmt)}</span></div>}
              <div className="flex justify-between px-3 py-2 text-xs font-extrabold text-white" style={{ backgroundColor: accent }}>
                <span>GRAND TOTAL</span>
                <span className="font-mono">₹{fmtAmt(data.grandTotal)}</span>
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between border-t border-slate-800 px-4 py-2.5 text-[10.5px]">
            <p className="font-semibold text-slate-600">{config.footer_note || "Thanks for your business!"}</p>
            <div className="text-right">
              <p className="font-bold">For {signatoryName}</p>
              <p className="mt-6 border-t border-slate-500 pt-0.5 text-[10px]">Authorised Signatory</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // GST LAYOUT 5: BULK ORDER COMPACT (High-Density Multi-Item Wholesale)
  // ═══════════════════════════════════════════════════════════════════════════
  if (style === "gst_compact_split") {
    return (
      <div className={`print-doc mx-auto overflow-hidden rounded-lg border border-slate-300 bg-white text-slate-900 print:border-0 print:shadow-none ${widthClass}`}>
        {/* Slim Dark Top Strip */}
        <div className="flex items-center justify-between px-4 py-2.5 text-white" style={{ backgroundColor: accent }}>
          <div className="flex items-center gap-2">
            {config.show_logo && data.logoUrl && (
              <img src={data.logoUrl} alt={sellerName} className="h-7 w-7 rounded bg-white p-0.5 object-contain" />
            )}
            <span className="text-sm font-extrabold uppercase tracking-wide">{sellerName}</span>
            {sellerGstin && <span className="rounded bg-white/15 px-2 py-0.5 font-mono text-[10px]">GSTIN: {sellerGstin}</span>}
          </div>
          <div className="text-right text-[11px]">
            <span className="font-extrabold uppercase tracking-wider">{docLabel}</span>
            <span className="ml-2 font-mono opacity-90">#{data.invoiceNumber} · {data.dateStr}</span>
          </div>
        </div>

        {/* Compact 3-Column Strip: Seller | Bill To | Ship To */}
        <div className={`grid border-b border-slate-300 bg-slate-50 text-[10.5px] leading-snug ${showShipTo ? "grid-cols-3 divide-x divide-slate-300" : "grid-cols-2 divide-x divide-slate-300"}`}>
          <div className="p-2.5 space-y-0.5">
            <p className="text-[9.5px] font-bold uppercase text-slate-500">From (Seller)</p>
            {sellerAddress && <p className="text-slate-700">{sellerAddress}</p>}
            <p className="text-slate-700">{[sellerPhone, sellerEmail].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="p-2.5 space-y-0.5">
            <p className="text-[9.5px] font-bold uppercase text-slate-500">Buyer (Bill To)</p>
            <p className="font-bold text-slate-900">{data.customerName}</p>
            {data.customerAddress && <p className="text-slate-700">{data.customerAddress}</p>}
            {data.customerGstin && <p className="font-mono font-semibold">GSTIN: {data.customerGstin}</p>}
          </div>
          {showShipTo && (
            <div className="p-2.5 space-y-0.5">
              <p className="text-[9.5px] font-bold uppercase text-slate-500">Consignee (Ship To)</p>
              <p className="font-bold text-slate-900">{shipToName}</p>
              <p className="text-slate-700">{shipToAddress || "Same as Buyer"}</p>
            </div>
          )}
        </div>

        {/* Compact High-Capacity Table */}
        <table className="w-full border-collapse text-left text-[10.5px]">
          <thead>
            <tr className="border-b border-slate-400 bg-slate-100 text-[9.5px] font-bold uppercase text-slate-700">
              <th className="w-8 px-2 py-1.5 text-center">#</th>
              <th className="px-2 py-1.5">Particulars</th>
              {config.show_hsn && <th className="w-20 px-2 py-1.5 text-center">HSN</th>}
              <th className="w-14 px-2 py-1.5 text-right">Qty</th>
              <th className="w-16 px-2 py-1.5 text-right">Rate</th>
              <th className="w-12 px-2 py-1.5 text-right">GST</th>
              <th className="w-24 px-2.5 py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.items.map((it, i) => (
              <tr key={i} className={i % 2 === 1 ? "bg-slate-50/70" : ""}>
                <td className="px-2 py-1 text-center font-mono text-slate-400">{i + 1}</td>
                <td className="px-2 py-1 font-medium text-slate-900">{it.product_name}</td>
                {config.show_hsn && <td className="px-2 py-1 text-center font-mono text-slate-600">{it.hsn_code || "—"}</td>}
                <td className="px-2 py-1 text-right font-mono">{it.qty}</td>
                <td className="px-2 py-1 text-right font-mono">{fmtAmt(it.unit_price)}</td>
                <td className="px-2 py-1 text-right font-mono text-slate-600">{it.gst_rate}%</td>
                <td className="px-2.5 py-1 text-right font-mono font-semibold">{fmtAmt(Number(it.qty) * Number(it.unit_price))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Compact Footer Strip */}
        <div className="grid grid-cols-12 border-t border-slate-400 text-[10.5px]">
          <div className="col-span-4 border-r border-slate-300 p-2.5 space-y-1">
            <p className="text-[9.5px] font-bold uppercase text-slate-500">Bank Details</p>
            {showBank ? (
              <>
                <p className="font-bold">{bank.account_holder || sellerName}</p>
                <p>{bank.bank_name}</p>
                <p className="font-mono">A/C: {bank.account_number || "—"}</p>
                <p className="font-mono">IFSC: {bank.ifsc_code || "—"}</p>
              </>
            ) : (
              <p className="text-slate-400">Set in My Profile</p>
            )}
          </div>
          <div className="col-span-4 border-r border-slate-300 p-2.5 flex flex-col justify-between">
            <div>
              <p className="text-[9.5px] font-bold uppercase text-slate-500">In Words</p>
              <p className="font-semibold leading-snug">{amountInWordsIndian(data.grandTotal)}</p>
            </div>
            <div className="pt-4 text-right">
              <p className="font-bold">For {signatoryName}</p>
              <p className="text-[9.5px] text-slate-500">Authorised Signatory</p>
            </div>
          </div>
          <div className="col-span-4 divide-y divide-slate-200">
            <div className="flex justify-between px-2.5 py-1"><span>Sub Total ({totalQty})</span><span className="font-mono">₹{fmtAmt(data.taxableAmount || itemsSubTotal)}</span></div>
            {data.cgstAmount > 0 && <div className="flex justify-between px-2.5 py-1"><span>CGST {cgstPct}</span><span className="font-mono">₹{fmtAmt(data.cgstAmount)}</span></div>}
            {data.sgstAmount > 0 && <div className="flex justify-between px-2.5 py-1"><span>SGST {sgstPct}</span><span className="font-mono">₹{fmtAmt(data.sgstAmount)}</span></div>}
            {data.igstAmount > 0 && <div className="flex justify-between px-2.5 py-1"><span>IGST {igstPct}</span><span className="font-mono">₹{fmtAmt(data.igstAmount)}</span></div>}
            {discountAmt > 0 && <div className="flex justify-between px-2.5 py-1"><span>Discount</span><span className="font-mono">-₹{fmtAmt(discountAmt)}</span></div>}
            <div className="flex justify-between px-2.5 py-1.5 text-xs font-extrabold text-white" style={{ backgroundColor: accent }}>
              <span>TOTAL</span>
              <span className="font-mono">₹{fmtAmt(data.grandTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMAL LAYOUT 2: BOLD COLOR HEADER (normal_banner)
  // ═══════════════════════════════════════════════════════════════════════════
  if (style === "normal_banner") {
    return (
      <div className={`print-doc mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs print:border-0 print:shadow-none ${widthClass}`}>
        <div className="flex items-start justify-between gap-4 px-6 py-4 text-white" style={{ backgroundColor: accent }}>
          <div className="flex items-center gap-3">
            {config.show_logo && data.logoUrl && (
              <img src={data.logoUrl} alt={sellerName} className="h-11 w-11 rounded-lg bg-white p-1 object-contain" />
            )}
            <div>
              <h2 className="text-lg font-extrabold tracking-tight">{sellerName}</h2>
              {config.header_subtitle && <p className="text-xs text-white/80">{config.header_subtitle}</p>}
              {sellerAddress && <p className="text-[11px] text-white/80">{sellerAddress}</p>}
              {sellerPhone && <p className="text-[11px] text-white/85">Ph: {sellerPhone}</p>}
            </div>
          </div>
          <div className="text-right">
            <span className="inline-block rounded-md bg-white/15 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider">{docLabel}</span>
            <p className="mt-1 font-mono text-xs font-bold">#{data.invoiceNumber}</p>
            <p className="text-[11px] text-white/80">{data.dateStr}</p>
          </div>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400">Billed To</span>
              <p className="text-sm font-bold text-slate-900">{data.customerName}</p>
              {data.customerAddress && <p className="text-[11px] text-slate-600">{data.customerAddress}</p>}
            </div>
            {data.customerPhone && <p className="font-mono text-xs text-slate-700">Ph: {data.customerPhone}</p>}
          </div>

          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-y border-slate-200 bg-slate-100 text-[10.5px] font-bold uppercase text-slate-600">
                <th className="px-2.5 py-2 w-8">#</th>
                <th className="px-2.5 py-2">Item</th>
                <th className="px-2.5 py-2 text-right">Qty</th>
                <th className="px-2.5 py-2 text-right">Rate</th>
                <th className="px-2.5 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((it, i) => (
                <tr key={i} className={i % 2 === 1 ? "bg-slate-50/70" : ""}>
                  <td className="px-2.5 py-2 font-mono text-slate-400">{i + 1}</td>
                  <td className="px-2.5 py-2 font-medium text-slate-900">{it.product_name}</td>
                  <td className="px-2.5 py-2 text-right font-mono">{it.qty}</td>
                  <td className="px-2.5 py-2 text-right font-mono">₹{fmtAmt(it.unit_price)}</td>
                  <td className="px-2.5 py-2 text-right font-mono font-semibold">₹{fmtAmt(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2 max-w-sm">
              <p className="text-[11px] text-slate-600"><strong>In Words:</strong> {amountInWordsIndian(data.grandTotal)}</p>
              {showBank && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px]">
                  <p className="font-bold text-slate-800">Bank / Payment Info</p>
                  <p className="text-slate-600">{[bank.bank_name, bank.account_number && `A/C ${bank.account_number}`, bank.ifsc_code && `IFSC ${bank.ifsc_code}`].filter(Boolean).join(" · ")}</p>
                </div>
              )}
              {config.show_upi_qr && bank.upi_id && (
                <p className="font-mono text-[11px] text-slate-700">UPI ID: <strong>{bank.upi_id}</strong></p>
              )}
            </div>

            <div className="ml-auto w-60 rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-1.5">
              <div className="flex justify-between text-slate-600"><span>Items ({totalQty})</span><span className="font-mono">₹{fmtAmt(itemsSubTotal)}</span></div>
              {discountAmt > 0 && <div className="flex justify-between text-emerald-700"><span>Discount</span><span className="font-mono">-₹{fmtAmt(discountAmt)}</span></div>}
              <div className="flex justify-between border-t border-slate-300 pt-1.5 text-sm font-extrabold" style={{ color: accent }}>
                <span>Total</span>
                <span className="font-mono">₹{fmtAmt(data.grandTotal)}</span>
              </div>
              <div className="flex justify-between font-mono text-[11px] text-slate-500">
                <span>Paid: ₹{fmtAmt(data.paidAmount)}</span>
                <span>Due: ₹{fmtAmt(data.dueAmount)}</span>
              </div>
            </div>
          </div>

          {config.terms && <p className="text-[10.5px] text-slate-500">{config.terms}</p>}
          {config.footer_note && <p className="border-t border-slate-100 pt-2 text-center text-xs font-semibold text-slate-700">{config.footer_note}</p>}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMAL LAYOUT 3: MINIMAL SHOWROOM (normal_boutique)
  // ═══════════════════════════════════════════════════════════════════════════
  if (style === "normal_boutique") {
    return (
      <div className={`print-doc mx-auto rounded-xl border border-slate-200 bg-white p-7 text-slate-900 print:border-0 print:shadow-none ${widthClass}`}>
        <div className="text-center space-y-1 border-b border-slate-200 pb-5">
          {config.show_logo && data.logoUrl && (
            <img src={data.logoUrl} alt={sellerName} className="mx-auto mb-2 h-11 w-11 object-contain" />
          )}
          <h2 className="text-xl font-bold tracking-[0.14em] uppercase">{sellerName}</h2>
          {config.header_subtitle && <p className="text-[11px] uppercase tracking-widest text-slate-500">{config.header_subtitle}</p>}
          {sellerAddress && <p className="text-[11px] text-slate-500">{sellerAddress}</p>}
          {(sellerPhone || sellerEmail) && (
            <p className="text-[11px] text-slate-500">{[sellerPhone, sellerEmail].filter(Boolean).join("  ·  ")}</p>
          )}
        </div>

        <div className="flex items-center justify-between py-4 text-xs border-b border-slate-100">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">Customer</p>
            <p className="font-semibold text-slate-900">{data.customerName}</p>
            {data.customerPhone && <p className="text-[11px] text-slate-500">{data.customerPhone}</p>}
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-slate-400">{docLabel}</p>
            <p className="font-mono font-semibold">{data.invoiceNumber}</p>
            <p className="text-[11px] text-slate-500">{data.dateStr}</p>
          </div>
        </div>

        <table className="my-4 w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-900 text-[10px] uppercase tracking-widest text-slate-500">
              <th className="py-2">Item</th>
              <th className="py-2 text-right">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((it, i) => (
              <tr key={i}>
                <td className="py-2.5 font-medium">{it.product_name}</td>
                <td className="py-2.5 text-right font-mono">{it.qty}</td>
                <td className="py-2.5 text-right font-mono">₹{fmtAmt(it.unit_price)}</td>
                <td className="py-2.5 text-right font-mono font-semibold">₹{fmtAmt(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto max-w-[240px] space-y-1 border-t border-slate-900 pt-3 text-xs">
          {discountAmt > 0 && <div className="flex justify-between text-slate-600"><span>Discount</span><span className="font-mono">-₹{fmtAmt(discountAmt)}</span></div>}
          <div className="flex justify-between text-base font-bold">
            <span>Total</span>
            <span className="font-mono">₹{fmtAmt(data.grandTotal)}</span>
          </div>
          <div className="flex justify-between font-mono text-[11px] text-slate-500">
            <span>Paid ₹{fmtAmt(data.paidAmount)}</span>
            <span>Due ₹{fmtAmt(data.dueAmount)}</span>
          </div>
        </div>

        <p className="mt-5 text-center text-[11px] text-slate-500">{amountInWordsIndian(data.grandTotal)}</p>
        {config.terms && <p className="mt-2 text-center text-[10px] text-slate-400">{config.terms}</p>}
        {config.footer_note && <p className="mt-3 text-center text-xs font-medium tracking-wide text-slate-700">{config.footer_note}</p>}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMAL LAYOUT 4: CLASSIC BILL BOOK (normal_cash_memo)
  // ═══════════════════════════════════════════════════════════════════════════
  if (style === "normal_cash_memo") {
    const fillerCount = isA5 ? 0 : Math.max(0, Math.min(5, 8 - data.items.length));
    return (
      <div className={`print-doc mx-auto border-2 border-slate-900 bg-white text-slate-900 print:shadow-none ${widthClass}`}>
        <div className="flex items-start justify-between border-b-2 border-slate-900 p-4">
          <div className="flex items-start gap-2.5">
            {config.show_logo && data.logoUrl && (
              <img src={data.logoUrl} alt={sellerName} className="h-11 w-11 object-contain" />
            )}
            <div>
              <h2 className="text-base font-extrabold uppercase" style={{ color: accent }}>{sellerName}</h2>
              {config.header_subtitle && <p className="text-[11px] font-semibold text-slate-600">{config.header_subtitle}</p>}
              {sellerAddress && <p className="text-[11px] text-slate-700">{sellerAddress}</p>}
              {(sellerPhone || sellerEmail) && <p className="text-[11px] font-medium">{[sellerPhone && `Ph: ${sellerPhone}`, sellerEmail].filter(Boolean).join(" · ")}</p>}
            </div>
          </div>
          <div className="border border-slate-900 text-[11px] min-w-[165px]">
            <div className="px-2.5 py-1 text-center font-extrabold uppercase text-white" style={{ backgroundColor: accent }}>
              {docLabel}
            </div>
            <div className="divide-y divide-slate-300 px-2.5 py-1 font-mono">
              <div className="flex justify-between py-0.5"><span>Bill No:</span><strong>{data.invoiceNumber}</strong></div>
              <div className="flex justify-between py-0.5"><span>Date:</span><span>{data.dateStr}</span></div>
            </div>
          </div>
        </div>

        <div className="border-b border-slate-900 bg-slate-50 px-4 py-2 text-xs flex flex-wrap justify-between gap-2">
          <div><span className="font-semibold text-slate-600">M/s / Name:</span> <strong className="uppercase">{data.customerName}</strong></div>
          {data.customerPhone && <div><span className="font-semibold text-slate-600">Phone:</span> <span className="font-mono">{data.customerPhone}</span></div>}
        </div>

        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-100 text-[10.5px] font-bold uppercase">
              <th className="w-10 border-r border-slate-900 px-2 py-1.5 text-center">S.No</th>
              <th className="border-r border-slate-900 px-2.5 py-1.5 text-left">Particulars</th>
              <th className="w-16 border-r border-slate-900 px-2 py-1.5 text-right">Qty</th>
              <th className="w-20 border-r border-slate-900 px-2 py-1.5 text-right">Rate</th>
              <th className="w-28 px-2.5 py-1.5 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it, i) => (
              <tr key={i} className="border-b border-slate-300">
                <td className="border-r border-slate-900 px-2 py-1.5 text-center font-mono">{i + 1}</td>
                <td className="border-r border-slate-900 px-2.5 py-1.5 font-medium">{it.product_name}</td>
                <td className="border-r border-slate-900 px-2 py-1.5 text-right font-mono">{it.qty}</td>
                <td className="border-r border-slate-900 px-2 py-1.5 text-right font-mono">{fmtAmt(it.unit_price)}</td>
                <td className="px-2.5 py-1.5 text-right font-mono font-semibold">{fmtAmt(it.line_total)}</td>
              </tr>
            ))}
            {Array.from({ length: fillerCount }).map((_, idx) => (
              <tr key={`pad-${idx}`} className="border-b border-slate-300 h-6">
                <td className="border-r border-slate-900">&nbsp;</td>
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td className="border-r border-slate-900" />
                <td />
              </tr>
            ))}
          </tbody>
        </table>

        <div className="grid grid-cols-12 border-t border-slate-900 text-xs">
          <div className="col-span-7 border-r border-slate-900 p-3 space-y-2">
            <p className="text-[11px]"><strong>Rupees in Words:</strong> {amountInWordsIndian(data.grandTotal)}</p>
            {showBank && (
              <p className="text-[10.5px] text-slate-700">
                <strong>Bank:</strong> {[bank.bank_name, bank.account_number && `A/C ${bank.account_number}`, bank.ifsc_code && `IFSC ${bank.ifsc_code}`].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="col-span-5 divide-y divide-slate-300">
            {discountAmt > 0 && <div className="flex justify-between px-3 py-1.5"><span>Discount</span><span className="font-mono">-₹{fmtAmt(discountAmt)}</span></div>}
            <div className="flex justify-between px-3 py-2 text-sm font-extrabold text-white" style={{ backgroundColor: accent }}>
              <span>TOTAL</span>
              <span className="font-mono">₹{fmtAmt(data.grandTotal)}</span>
            </div>
            <div className="flex justify-between px-3 py-1 font-mono text-[11px] text-slate-600">
              <span>Paid: ₹{fmtAmt(data.paidAmount)}</span>
              <span>Due: ₹{fmtAmt(data.dueAmount)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-end justify-between border-t border-slate-900 px-4 py-2.5 text-[11px]">
          <span>{config.terms || config.footer_note || "Thanks for visiting!"}</span>
          <div className="text-right">
            <p className="font-bold">For {signatoryName}</p>
            <p className="mt-5 border-t border-slate-400 pt-0.5 text-[10px]">Signature</p>
          </div>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMAL LAYOUT 5: EXPRESS COUNTER CARD (normal_counter)
  // ═══════════════════════════════════════════════════════════════════════════
  if (style === "normal_counter") {
    const isPaid = data.dueAmount <= 0;
    return (
      <div className={`print-doc mx-auto overflow-hidden rounded-xl border border-slate-900 bg-white print:border-0 print:shadow-none ${widthClass}`}>
        <div className="flex items-center justify-between bg-slate-950 px-5 py-4 text-white">
          <div className="flex items-center gap-3">
            {config.show_logo && data.logoUrl && (
              <img src={data.logoUrl} alt={sellerName} className="h-10 w-10 rounded bg-white p-1 object-contain" />
            )}
            <div>
              <h2 className="text-base font-extrabold tracking-tight">{sellerName}</h2>
              {sellerAddress && <p className="text-[11px] text-slate-300">{sellerAddress}</p>}
              {sellerPhone && <p className="text-[11px] text-slate-300">Ph: {sellerPhone}</p>}
            </div>
          </div>
          <div className="text-right">
            <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase ${isPaid ? "bg-emerald-500 text-white" : "bg-amber-400 text-slate-950"}`}>
              {isPaid ? "PAID" : "BALANCE DUE"}
            </span>
            <p className="mt-1 font-mono text-xs font-bold">#{data.invoiceNumber}</p>
            <p className="text-[10.5px] text-slate-300">{data.dateStr}</p>
          </div>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-100 px-4 py-2.5">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">Customer</p>
              <p className="font-bold text-slate-900">{data.customerName}</p>
              {data.customerPhone && <p className="text-[11px] text-slate-600">{data.customerPhone}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase text-slate-500">Bill Amount</p>
              <p className="font-mono text-xl font-black text-slate-950">₹{fmtAmt(data.grandTotal)}</p>
            </div>
          </div>

          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b-2 border-slate-900 text-[10.5px] font-bold uppercase text-slate-700">
                <th className="py-1.5">Item</th>
                <th className="py-1.5 text-right">Qty</th>
                <th className="py-1.5 text-right">Rate</th>
                <th className="py-1.5 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {data.items.map((it, i) => (
                <tr key={i}>
                  <td className="py-2 font-semibold text-slate-900">{it.product_name}</td>
                  <td className="py-2 text-right font-mono">{it.qty}</td>
                  <td className="py-2 text-right font-mono">₹{fmtAmt(it.unit_price)}</td>
                  <td className="py-2 text-right font-mono font-bold">₹{fmtAmt(it.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-950 px-4 py-3 text-white">
            <div className="text-[11px]">
              <p className="text-slate-300">Paid: <strong className="font-mono text-white">₹{fmtAmt(data.paidAmount)}</strong> · Due: <strong className="font-mono text-white">₹{fmtAmt(data.dueAmount)}</strong></p>
              <p className="text-[10px] text-slate-400">{amountInWordsIndian(data.grandTotal)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase text-slate-400">Grand Total</p>
              <p className="font-mono text-lg font-black">₹{fmtAmt(data.grandTotal)}</p>
            </div>
          </div>

          {(showBank || (config.show_upi_qr && bank.upi_id)) && (
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] flex flex-wrap justify-between gap-2">
              {showBank && <span>Bank: <strong>{bank.bank_name}</strong> · A/C <strong className="font-mono">{bank.account_number}</strong> · IFSC <strong className="font-mono">{bank.ifsc_code}</strong></span>}
              {config.show_upi_qr && bank.upi_id && <span className="font-mono">UPI: <strong>{bank.upi_id}</strong></span>}
            </div>
          )}
          {config.footer_note && <p className="text-center text-xs font-semibold text-slate-700">{config.footer_note}</p>}
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NORMAL LAYOUT 1 (DEFAULT): CLEAN SHOP BILL (normal_clean)
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <div className={`print-doc mx-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xs print:border-0 print:shadow-none ${widthClass}`}>
      <div className="h-1.5 w-full" style={{ backgroundColor: accent }} />
      <div className={isA5 ? "p-4 space-y-3" : "p-6 space-y-4"}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3.5">
          <div className="flex items-start gap-3">
            {config.show_logo && data.logoUrl && (
              <img src={data.logoUrl} alt={sellerName} className="h-12 w-12 rounded object-contain" />
            )}
            <div className="space-y-0.5">
              <h2 className="text-lg font-bold tracking-tight" style={{ color: accent }}>{sellerName}</h2>
              {config.header_subtitle && <p className="text-xs text-slate-600">{config.header_subtitle}</p>}
              {sellerAddress && <p className="text-[11px] text-slate-500">{sellerAddress}</p>}
              {(sellerPhone || sellerEmail) && (
                <p className="text-[11px] text-slate-500">
                  {[sellerPhone && `Ph: ${sellerPhone}`, sellerEmail].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-slate-900">{docLabel}</p>
            <p className="font-mono text-xs font-semibold text-slate-700">#{data.invoiceNumber}</p>
            <p className="text-[11px] text-slate-500">{data.dateStr}</p>
          </div>
        </div>

        <div className="text-xs space-y-0.5">
          <p><span className="text-slate-500">Customer:</span> <strong className="text-slate-900">{data.customerName}</strong></p>
          {data.customerPhone && <p className="text-slate-600">Phone: {data.customerPhone}</p>}
          {data.customerAddress && <p className="text-slate-600">{data.customerAddress}</p>}
        </div>

        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-y border-slate-300 text-[10.5px] font-bold uppercase text-slate-600">
              <th className="py-2 pr-2 w-8">#</th>
              <th className="py-2 pr-2">Item</th>
              <th className="py-2 px-2 text-right">Qty</th>
              <th className="py-2 px-2 text-right">Rate</th>
              <th className="py-2 pl-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((it, i) => (
              <tr key={i}>
                <td className="py-2 pr-2 font-mono text-slate-400">{i + 1}</td>
                <td className="py-2 pr-2 font-medium text-slate-900">{it.product_name}</td>
                <td className="py-2 px-2 text-right font-mono">{it.qty}</td>
                <td className="py-2 px-2 text-right font-mono">₹{fmtAmt(it.unit_price)}</td>
                <td className="py-2 pl-2 text-right font-mono font-semibold">₹{fmtAmt(it.line_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="border-t border-slate-300 pt-2.5 space-y-1 text-xs">
          {discountAmt > 0 && (
            <div className="flex justify-between font-mono text-emerald-700">
              <span className="font-sans">Discount</span>
              <span>-₹{fmtAmt(discountAmt)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-bold text-slate-900">
            <span>Grand Total ({totalQty} items)</span>
            <span className="font-mono">₹{fmtAmt(data.grandTotal)}</span>
          </div>
          <div className="flex justify-between font-mono text-[11px] text-slate-600">
            <span>Paid: ₹{fmtAmt(data.paidAmount)}</span>
            <span>Due: ₹{fmtAmt(data.dueAmount)}</span>
          </div>
        </div>

        <p className="text-[11px] text-slate-600">
          <strong>In Words:</strong> {amountInWordsIndian(data.grandTotal)}
        </p>

        {(showBank || (config.show_upi_qr && bank.upi_id)) && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-[11px] text-slate-700 space-y-0.5">
            {showBank && (
              <p>
                <strong>Bank Details:</strong> {[bank.account_holder, bank.bank_name, bank.account_number && `A/C: ${bank.account_number}`, bank.ifsc_code && `IFSC: ${bank.ifsc_code}`].filter(Boolean).join(" · ")}
              </p>
            )}
            {config.show_upi_qr && bank.upi_id && (
              <p className="font-mono">UPI ID: <strong>{bank.upi_id}</strong></p>
            )}
          </div>
        )}

        {config.terms && <p className="text-[10.5px] text-slate-500">{config.terms}</p>}
        {config.footer_note && <p className="pt-1 text-center text-xs font-semibold text-slate-700">{config.footer_note}</p>}
      </div>
    </div>
  );
}
