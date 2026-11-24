"use client";

import React, { useMemo, useState } from "react";
import { ChevronsUpDown, Search } from "lucide-react";
import { Pager } from "./pagination";
import { Input } from "./primitives";

export interface ColumnDef<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  sortValue?: (row: T) => string | number;
  mobilePrimary?: boolean;
  hideOnMobile?: boolean;
  className?: string;
}

export function DataTable<T>({
  data,
  columns,
  rowKey,
  searchPlaceholder = "Search...",
  searchFilter,
  pageSize = 20,
  emptyMessage = "No records found.",
  actions,
}: {
  data: T[];
  columns: ColumnDef<T>[];
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  searchFilter?: (row: T, query: string) => boolean;
  pageSize?: number;
  emptyMessage?: string;
  actions?: React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = data;
    if (q && searchFilter) {
      list = data.filter((r) => searchFilter(r, q));
    }
    if (sortCol) {
      const col = columns.find((c) => c.key === sortCol);
      if (col?.sortValue) {
        const getter = col.sortValue;
        list = [...list].sort((a, b) => {
          const av = getter(a);
          const bv = getter(b);
          if (av < bv) return sortAsc ? -1 : 1;
          if (av > bv) return sortAsc ? 1 : -1;
          return 0;
        });
      }
    }
    return list;
  }, [data, query, searchFilter, sortCol, sortAsc, columns]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key: string) => {
    if (sortCol === key) setSortAsc(!sortAsc);
    else {
      setSortCol(key);
      setSortAsc(true);
    }
  };

  return (
    <div className="ui-tray">
      {(searchFilter || actions) && (
        <div className="flex flex-col sm:flex-row gap-2 p-1.5 sm:items-center sm:justify-between">
          {searchFilter ? (
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 z-10 -translate-y-1/2 h-3.5 w-3.5 text-[#a3a3a8]" />
              <Input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="!pl-8"
              />
            </div>
          ) : (
            <div />
          )}
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </div>
      )}

      {/* Desktop Table */}
      <div className="ui-surface hidden md:block overflow-x-auto">
        <table className="w-full text-left">
          <thead className="border-b border-[#ececee]">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={`px-4 py-2.5 ${col.className ?? ""}`}>
                  {col.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(col.key)}
                      className="inline-flex items-center gap-1 uppercase hover:text-[#171717] cursor-pointer"
                    >
                      {col.header}
                      <ChevronsUpDown className={`h-3 w-3 ${sortCol === col.key ? "text-[#171717]" : "opacity-50"}`} />
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f1f2]">
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-[#77777d]">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              paginated.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((col) => (
                    <td key={col.key} className={`px-4 py-2.5 text-[#27272a] ${col.className ?? ""}`}>
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Cards */}
      <div className="block md:hidden space-y-[3px]">
        {paginated.length === 0 ? (
          <div className="ui-surface p-6 text-center text-[13px] text-[#77777d]">
            {emptyMessage}
          </div>
        ) : (
          paginated.map((row) => {
            const primary = columns.find((c) => c.mobilePrimary) ?? columns[0];
            const rest = columns.filter((c) => c.key !== primary.key && !c.hideOnMobile);
            return (
              <div key={rowKey(row)} className="ui-surface p-3.5 space-y-2">
                <div className="font-medium text-slate-900">{primary.render(row)}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  {rest.map((col) => (
                    <div key={col.key}>
                      <span className="text-slate-400 block">{col.header}</span>
                      <div className="text-slate-700 font-medium">{col.render(row)}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>

      <Pager page={safePage} pageSize={pageSize} total={filtered.length} onChange={setPage} />
    </div>
  );
}
