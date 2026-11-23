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
  format: "a4" | "thermal_80mm" | "thermal_58mm";
  config: BillTemplateConfig;
  data: InvoicePreviewData;
}) {
  const isThermal = format !== "a4";
  const widthClass =
    format === "thermal_58mm"
      ? "max-w-[240px] print-58mm text-[11px]"
      : format === "thermal_80mm"
      ? "max-w-[320px] print-80mm text-xs"
      : "max-w-3xl text-sm";

  return (
    <div className={`mx-auto bg-white border border-slate-200 rounded-xl p-4 sm:p-6 shadow-xs print:border-0 print:shadow-none ${widthClass}`}>
      <div
        className={`border-b pb-3 mb-3 ${isThermal ? "text-center" : "flex justify-between items-start"}`}
        style={{ borderColor: config.accent_color || "#0f172a" }}
      >
        <div>
          <h2 className="font-display font-bold text-lg text-slate-900" style={{ color: config.accent_color }}>
            {config.header_title}
          </h2>
          {config.header_subtitle && <p className="text-xs text-slate-600">{config.header_subtitle}</p>}
          {data.branchAddress && <p className="text-[11px] text-slate-500">{data.branchAddress}</p>}
          {data.branchGstin && <p className="text-[11px] font-medium text-slate-700">GSTIN: {data.branchGstin}</p>}
        </div>
        <div className={isThermal ? "mt-2" : "text-right"}>
          <p className="font-bold text-slate-900">
            {data.invoiceType === "return_credit_note"
              ? "CREDIT NOTE"
              : data.invoiceType === "estimate_bill_of_supply"
              ? "ESTIMATE"
              : "TAX INVOICE"}
          </p>
          <p className="text-xs font-mono text-slate-700">{data.invoiceNumber}</p>
          <p className="text-[11px] text-slate-500">{data.dateStr}</p>
        </div>
      </div>

      <div className="mb-3 text-xs">
        <p><span className="text-slate-500">Customer:</span> <strong>{data.customerName}</strong></p>
        {data.customerPhone && <p className="text-slate-600">Ph: {data.customerPhone}</p>}
        {data.customerGstin && <p className="text-slate-600">GSTIN: {data.customerGstin}</p>}
      </div>

      <table className="w-full text-left border-collapse mb-3">
        <thead>
          <tr className="border-y border-slate-300 text-[11px] uppercase text-slate-600">
            <th className="py-1.5">Item</th>
            {!isThermal && config.show_hsn && <th className="py-1.5">HSN</th>}
            <th className="py-1.5 text-right">Qty</th>
            <th className="py-1.5 text-right">Rate</th>
            <th className="py-1.5 text-right">Amt</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {data.items.map((it, i) => (
            <tr key={i}>
              <td className="py-1.5 pr-2">
                <div className="font-medium text-slate-900">{it.product_name}</div>
                {it.sku && <div className="text-[10px] text-slate-400">{it.sku}</div>}
              </td>
              {!isThermal && config.show_hsn && <td className="py-1.5 text-xs">{it.hsn_code || "—"}</td>}
              <td className="py-1.5 text-right">{it.qty}</td>
              <td className="py-1.5 text-right">₹{Number(it.unit_price).toFixed(2)}</td>
              <td className="py-1.5 text-right font-medium">₹{Number(it.line_total).toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-t border-slate-300 pt-2 space-y-1 text-xs">
        {config.show_gst_summary && (
          <>
            <div className="flex justify-between"><span>Taxable Value</span><span>₹{data.taxableAmount.toFixed(2)}</span></div>
            {data.cgstAmount > 0 && <div className="flex justify-between"><span>CGST</span><span>₹{data.cgstAmount.toFixed(2)}</span></div>}
            {data.sgstAmount > 0 && <div className="flex justify-between"><span>SGST</span><span>₹{data.sgstAmount.toFixed(2)}</span></div>}
            {data.igstAmount > 0 && <div className="flex justify-between"><span>IGST</span><span>₹{data.igstAmount.toFixed(2)}</span></div>}
          </>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-slate-900 pt-1.5 mt-1.5">
          <span>Grand Total</span>
          <span>₹{data.grandTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}</span>
        </div>
        <div className="flex justify-between text-[11px] text-slate-600">
          <span>Paid: ₹{data.paidAmount.toFixed(2)}</span>
          <span>Due: ₹{data.dueAmount.toFixed(2)}</span>
        </div>
      </div>

      {!isThermal && (
        <p className="mt-3 text-[11px] text-slate-600">
          <strong>In Words:</strong> {amountInWordsIndian(data.grandTotal)}
        </p>
      )}
      {config.terms && <p className="mt-2 text-[10px] text-slate-500">{config.terms}</p>}
      {config.footer_note && <p className="mt-2 text-center text-xs font-semibold text-slate-700">{config.footer_note}</p>}
    </div>
  );
}
