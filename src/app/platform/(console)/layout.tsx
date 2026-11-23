import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, KeyRound, LayoutDashboard, Server } from "lucide-react";
import { NexusLogo } from "@/components/brand/nexus-logo";
import { Badge } from "@/components/ui/primitives";
import { getServerSessionContext } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { PlatformLogoutButton } from "@/app/platform/_client";

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.user.is_platform_admin) {
    redirect("/login");
  }

  const nav = [
    { href: "/platform", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: "/platform/tenants", label: "Tenants", icon: <Building2 className="h-4 w-4" /> },
    { href: "/platform/permissions", label: "Permissions & HSN", icon: <KeyRound className="h-4 w-4" /> },
    { href: "/platform/infrastructure", label: "Infrastructure & VPS", icon: <Server className="h-4 w-4" /> },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-30 bg-[#0B1120] text-white border-b border-slate-800">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 h-14 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/platform">
              <NexusLogo variant="light" size="sm" />
            </Link>
            <Badge variant="info" className="hidden sm:inline-flex">
              {env.DEPLOYMENT_TARGET === "vps" ? "VPS / Docker" : "Vercel Runtime"}
            </Badge>
          </div>

          <nav className="hidden md:flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
              >
                {item.icon}
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2 text-xs">
            <span className="hidden sm:inline text-slate-300">{ctx.user.full_name}</span>
            <PlatformLogoutButton />
          </div>
        </div>

        {/* Mobile Nav Strip */}
        <div className="md:hidden flex gap-1 overflow-x-auto px-3 pb-2 no-scrollbar">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-slate-200 min-h-[38px]"
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
