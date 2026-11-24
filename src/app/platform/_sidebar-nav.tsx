"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlatformLogoutButton } from "@/app/platform/_client";
import { Building2, ChevronRight, Inbox, KeyRound, Menu, ShieldBan, X, LayoutDashboard, Network, Server } from "lucide-react";

const MAIN_NAV = [
  { href: "/platform", label: "Dashboard", icon: LayoutDashboard },
  { href: "/platform/organisation", label: "Organisation", icon: Network },
  { href: "/platform/tenants", label: "Tenants", icon: Building2 },
  { href: "/platform/enquiries", label: "Enquiries", icon: Inbox },
];

const MANAGEMENT_NAV = [
  { href: "/platform/permissions", label: "Roles, Tiers & HSN", icon: KeyRound },
  { href: "/platform/access", label: "Access Control", icon: ShieldBan },
  { href: "/platform/infrastructure", label: "Infrastructure", icon: Server },
];

export function PlatformBreadcrumb() {
  const pathname = usePathname();
  const label =
    pathname === "/platform"
      ? "Overview"
      : pathname.startsWith("/platform/organisation")
      ? "Organisation"
      : pathname.startsWith("/platform/tenants")
      ? "Tenants"
      : pathname.startsWith("/platform/access")
      ? "Access Control"
      : pathname.startsWith("/platform/enquiries")
      ? "Enquiries"
      : pathname.startsWith("/platform/permissions")
      ? "Roles, Tiers & HSN"
      : pathname.startsWith("/platform/infrastructure")
      ? "Infrastructure"
      : "Overview";

  return (
    <div className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
      <Link href="/platform" className="text-[#a3a3a8] hover:text-[#171717] transition-colors">
        Dashboard
      </Link>
      <ChevronRight className="h-3 w-3 text-[#c9c9cd]" />
      <span className="font-medium text-[#171717]">{label}</span>
    </div>
  );
}

export function PlatformSidebarNav() {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === "/platform" ? pathname === "/platform" : pathname.startsWith(href);

  const renderGroup = (title: string, items: typeof MAIN_NAV) => (
    <div>
      <p className="px-2.5 pb-1.5 text-[11px] text-[var(--nav-title)]">{title}</p>
      <nav aria-label={title} className="space-y-px">
        {items.map((item) => {
          const active = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[32px] items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-[13px] transition-all duration-150 ${
                active
                  ? "bg-[var(--nav-active)] font-medium text-[var(--nav-active-text)] shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_rgba(0,0,0,.05)]"
                  : "text-[var(--nav-text)] hover:bg-[var(--nav-hover)]"
              }`}
            >
              <Icon
                className={`h-[15px] w-[15px] shrink-0 ${active ? "" : "opacity-70"}`}
                strokeWidth={active ? 2.1 : 1.8}
              />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );

  return (
    <div className="space-y-3">
      {renderGroup("Main Menu", MAIN_NAV)}
      <div className="h-px bg-[var(--nav-line)]" />
      {renderGroup("Management", MANAGEMENT_NAV)}
    </div>
  );
}

export function PlatformMobileMenu({ name, initials }: { name: string; initials: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(pathname);
  if (open && openedAt !== pathname) setOpen(false);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => {
          setOpenedAt(pathname);
          setOpen(true);
        }}
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#55555b] hover:bg-[#f4f4f5] lg:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      {open
        ? createPortal(
            <div className="spark-ui fixed inset-0 z-[60] flex lg:hidden">
              <div role="dialog" aria-modal="true" aria-label="Main menu" className="ui-sidebar ui-drawer flex h-[100dvh] w-72 max-w-[85vw] flex-col gap-3 p-2.5">
                <div className="flex items-center gap-2">
                  <span className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[11px] bg-[var(--nav-pill)] p-1.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#171717]">
                      <Network className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 leading-tight">
                      <span className="block truncate text-[10.5px] text-[var(--nav-title)]">Platform</span>
                      <span className="block truncate text-[13px] font-medium text-[#171717]">Nexus ERP</span>
                    </span>
                  </span>
                  <button type="button" aria-label="Close menu" onClick={() => setOpen(false)} className="cursor-pointer rounded-lg p-2 text-[var(--nav-text)]">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="ui-drawer-scroll min-h-0 flex-1" onClick={(e) => {
                  if ((e.target as HTMLElement).closest("a")) setOpen(false);
                }}>
                  <PlatformSidebarNav />
                </div>
                <div className="space-y-1">
                  <PlatformLogoutButton fullWidth />
                  <div className="flex items-center gap-2.5 rounded-[11px] bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.05)]">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#171717] text-[11px] font-semibold text-white">{initials}</span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[12.5px] font-medium text-[#171717]">{name}</span>
                      <span className="block truncate text-[10.5px] text-[#77777d]">Super Admin</span>
                    </span>
                  </div>
                </div>
              </div>
              <button type="button" aria-label="Close menu" className="flex-1 cursor-default bg-black/30 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
            </div>,
            document.body
          )
        : null}
    </>
  );
}
