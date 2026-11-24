import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Network } from "lucide-react";
import { getServerSessionContext } from "@/lib/auth/session";
import { PlatformLogoutButton } from "@/app/platform/_client";
import { PlatformQuickSearch } from "@/app/platform/_quick-search";
import {
  PlatformBreadcrumb,
  PlatformMobileMenu,
  PlatformSidebarNav,
} from "@/app/platform/_sidebar-nav";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getServerSessionContext("platform");
  if (!ctx || !ctx.user.is_platform_admin) {
    redirect("/login?portal=super");
  }

  const initials = ctx.user.full_name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="spark-ui flex min-h-screen bg-white">
      <aside className="ui-sidebar sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-3 border-r border-[var(--nav-line)] p-2.5 lg:flex">
        <Link
          href="/platform"
          className="flex items-center gap-2.5 rounded-[11px] bg-[var(--nav-pill)] p-1.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,.04)] transition-opacity hover:opacity-85"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,.1)]">
            <Network className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[10.5px] text-[var(--nav-title)]">Platform</span>
            <span className="block truncate text-[13px] font-medium text-[#171717]">Nexus ERP</span>
          </span>
        </Link>

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pt-1">
          <PlatformSidebarNav />
        </div>

        <div className="space-y-1">
          <PlatformLogoutButton fullWidth />
          <div className="flex items-center gap-2.5 rounded-[11px] bg-white p-1.5 shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.05)]">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#171717] text-[11px] font-semibold text-white">
              {initials || "SA"}
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-[12.5px] font-medium text-[#171717]">{ctx.user.full_name}</span>
              <span className="block truncate text-[10.5px] text-[#77777d]">Super Admin</span>
            </span>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between gap-3 border-b border-[var(--ui-line)] bg-white/90 px-3 backdrop-blur-md sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <PlatformMobileMenu name={ctx.user.full_name} initials={initials || "SA"} />
            <PlatformBreadcrumb />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
            <div className="min-w-0 flex-1 sm:w-60 sm:flex-none">
              <PlatformQuickSearch />
            </div>
            <span
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#171717] text-[11px] font-semibold text-white sm:flex"
              title={ctx.user.full_name}
            >
              {initials || "SA"}
            </span>
          </div>
        </header>

        <main className="mx-auto w-full min-w-0 max-w-[1480px] flex-1 overflow-x-clip p-3 sm:p-5">{children}</main>
      </div>
    </div>
  );
}
