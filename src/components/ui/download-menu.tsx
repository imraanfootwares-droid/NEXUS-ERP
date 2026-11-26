"use client";

import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

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
  const [downloading, setDownloading] = useState<"pdf" | "xlsx" | "csv" | null>(null);
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

  const handleDownload = async (format: "pdf" | "xlsx" | "csv") => {
    setOpen(false);
    setDownloading(format);
    const labelName = format === "pdf" ? "PDF" : format === "xlsx" ? "Excel" : "CSV";
    try {
      const sep = baseUrl.includes("?") ? "&" : "?";
      const res = await fetch(`${baseUrl}${sep}format=${format}`);
      if (!res.ok) {
        let msg = `Could not download ${labelName} (Error ${res.status}).`;
        try {
          const data = (await res.json()) as { error?: string };
          if (data?.error) msg = data.error;
        } catch {
          // non-JSON error body
        }
        toast.error(msg);
        return;
      }

      const blob = await res.blob();
      const disp = res.headers.get("Content-Disposition") ?? "";
      const match = disp.match(/filename="?([^";\n]+)"?/i);
      const filename = match?.[1] || `export.${format}`;
      const blobUrl = URL.createObjectURL(blob);

      if (format === "pdf") {
        const win = window.open(blobUrl, "_blank", "noopener,noreferrer");
        if (!win) {
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      } else {
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 30_000);
      toast.success(`${labelName} ready!`);
    } catch {
      toast.error(`Download failed. Check your internet connection and try again.`);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={downloading !== null}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex min-h-[38px] cursor-pointer items-center gap-1.5 rounded-lg border border-[#d4d4d8] bg-white px-3 text-xs font-semibold text-[#171717] hover:bg-[#fafafa] transition-colors disabled:opacity-60"
      >
        {downloading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Download className="h-3.5 w-3.5" />
        )}
        <span>{downloading ? `Preparing ${downloading.toUpperCase()}...` : label}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-[#77777d] transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          className={`absolute z-30 mt-1.5 w-56 rounded-xl border border-[#e5e5e7] bg-white p-1.5 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          }`}
        >
          <button
            type="button"
            onClick={() => handleDownload("pdf")}
            className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#f4f4f6] transition-colors"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#171717] text-white">
              <FileText className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#171717]">PDF Document</p>
              <p className="text-[10.5px] text-[#77777d]">Best for printing &amp; WhatsApp</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleDownload("xlsx")}
            className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#f4f4f6] transition-colors"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-800">
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#171717]">Excel Sheet (.xlsx)</p>
              <p className="text-[10.5px] text-[#77777d]">Best for accountant / CA</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => handleDownload("csv")}
            className="flex w-full cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-[#f4f4f6] transition-colors"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#f1f1f3] text-[#171717]">
              <Download className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="text-xs font-semibold text-[#171717]">CSV File</p>
              <p className="text-[10.5px] text-[#77777d]">Simple spreadsheet data</p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
