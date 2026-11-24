"use client";

import React, { useState } from "react";
import { FileSpreadsheet, FileText, Loader2, Table2 } from "lucide-react";
import { toast } from "sonner";

const FORMATS = [
  { id: "xlsx", label: "Excel", note: "All data, one workbook", icon: FileSpreadsheet },
  { id: "csv", label: "CSV", note: "All data, zipped files", icon: Table2 },
  { id: "pdf", label: "PDF", note: "Readable summary", icon: FileText },
] as const;

/** Downloads through fetch so people see progress and errors, on desktop and phones. */
export function DataExportCard({ endpoint, title }: { endpoint: string; title: string }) {
  const [busy, setBusy] = useState<string | null>(null);

  const download = async (format: string) => {
    setBusy(format);
    try {
      const res = await fetch(`${endpoint}?format=${format}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed.");
      }
      const name = res.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `export.${format}`;
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
      toast.success("Export downloaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="ui-tray">
      <header className="px-3 py-2">
        <p className="ui-eyebrow">{title}</p>
      </header>
      <div className="ui-surface grid grid-cols-1 gap-2 p-2.5 sm:grid-cols-3">
        {FORMATS.map((f) => {
          const Icon = f.icon;
          return (
            <button
              key={f.id}
              type="button"
              disabled={busy !== null}
              onClick={() => void download(f.id)}
              aria-label={`Export all data as ${f.label}`}
              className="flex min-h-[52px] cursor-pointer items-center gap-2.5 rounded-lg bg-[#f7f7f8] px-3 py-2 text-left transition-colors hover:bg-[#171717] hover:text-white disabled:cursor-wait disabled:opacity-60 [&:hover_small]:text-white/70"
            >
              {busy === f.id ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Icon className="h-4 w-4 shrink-0" />}
              <span className="min-w-0 leading-tight">
                <span className="block text-[13px] font-medium">{busy === f.id ? "Preparing..." : f.label}</span>
                <small className="block truncate text-[11px] text-[#77777d]">{f.note}</small>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
