"use client";

import React, { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export interface BarcodeLabelItem {
  sku: string;
  barcode: string;
  productName: string;
  modelCode: string;
  attributes: Record<string, string>;
  mrp: number;
  uom: string;
}

function SingleBarcodeSvg({ value }: { value: string }) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  useEffect(() => {
    if (svgRef.current && value) {
      try {
        JsBarcode(svgRef.current, value, {
          format: "CODE128",
          width: 1.4,
          height: 32,
          displayValue: true,
          fontSize: 10,
          margin: 2,
        });
      } catch {
        // ignore invalid characters
      }
    }
  }, [value]);
  return <svg ref={svgRef} className="max-w-full" />;
}

/** Printable Legal Metrology Shoe-Box / Product Sticker Sheet */
export function BarcodeLabelSheet({
  items,
  manufacturerInfo,
  customerCare,
  mfgMonthYear,
}: {
  items: BarcodeLabelItem[];
  manufacturerInfo: string;
  customerCare: string;
  mfgMonthYear: string;
}) {
  return (
    <div className="print-doc space-y-4">
      <div className="no-print flex justify-between items-center">
        <p className="text-xs text-slate-600">
          Legal Metrology Ready Labels ({items.length} labels) — MRP incl. of all taxes, Mfg Date &amp; Net Qty
        </p>
        <Button size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print Sticker Sheet
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 print:grid-cols-3">
        {items.map((it, idx) => (
          <div
            key={`${it.sku}-${idx}`}
            className="border border-slate-300 rounded-lg p-3 bg-white text-[10px] leading-tight space-y-1 break-inside-avoid"
          >
            <div className="flex justify-between font-bold text-xs text-slate-900">
              <span>{it.modelCode}</span>
              <span>MRP ₹{it.mrp.toLocaleString("en-IN")}</span>
            </div>
            <p className="font-semibold text-slate-800 truncate">{it.productName}</p>
            <p className="text-slate-600">
              {Object.entries(it.attributes)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" • ")}{" "}
              | Net Qty: 1 {it.uom}
            </p>
            <p className="text-[9px] text-slate-500">
              (Incl. of all taxes) • Mfg: {mfgMonthYear}
            </p>
            {manufacturerInfo && (
              <p className="text-[9px] text-slate-500 line-clamp-2">Mfd by: {manufacturerInfo}</p>
            )}
            {customerCare && (
              <p className="text-[9px] text-slate-500">Care: {customerCare}</p>
            )}
            <div className="pt-1 flex justify-center">
              <SingleBarcodeSvg value={it.barcode || it.sku} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
