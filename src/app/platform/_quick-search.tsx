"use client";

import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Building2, Inbox, KeyRound, ShieldBan, LayoutDashboard, Network, Search, Server } from "lucide-react";

const SEARCH_ITEMS = [
  { label: "Overview", desc: "Control plane & telemetry", href: "/platform", icon: LayoutDashboard },
  { label: "Organisation Map", desc: "Visual editor for branches & people", href: "/platform/organisation", icon: Network },
  { label: "Tenants", desc: "Manage businesses, tiers & quotas", href: "/platform/tenants", icon: Building2 },
  { label: "Access Control", desc: "Block or unblock unpaid businesses and people", href: "/platform/access", icon: ShieldBan },
  { label: "Enquiries", desc: "Demo and pricing requests from the website", href: "/platform/enquiries", icon: Inbox },
  { label: "Roles, Tiers & HSN", desc: "Promote or demote people, roles & GST codes", href: "/platform/permissions", icon: KeyRound },
  { label: "Infrastructure & VPS", desc: "Database, S3 & deployment health", href: "/platform/infrastructure", icon: Server },
];

export function PlatformQuickSearch() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 20);
    } else {
      setQuery("");
    }
  }, [open]);

  const filtered = SEARCH_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(query.toLowerCase()) ||
      item.desc.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open quick search"
        className="w-full flex h-8 items-center gap-2 rounded-lg bg-[#f4f4f5] hover:bg-[#ebebee] px-2.5 text-xs text-[#8a8a90] transition-colors cursor-pointer"
      >
        <Search className="h-3.5 w-3.5 text-[#8a8a8a]" />
        <span className="min-w-0 flex-1 truncate text-left">Search...</span>
        <kbd className="hidden rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#737373] shadow-[0_1px_1px_rgba(0,0,0,0.05)] sm:inline">
          Ctrl K
        </kbd>
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="spark-ui fixed inset-0 flex items-start justify-center bg-black/25 backdrop-blur-[2px] pt-20 p-4"
            style={{ zIndex: 9999 }}
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Quick search"
              className="ui-rise w-full max-w-md rounded-[14px] bg-white shadow-[0_24px_60px_rgba(0,0,0,.2),0_0_0_1px_rgba(0,0,0,.06)] overflow-hidden"
            >
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && filtered[0]) {
                      router.push(filtered[0].href);
                      setOpen(false);
                    }
                  }}
                  placeholder="Jump to a section (Overview, Organisation, Tenants…)"
                  className="flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 cursor-pointer"
                >
                  ESC
                </button>
              </div>
              <div className="p-2 max-h-72 overflow-y-auto space-y-1">
                {filtered.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">No matching sections.</p>
                ) : (
                  filtered.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.href}
                        type="button"
                        onClick={() => {
                          router.push(item.href);
                          setOpen(false);
                        }}
                        className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f1f1f2] text-[#171717]">
                          <Icon className="h-4 w-4" />
                        </span>
                        <div>
                          <p className="text-xs font-semibold text-slate-900">{item.label}</p>
                          <p className="text-[11px] text-slate-500">{item.desc}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
