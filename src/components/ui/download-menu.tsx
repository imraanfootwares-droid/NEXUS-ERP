"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText } from "lucide-react";

export function DownloadMenu({
  baseUrl,
  label = "Download",
  align = "right",
}: {
  baseUrl: string;
  label?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-[#d4d4d8] bg-white px-3 text-xs font-semibold text-[#171717] hover:bg-[#fafafa] transition-colors"
      >
        <Download className="h-3.5 w-3.5" />
        <span>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-[#77777d] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className={`absolute z-30 mt-1.5 w-56 rounded-xl border border-[#e5e5e7] bg-white p-1.5 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <a
            href={`${baseUrl}?format=pdf`}
            target="_blank"
            rel="noreferrer"
            onClick={() => setOpen(false)}
            className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#f4f4f6] transition-colors"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#171717] text-white">
              <FileText className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#171717]">PDF Document</p>
              <p className="text-[10.5px] text-[#77777d]">Best for printing &amp; WhatsApp</p>
            </div>
          </a>
          <a
            href={`${baseUrl}?format=xlsx`}
            onClick={() => setOpen(false)}
            className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#f4f4f6] transition-colors"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#171717]">Excel Sheet (.xlsx)</p>
              <p className="text-[10.5px] text-[#77777d]">Best for accountant / CA</p>
            </div>
          </a>
          <a
            href={`${baseUrl}?format=csv`}
            onClick={() => setOpen(false)}
            className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#f4f4f6] transition-colors"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f1f1f3] text-[#171717]">
              <Download className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#171717]">CSV File</p>
              <p className="text-[10.5px] text-[#77777d]">Simple spreadsheet data</p>
            </div>
          </a>
        </div>
      )}
    </div>
  );
}
