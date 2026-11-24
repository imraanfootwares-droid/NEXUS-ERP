"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Download, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { amountInWordsIndian } from "@/lib/gst/calculator";
import type { BillTemplateConfig } from "@/types/database";

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
  branchName: string;
  branchAddress?: string | null;
  branchGstin?: string | null;
  customerName: string;
  customerPhone?: string | null;
  customerGstin?: string | null;
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
    gst_rate: number;
    line_total: number;
  }>;
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
  const style = config.design_style ?? "classic";
  const accent = config.accent_color || "#171717";

  const hasGst =
    data.cgstAmount > 0 ||
    data.sgstAmount > 0 ||
    data.igstAmount > 0 ||
    data.items.some((it) => Number(it.gst_rate || 0) > 0);
  const showGstDetails = Boolean(config.show_gst_summary) && hasGst;

  const docLabel =
    data.invoiceType === "return_credit_note"
      ? "CREDIT NOTE"
      : data.invoiceType === "estimate_bill_of_supply"
      ? "ESTIMATE"
      : showGstDetails
      ? "TAX INVOICE"
      : "CASH MEMO / BILL";

  const widthClass =
    format === "thermal_58mm"
      ? "max-w-[248px] print-58mm text-[11px]"
      : format === "thermal_80mm"
      ? "max-w-[330px] print-80mm text-xs"
      : format === "a5"
      ? "max-w-[560px] text-xs"
      : "max-w-3xl text-sm";

  const outerClass =
    style === "bordered"
      ? "border-2 border-slate-900 rounded-md"
      : style === "minimal"
      ? "border border-slate-200/80 rounded-xl"
      : "border border-slate-200 rounded-xl shadow-xs";

  const headerIsBanner = style === "modern" || style === "bold";
  const bannerBg = style === "bold" ? "#171717" : accent;

  // Dedicated Full Indian GST Tax Invoice Layout (A4 / A5)
  if (style === "gst_full" && !isThermal) {
    const totalTax = data.cgstAmount + data.sgstAmount + data.igstAmount;
    return (
      <div
        className={`print-doc mx-auto overflow-hidden rounded-md border-2 border-slate-900 bg-white print:border-0 print:shadow-none ${widthClass}`}
      >
        {/* Top Tax Invoice Strip */}
        <div
          className="flex items-center justify-between border-b-2 border-slate-900 px-5 py-2 text-white"
          style={{ backgroundColor: accent }}
        >
          <span className="text-xs font-bold tracking-widest uppercase">{docLabel}</span>
          <span className="text-[10px] font-medium uppercase tracking-wider opacity-90">
            Original for Recipient
          </span>
        </div>

        {/* Seller + Invoice Meta */}
        <div className="grid grid-cols-12 border-b border-slate-900 text-xs">
          <div className="col-span-7 border-r border-slate-900 p-3.5">
            <div className="flex items-start gap-3">
              {config.show_logo && data.logoUrl && (
                <img
                  src={data.logoUrl}
                  alt={config.header_title}
                  className="h-11 w-11 shrink-0 rounded object-contain"
                />
              )}
              <div>
                <h2 className="font-display text-base font-bold text-slate-900">
                  {config.header_title}
                </h2>
                {config.header_subtitle && (
                  <p className="text-[11px] text-slate-600">{config.header_subtitle}</p>
                )}
                {data.branchAddress && (
                  <p className="mt-0.5 text-[11px] text-slate-600">{data.branchAddress}</p>
                )}
                {config.show_gst_summary && (
                  <p className="mt-1 font-mono text-[11px] font-bold text-slate-900">
                    GSTIN: {data.branchGstin || "Not Set (Add in Settings)"}
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="col-span-5 grid grid-cols-2 divide-y divide-slate-300 text-[11px]">
            <div className="border-r border-slate-300 p-2">
              <p className="text-[9.5px] uppercase text-slate-500">Invoice No.</p>
              <p className="font-mono font-bold text-slate-900">{data.invoiceNumber}</p>
            </div>
            <div className="p-2">
              <p className="text-[9.5px] uppercase text-slate-500">Date &amp; Time</p>
              <p className="font-medium text-slate-900">{data.dateStr}</p>
            </div>
            <div className="border-r border-slate-300 p-2">
              <p className="text-[9.5px] uppercase text-slate-500">Branch</p>
              <p className="font-medium text-slate-900">{data.branchName}</p>
            </div>
            <div className="p-2">
              <p className="text-[9.5px] uppercase text-slate-500">Built By</p>
              <p className="font-medium text-slate-900">{data.builtBy || "Counter"}</p>
            </div>
          </div>
        </div>

        {/* Buyer (Billed To) */}
        <div className="border-b border-slate-900 bg-slate-50/70 px-3.5 py-2.5 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Billed To</p>
          <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-bold text-slate-900">{data.customerName}</p>
              {data.customerPhone && <p className="text-[11px] text-slate-600">Phone: {data.customerPhone}</p>}
            </div>
            {config.show_gst_summary && data.customerGstin && (
              <p className="font-mono text-[11px] font-semibold text-slate-900">
                Buyer GSTIN: {data.customerGstin}
              </p>
            )}
          </div>
        </div>

        {/* Full GST Item Table */}
        <table className="w-full border-collapse text-left text-[11.5px]">
          <thead>
            <tr className="border-b border-slate-900 bg-slate-100 text-[10px] font-bold uppercase text-slate-700">
              <th className="w-8 border-r border-slate-300 px-2 py-2 text-center">#</th>
              <th className="border-r border-slate-300 px-2.5 py-2">Description of Goods</th>
              {config.show_hsn && <th className="border-r border-slate-300 px-2 py-2 text-center">HSN/SAC</th>}
              <th className="border-r border-slate-300 px-2 py-2 text-right">Qty</th>
              <th className="border-r border-slate-300 px-2 py-2 text-right">Rate</th>
              {showGstDetails && <th className="border-r border-slate-300 px-2 py-2 text-right">Taxable</th>}
              {showGstDetails && <th className="border-r border-slate-300 px-2 py-2 text-right">GST %</th>}
              {showGstDetails && <th className="border-r border-slate-300 px-2 py-2 text-right">Tax</th>}
              <th className="px-2.5 py-2 text-right">Total (₹)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {data.items.map((it, i) => {
              const rateNum = Number(it.gst_rate || 0);
              const lineTotal = Number(it.line_total || 0);
              const lineTaxable = rateNum > 0 ? lineTotal / (1 + rateNum / 100) : lineTotal;
              const lineTax = lineTotal - lineTaxable;
              return (
                <tr key={i}>
                  <td className="border-r border-slate-200 px-2 py-2 text-center font-mono text-slate-500">
                    {i + 1}
                  </td>
                  <td className="border-r border-slate-200 px-2.5 py-2">
                    <div className="font-semibold text-slate-900">{it.product_name}</div>
                    {it.sku && <div className="font-mono text-[10px] text-slate-400">{it.sku}</div>}
                  </td>
                  {config.show_hsn && (
                    <td className="border-r border-slate-200 px-2 py-2 text-center font-mono">
                      {it.hsn_code || "—"}
                    </td>
                  )}
                  <td className="border-r border-slate-200 px-2 py-2 text-right font-mono">{it.qty}</td>
                  <td className="border-r border-slate-200 px-2 py-2 text-right font-mono">
                    ₹{Number(it.unit_price).toFixed(2)}
                  </td>
                  {showGstDetails && (
                    <td className="border-r border-slate-200 px-2 py-2 text-right font-mono text-slate-700">
                      ₹{lineTaxable.toFixed(2)}
                    </td>
                  )}
                  {showGstDetails && (
                    <td className="border-r border-slate-200 px-2 py-2 text-right font-mono">
                      {rateNum > 0 ? `${rateNum}%` : "0%"}
                    </td>
                  )}
                  {showGstDetails && (
                    <td className="border-r border-slate-200 px-2 py-2 text-right font-mono text-slate-700">
                      ₹{lineTax.toFixed(2)}
                    </td>
                  )}
                  <td className="px-2.5 py-2 text-right font-mono font-bold text-slate-900">
                    ₹{lineTotal.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Tax Summary + Totals */}
        <div className="grid grid-cols-12 border-t-2 border-slate-900 text-xs">
          <div className="col-span-7 flex flex-col justify-between border-r border-slate-900 p-3.5">
            <div>
              <p className="text-[10px] font-bold uppercase text-slate-500">Amount Chargeable (In Words)</p>
              <p className="mt-0.5 font-semibold text-slate-900">{amountInWordsIndian(data.grandTotal)}</p>
              {config.show_upi_qr && (
                <p className="mt-2 font-mono text-[10.5px] text-slate-700">
                  UPI / Bank: <strong>{config.upi_id || "UPI Accepted at Counter"}</strong>
                </p>
              )}
              {config.terms && (
                <div className="mt-2.5 border-t border-slate-200 pt-2 text-[10px] text-slate-600">
                  <strong>Declaration / Terms:</strong> {config.terms}
                </div>
              )}
            </div>
          </div>
          <div className="col-span-5 divide-y divide-slate-200 text-xs">
            {showGstDetails && (
              <>
                <div className="flex justify-between px-3 py-1.5 font-mono">
                  <span className="font-sans text-slate-600">Taxable Value</span>
                  <span>₹{data.taxableAmount.toFixed(2)}</span>
                </div>
                {data.cgstAmount > 0 && (
                  <div className="flex justify-between px-3 py-1.5 font-mono">
                    <span className="font-sans text-slate-600">CGST</span>
                    <span>₹{data.cgstAmount.toFixed(2)}</span>
                  </div>
                )}
                {data.sgstAmount > 0 && (
                  <div className="flex justify-between px-3 py-1.5 font-mono">
                    <span className="font-sans text-slate-600">SGST</span>
                    <span>₹{data.sgstAmount.toFixed(2)}</span>
                  </div>
                )}
                {data.igstAmount > 0 && (
                  <div className="flex justify-between px-3 py-1.5 font-mono">
                    <span className="font-sans text-slate-600">IGST</span>
                    <span>₹{data.igstAmount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between px-3 py-1.5 font-mono text-[11px] text-slate-600">
                  <span className="font-sans">Total GST</span>
                  <span>₹{totalTax.toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between bg-slate-900 px-3 py-2 font-bold text-white">
              <span>Grand Total</span>
              <span className="font-mono">
                ₹{data.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between px-3 py-1.5 font-mono text-[11px] text-slate-600">
              <span>Paid: ₹{data.paidAmount.toFixed(2)}</span>
              <span>Due: ₹{data.dueAmount.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Signatory Footer */}
        <div className="flex items-end justify-between border-t border-slate-900 px-4 py-3 text-[10.5px] text-slate-600">
          <span>{config.footer_note || "Subject to local jurisdiction."}</span>
          <div className="text-right">
            <p className="font-bold text-slate-900">For {config.header_title}</p>
            <p className="mt-6 border-t border-slate-400 pt-1">Authorized Signatory</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`print-doc mx-auto overflow-hidden bg-white print:border-0 print:shadow-none ${outerClass} ${widthClass}`}
    >
      {/* Header */}
      <div
        className={`${
          headerIsBanner
            ? `${isThermal ? "px-3.5 py-3 text-center" : isA5 ? "px-4 py-3.5 flex justify-between items-start" : "px-6 py-4 flex justify-between items-start"} text-white`
            : `${isThermal ? "mx-3.5 pt-3.5 pb-3 text-center" : isA5 ? "mx-4 pt-4 pb-3 flex justify-between items-start" : "mx-6 pt-5 pb-3.5 flex justify-between items-start"} ${
                style === "minimal" ? "border-b border-slate-200" : "border-b-2"
              }`
        }`}
        style={
          headerIsBanner
            ? { backgroundColor: bannerBg }
            : style === "minimal"
            ? undefined
            : { borderColor: accent }
        }
      >
        <div className={isThermal ? "flex flex-col items-center gap-1.5" : "flex items-center gap-3"}>
          {config.show_logo && data.logoUrl && (
            <img
              src={data.logoUrl}
              alt={config.header_title}
              className={`${
                isThermal ? "h-10 w-auto max-w-[120px]" : isA5 ? "h-10 w-10" : "h-12 w-12"
              } rounded object-contain ${headerIsBanner ? "bg-white p-1" : ""}`}
            />
          )}
          <div>
            <h2
              className={`font-display font-bold tracking-tight ${
                is58 ? "text-sm" : isA5 || isThermal ? "text-base" : "text-lg"
              }`}
              style={headerIsBanner ? { color: "#ffffff" } : { color: style === "minimal" ? "#171717" : accent }}
            >
              {config.header_title}
            </h2>
            {config.header_subtitle && (
              <p className={`text-[11px] ${headerIsBanner ? "text-white/80" : "text-slate-600"}`}>
                {config.header_subtitle}
              </p>
            )}
            {data.branchAddress && (
              <p className={`text-[10.5px] ${headerIsBanner ? "text-white/75" : "text-slate-500"}`}>
                {data.branchAddress}
              </p>
            )}
            {config.show_gst_summary && data.branchGstin && (
              <p className={`text-[10.5px] font-medium ${headerIsBanner ? "text-white/90" : "text-slate-700"}`}>
                GSTIN: {data.branchGstin}
              </p>
            )}
          </div>
        </div>

        <div className={isThermal ? "mt-2" : "text-right"}>
          <p className={`font-bold tracking-wide ${headerIsBanner ? "text-white" : "text-slate-900"}`}>
            {docLabel}
          </p>
          <p className={`text-[11px] font-mono ${headerIsBanner ? "text-white/90" : "text-slate-700"}`}>
            {data.invoiceNumber}
          </p>
          <p className={`text-[10.5px] ${headerIsBanner ? "text-white/75" : "text-slate-500"}`}>
            {data.dateStr}
          </p>
          {data.builtBy && (
            <p className={`text-[10px] ${headerIsBanner ? "text-white/70" : "text-slate-500"}`}>
              By: {data.builtBy}
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className={isThermal ? "p-3.5" : isA5 ? "p-4" : "p-6 pt-4"}>
        {/* Customer Info */}
        <div
          className={`mb-3 text-xs ${
            style === "modern"
              ? "rounded-lg bg-slate-50 border border-slate-200/70 px-3 py-2"
              : style === "bordered"
              ? "border border-slate-300 px-3 py-2"
              : ""
          }`}
        >
          <p>
            <span className="text-slate-500">Customer:</span>{" "}
            <strong className="text-slate-900">{data.customerName}</strong>
          </p>
          {data.customerPhone && <p className="text-slate-600">Ph: {data.customerPhone}</p>}
          {config.show_gst_summary && data.customerGstin && (
            <p className="text-slate-600">GSTIN: {data.customerGstin}</p>
          )}
        </div>

        {/* Items Table — Stacked lines on 58mm, clean tabular grid on 80mm / A5 / A4 */}
        {is58 ? (
          <div className="mb-3 border-y border-dashed border-slate-400 py-2 space-y-2">
            {data.items.map((it, i) => (
              <div key={i} className="space-y-0.5">
                <div className="font-medium text-slate-900 leading-snug">{it.product_name}</div>
                <div className="flex items-center justify-between font-mono text-[10.5px] text-slate-700">
                  <span>
                    {it.qty} × ₹{Number(it.unit_price).toFixed(2)}
                  </span>
                  <span className="font-semibold text-slate-900">
                    ₹{Number(it.line_total).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <table
            className={`w-full text-left border-collapse mb-3 ${
              style === "bordered" ? "border border-slate-300" : ""
            }`}
          >
            <thead>
              <tr
                className={`text-[10.5px] uppercase text-slate-600 ${
                  isThermal
                    ? "border-y border-dashed border-slate-400"
                    : style === "modern"
                    ? "bg-slate-100/90 border-y border-slate-200"
                    : style === "bordered"
                    ? "bg-slate-100 border-b border-slate-300"
                    : "border-y border-slate-300"
                }`}
              >
                <th className={`py-1.5 ${style === "bordered" ? "px-2 border-r border-slate-300" : "pr-2"}`}>Item</th>
                {!isThermal && config.show_hsn && (
                  <th className={`py-1.5 ${style === "bordered" ? "px-2 border-r border-slate-300" : "px-1.5"}`}>HSN</th>
                )}
                <th className={`py-1.5 text-right ${style === "bordered" ? "px-2 border-r border-slate-300" : "px-1.5"}`}>Qty</th>
                <th className={`py-1.5 text-right ${style === "bordered" ? "px-2 border-r border-slate-300" : "px-1.5"}`}>Rate</th>
                {!isThermal && showGstDetails && (
                  <th className={`py-1.5 text-right ${style === "bordered" ? "px-2 border-r border-slate-300" : "px-1.5"}`}>GST</th>
                )}
                <th className={`py-1.5 text-right ${style === "bordered" ? "px-2" : "pl-1.5"}`}>Amt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.items.map((it, i) => (
                <tr key={i} className={style === "modern" && i % 2 === 1 ? "bg-slate-50/70" : ""}>
                  <td className={`py-1.5 ${style === "bordered" ? "px-2 border-r border-slate-200" : "pr-2"}`}>
                    <div className="font-medium text-slate-900">{it.product_name}</div>
                    {it.sku && <div className="text-[10px] text-slate-400">{it.sku}</div>}
                  </td>
                  {!isThermal && config.show_hsn && (
                    <td className={`py-1.5 text-xs ${style === "bordered" ? "px-2 border-r border-slate-200" : "px-1.5"}`}>
                      {it.hsn_code || "—"}
                    </td>
                  )}
                  <td className={`py-1.5 text-right font-mono whitespace-nowrap ${style === "bordered" ? "px-2 border-r border-slate-200" : "px-1.5"}`}>
                    {it.qty}
                  </td>
                  <td className={`py-1.5 text-right font-mono whitespace-nowrap ${style === "bordered" ? "px-2 border-r border-slate-200" : "px-1.5"}`}>
                    ₹{Number(it.unit_price).toFixed(2)}
                  </td>
                  {!isThermal && showGstDetails && (
                    <td className={`py-1.5 text-right font-mono text-xs text-slate-600 whitespace-nowrap ${style === "bordered" ? "px-2 border-r border-slate-200" : "px-1.5"}`}>
                      {Number(it.gst_rate || 0) > 0 ? `${it.gst_rate}%` : "—"}
                    </td>
                  )}
                  <td className={`py-1.5 text-right font-mono font-medium whitespace-nowrap ${style === "bordered" ? "px-2" : "pl-1.5"}`}>
                    ₹{Number(it.line_total).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Totals */}
        <div
          className={`space-y-1 text-xs ${
            isThermal
              ? "border-t border-dashed border-slate-400 pt-2"
              : style === "modern"
              ? "ml-auto max-w-[260px] rounded-lg bg-slate-50 border border-slate-200/80 p-3"
              : "border-t border-slate-300 pt-2"
          }`}
        >
          {showGstDetails && (
            <>
              <div className="flex justify-between font-mono">
                <span className="font-sans text-slate-600">Taxable Value</span>
                <span>₹{data.taxableAmount.toFixed(2)}</span>
              </div>
              {data.cgstAmount > 0 && (
                <div className="flex justify-between font-mono">
                  <span className="font-sans text-slate-600">CGST</span>
                  <span>₹{data.cgstAmount.toFixed(2)}</span>
                </div>
              )}
              {data.sgstAmount > 0 && (
                <div className="flex justify-between font-mono">
                  <span className="font-sans text-slate-600">SGST</span>
                  <span>₹{data.sgstAmount.toFixed(2)}</span>
                </div>
              )}
              {data.igstAmount > 0 && (
                <div className="flex justify-between font-mono">
                  <span className="font-sans text-slate-600">IGST</span>
                  <span>₹{data.igstAmount.toFixed(2)}</span>
                </div>
              )}
            </>
          )}
          <div
            className={`flex justify-between font-bold border-t pt-1.5 mt-1.5 ${
              style === "bold" ? "text-base text-[#171717] border-slate-900" : "text-sm border-slate-900"
            }`}
          >
            <span>Grand Total</span>
            <span className="font-mono">
              ₹{data.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="flex justify-between text-[11px] text-slate-600 font-mono">
            <span>Paid: ₹{data.paidAmount.toFixed(2)}</span>
            <span>Due: ₹{data.dueAmount.toFixed(2)}</span>
          </div>
        </div>

        {!isThermal && (
          <p className="mt-3 text-[11px] text-slate-600">
            <strong>In Words:</strong> {amountInWordsIndian(data.grandTotal)}
          </p>
        )}

        {config.show_upi_qr && (
          <div className="mt-3 flex items-center justify-between rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-3 py-2 text-[10.5px] text-slate-600">
            <span>Pay via UPI / Scan QR at Counter</span>
            <span className="font-mono font-semibold text-slate-800">{config.upi_id || "UPI Accepted"}</span>
          </div>
        )}

        {style === "bordered" && !isThermal && (
          <div className="mt-5 flex items-end justify-between border-t border-slate-300 pt-4 text-[10.5px] text-slate-600">
            <div>
              {config.terms && <p className="max-w-xs">{config.terms}</p>}
            </div>
            <div className="text-right">
              <p className="font-semibold text-slate-900">For {config.header_title}</p>
              <p className="mt-6 border-t border-slate-400 pt-1">Authorized Signatory</p>
            </div>
          </div>
        )}

        {style !== "bordered" && config.terms && (
          <p className="mt-2.5 text-[10px] text-slate-500">{config.terms}</p>
        )}
        {config.footer_note && (
          <p className="mt-2 text-center text-xs font-semibold text-slate-700">{config.footer_note}</p>
        )}
      </div>
    </div>
  );
}
