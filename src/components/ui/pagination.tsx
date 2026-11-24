"use client";

import React, { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

function pageNumbers(current: number, total: number): Array<number | "gap"> {
  if (total <= 5) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: Array<number | "gap"> = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

export function Pager({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const base =
    "flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-lg px-1.5 font-mono text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35";

  return (
    <nav aria-label="Pagination" className="ui-pager flex flex-wrap items-center justify-between gap-2 px-2.5 py-2 text-[11px] text-[#77777d]">
      <span aria-live="polite">
        <b className="font-mono font-medium text-[#27272a]">{from}–{to}</b> of {total}
      </span>
      <span className="flex items-center gap-0.5">
        <button type="button" aria-label="Previous page" disabled={page <= 1} onClick={() => onChange(page - 1)} className={`${base} text-[#3f3f46] hover:bg-[#f1f1f2]`}>
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pageNumbers(page, totalPages).map((p, i) =>
          p === "gap" ? (
            <span key={`gap-${i}`} className="px-0.5 text-[#a3a3a8]" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              onClick={() => onChange(p)}
              className={`${base} ${p === page ? "bg-[#171717] text-white" : "text-[#55555b] hover:bg-[#f1f1f2]"}`}
            >
              {p}
            </button>
          )
        )}
        <button type="button" aria-label="Next page" disabled={page >= totalPages} onClick={() => onChange(page + 1)} className={`${base} text-[#3f3f46] hover:bg-[#f1f1f2]`}>
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </span>
    </nav>
  );
}

/**
 * Shows one page of `items` with controls underneath. Set `asRow` inside a <tbody>
 * so the controls stay valid table markup. The page is clamped when the list shrinks.
 */
export function Paged<T>({
  items,
  size = 10,
  asRow = false,
  children,
}: {
  items: readonly T[];
  size?: number;
  asRow?: boolean;
  children: (rows: T[]) => React.ReactNode;
}) {
  const [requested, setRequested] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / size));
  const page = Math.min(requested, totalPages);
  const rows = items.slice((page - 1) * size, page * size);
  const pager = <Pager page={page} pageSize={size} total={items.length} onChange={setRequested} />;

  return (
    <>
      {children(rows)}
      {totalPages > 1 ? (
        asRow ? (
          <tr>
            <td colSpan={99} className="!p-0">
              <div className="sticky left-0 w-[min(100%,calc(100vw-48px))]">{pager}</div>
            </td>
          </tr>
        ) : (
          <div className="col-span-full">{pager}</div>
        )
      ) : null}
    </>
  );
}
