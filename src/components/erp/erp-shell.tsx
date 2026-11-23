"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  ChevronRight,
  FileSpreadsheet,
  Globe,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  PackageCheck,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Settings,
  Sparkles,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { exitImpersonationAction } from "@/actions/platform";
import { NexusLogo } from "@/components/brand/nexus-logo";
import { Badge, Button, Dialog, Input, Label, Select } from "@/components/ui/primitives";
import { canAccess } from "@/lib/auth/access";
import type { PermissionKey } from "@/lib/constants/saas";
import {
  clearCatalogCacheOnLogout,
  listOutboxEntries,
  removeOutboxEntry,
  replayOutboxFifo,
  type OutboxEntry,
} from "@/lib/offline/sync-engine";
import type { SessionContext, UiStyleKey } from "@/types/database";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  permission?: PermissionKey;
}

export function ErpShell({
  ctx,
  lowStockCount,
  children,
}: {
  ctx: SessionContext;
  lowStockCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tenant = ctx.tenant!;
  const uiStyle: UiStyleKey = tenant.brand_config?.ui_style ?? "style_4";

  const [mobileOpen, setMobileOpen] = useState(false);
  const [activeBranchId, setActiveBranchId] = useState(ctx.branches[0]?.id ?? "");
  const [online, setOnline] = useState(true);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const [pwOpen, setPwOpen] = useState(ctx.user.must_change_password);
  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);

  const refreshOutbox = async () => {
    try {
      const entries = await listOutboxEntries(tenant.id);
      setOutbox(entries);
    } catch {
      // ignore on SSR
    }
  };

  const triggerSync = async () => {
    setSyncing(true);
    try {
      const ping = await fetch("/api/sync", { method: "HEAD" });
      if (!ping.ok) throw new Error("Offline");
      setOnline(true);

      const res = await replayOutboxFifo(tenant.id, async (batch) => {
        const r = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entries: batch }),
        });
        const data = await r.json();
        return data.results ?? [];
      });
      if (res.synced > 0) toast.success(`Synced ${res.synced} offline item(s).`);
      if (res.conflicts > 0) toast.warning(`${res.conflicts} item(s) need conflict review.`);
      await refreshOutbox();
      router.refresh();
    } catch {
      setOnline(false);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    let active = true;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    listOutboxEntries(tenant.id)
      .then((entries) => {
        if (active) setOutbox(entries);
      })
      .catch(() => undefined);

    const onOnline = () => {
      setOnline(true);
      triggerSync();
    };
    const onOffline = () => setOnline(false);

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      active = false;
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id]);

  const handleLogout = async () => {
    await clearCatalogCacheOnLogout().catch(() => undefined);
    await fetch("/api/auth", { method: "DELETE" });
    router.push("/login");
    router.refresh();
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwBusy(true);
    try {
      const res = await fetch("/api/auth", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change_password", currentPassword: curPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || "Could not change password");
        return;
      }
      toast.success("Password updated!");
      setPwOpen(false);
      setCurPw("");
      setNewPw("");
      router.refresh();
    } finally {
      setPwBusy(false);
    }
  };

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
    { href: "/dashboard/billing", label: "Billing & Ledger", icon: <Receipt className="h-4 w-4" />, permission: "billing.view" },
    { href: "/dashboard/billing/new", label: "POS Terminal", icon: <Plus className="h-4 w-4" />, permission: "billing.create" },
    { href: "/dashboard/bill-designer", label: "Bill Designer", icon: <Printer className="h-4 w-4" />, permission: "bill_designer.manage" },
    { href: "/dashboard/customers", label: "Customers CRM", icon: <Users className="h-4 w-4" />, permission: "customers.view" },
    { href: "/dashboard/stock", label: "Stock & Matrix", icon: <Boxes className="h-4 w-4" />, permission: "stock.view" },
    { href: "/dashboard/operations", label: "Factory & Transfers", icon: <PackageCheck className="h-4 w-4" />, permission: "transfers.receive" },
    { href: "/dashboard/reports", label: "GST & Reports", icon: <FileSpreadsheet className="h-4 w-4" />, permission: "reports.export_gst" },
    { href: "/dashboard/storefront", label: "Website & PDF", icon: <Globe className="h-4 w-4" />, permission: "catalogue.export" },
    { href: "/dashboard/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
  ];

  const isDarkSidebar = uiStyle === "style_2" || uiStyle === "style_5";
  const accentColor = tenant.brand_config?.primary_color || "#4B5A94";
  const sidebarBg =
    uiStyle === "style_5"
      ? "bg-slate-950 text-slate-100 border-slate-800"
      : uiStyle === "style_2"
      ? "bg-[#0B1120] text-slate-200 border-slate-800"
      : uiStyle === "style_3"
      ? "bg-[#F4F6FA] text-slate-800 border-slate-200/80"
      : "bg-white text-slate-800 border-slate-200/80";
  const pageBg = uiStyle === "style_5" ? "bg-slate-100" : "bg-[#F8F9FB]";
  const pendingCount = outbox.filter((o) => o.status === "pending").length;
  const conflictCount = outbox.filter((o) => o.status === "conflict").length;

  const currentSectionLabel =
    navItems.find((n) => pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href + "/")))?.label ??
    "Overview";

  const userInitials = ctx.user.full_name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const renderLinks = (onClick?: () => void) => (
    <div className="space-y-0.5 px-3 py-2">
      {navItems.map((item) => {
        const check = item.permission ? canAccess(ctx, item.permission) : { allowed: true };
        const lockedByFeature = check.reason === "FEATURE_DISABLED";
        if (!check.allowed && !lockedByFeature) return null;

        const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href + "/"));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onClick}
            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-[13px] transition-colors min-h-[40px] ${
              active
                ? isDarkSidebar
                  ? "bg-white/15 text-white font-semibold"
                  : "bg-slate-100/95 text-slate-900 font-semibold"
                : isDarkSidebar
                ? "hover:bg-slate-800/80 text-slate-300 font-medium"
                : "hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-medium"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span className={active ? (isDarkSidebar ? "text-sky-300" : "text-slate-900") : "text-slate-400"}>
                {item.icon}
              </span>
              {item.label}
            </span>
            {item.href === "/dashboard/stock" && lowStockCount > 0 && !lockedByFeature ? (
              <span className="rounded-md bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-bold text-slate-700">
                {lowStockCount}
              </span>
            ) : lockedByFeature ? (
              <Lock className="h-3.5 w-3.5 text-slate-400" />
            ) : null}
          </Link>
        );
      })}
    </div>
  );

  const storageUsedMb = (Number(tenant.storage_used_bytes || 0) / (1024 * 1024)).toFixed(1);
  const storagePct = Math.min(100, Math.round((Number(tenant.storage_used_bytes || 0) / (tenant.max_storage_mb * 1024 * 1024)) * 100));

  return (
    <div
      className={`min-h-screen ${pageBg} flex flex-col`}
      style={{ "--brand-accent": accentColor } as React.CSSProperties}
    >
      {ctx.impersonation && (
        <div className="no-print bg-rose-600 text-white px-4 py-2 text-xs font-medium flex flex-wrap items-center justify-between gap-2">
          <span>
            Support View: Inspecting <strong>{tenant.name}</strong> ({ctx.impersonation.mode.toUpperCase()} mode)
          </span>
          <form action={exitImpersonationAction}>
            <button type="submit" className="rounded bg-white/20 px-2.5 py-1 font-semibold hover:bg-white/30 cursor-pointer">
              Exit Support View
            </button>
          </form>
        </div>
      )}

      {tenant.stock_outdated_banner && (
        <div className="no-print bg-amber-100 border-b border-amber-300 text-amber-950 px-4 py-2 text-xs flex items-center justify-between">
          <span>Stock tracking was re-enabled. Please run a Stock Count in Stock &amp; Matrix to verify physical balances.</span>
          <Link href="/dashboard/stock" className="font-bold underline">Go to Stock</Link>
        </div>
      )}

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside className={`no-print hidden lg:flex lg:w-[252px] lg:flex-col border-r shrink-0 ${sidebarBg}`}>
          <div className="h-16 px-4 flex items-center justify-between border-b border-inherit">
            <Link href="/dashboard">
              <NexusLogo variant={isDarkSidebar ? "light" : "dark"} size="sm" />
            </Link>
            <Badge variant="info">{tenant.tier.replace("_", " ").toUpperCase()}</Badge>
          </div>
          <div className="flex-1 overflow-y-auto py-2">{renderLinks()}</div>

          {/* Catalox-style Workspace Status Card */}
          <div className="px-3 pb-2">
            <div className="rounded-2xl overflow-hidden border border-slate-200/80 bg-white text-slate-900 shadow-2xs">
              <div className="bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#3B4A82] px-3.5 py-3 text-white">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-sky-300">
                    <Sparkles className="h-3 w-3" /> {tenant.tier.replace("_", " ")}
                  </span>
                  <span className="text-[10px] text-slate-300">{ctx.branches.length} Branches</span>
                </div>
                <p className="text-xs font-bold mt-1 truncate">{tenant.name}</p>
              </div>
              <div className="p-3 space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-600">
                  <span>R2 Cloud Media</span>
                  <span className="font-semibold text-slate-800">{storageUsedMb} / {tenant.max_storage_mb} MB</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full bg-[#4B5A94]" style={{ width: `${Math.max(4, storagePct)}%` }} />
                </div>
                <Link
                  href="/dashboard/settings"
                  className="block w-full text-center rounded-xl bg-[#4B5A94] py-1.5 text-[11px] font-semibold text-white hover:bg-[#3E4C80] transition-colors"
                >
                  Manage Workspace
                </Link>
              </div>
            </div>
          </div>

          <div className="p-3 pb-14 border-t border-inherit space-y-1">
            <button
              type="button"
              onClick={() => setPwOpen(true)}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium hover:bg-slate-500/10 cursor-pointer"
            >
              <KeyRound className="h-3.5 w-3.5" /> Change Password
            </button>
            <button
              type="button"
              onClick={handleLogout}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-500/10 cursor-pointer"
            >
              <LogOut className="h-3.5 w-3.5" /> Sign Out
            </button>
          </div>
        </aside>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div className="no-print fixed inset-0 z-50 lg:hidden flex">
            <div className={`w-72 max-w-[85vw] h-full flex flex-col border-r ${sidebarBg}`}>
              <div className="h-14 px-4 flex items-center justify-between border-b border-inherit">
                <NexusLogo variant={isDarkSidebar ? "light" : "dark"} size="sm" />
                <button type="button" onClick={() => setMobileOpen(false)} className="p-2">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto">{renderLinks(() => setMobileOpen(false))}</div>
              <div className="p-3 border-t border-inherit space-y-2">
                <Button variant="outline" size="sm" className="w-full" onClick={() => { setMobileOpen(false); setPwOpen(true); }}>
                  Change Password
                </Button>
                <Button variant="danger" size="sm" className="w-full" onClick={handleLogout}>
                  Sign Out
                </Button>
              </div>
            </div>
            <div className="flex-1 bg-slate-950/50" onClick={() => setMobileOpen(false)} />
          </div>
        )}

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0">
          <header className="no-print sticky top-0 z-20 h-16 bg-white border-b border-slate-200/80 px-3 sm:px-6 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileOpen(true)}
                className="lg:hidden rounded-xl p-2 text-slate-600 hover:bg-slate-100 min-h-[42px] min-w-[42px] flex items-center justify-center"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400">
                <span className="font-medium text-slate-500">{tenant.name}</span>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="font-semibold text-slate-900">{currentSectionLabel}</span>
              </div>
              {ctx.branches.length > 0 && (
                <Select
                  value={activeBranchId}
                  onChange={(e) => {
                    setActiveBranchId(e.target.value);
                    window.localStorage.setItem(`nexus:branch:${tenant.id}`, e.target.value);
                  }}
                  className="max-w-[165px] sm:max-w-[215px] min-h-[36px] text-xs bg-slate-50/70"
                >
                  {ctx.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code})
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div className="flex items-center gap-2 sm:gap-2.5">
              <button
                type="button"
                onClick={() => setSyncOpen(true)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-semibold border cursor-pointer ${
                  conflictCount > 0
                    ? "bg-rose-50 text-rose-700 border-rose-200"
                    : !online
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-emerald-50/80 text-emerald-700 border-emerald-200/80"
                }`}
              >
                {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{online ? "Online" : "Offline"}</span>
                {(pendingCount > 0 || conflictCount > 0) && (
                  <span>({pendingCount + conflictCount})</span>
                )}
              </button>

              <Link
                href="/dashboard/stock"
                className="relative rounded-xl border border-slate-200/80 bg-white p-2 text-slate-600 hover:bg-slate-50"
                title="Low-stock alerts"
              >
                <Bell className="h-4 w-4" />
                {lowStockCount > 0 && (
                  <span className="absolute -top-1 -right-1 rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                    {lowStockCount}
                  </span>
                )}
              </Link>

              {canAccess(ctx, "billing.create").allowed && (
                <Link
                  href="/dashboard/billing/new"
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#4B5A94] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#3E4C80] min-h-[36px] shadow-2xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">New Bill</span>
                </Link>
              )}

              <div className="hidden xl:flex items-center gap-2.5 pl-2 border-l border-slate-200/80">
                <div className="h-8 w-8 rounded-full bg-emerald-900 text-emerald-100 text-xs font-bold flex items-center justify-center shrink-0">
                  {userInitials}
                </div>
                <div className="leading-tight">
                  <p className="text-xs font-semibold text-slate-900 max-w-[130px] truncate">{ctx.user.full_name}</p>
                  <p className="text-[10px] text-slate-500 max-w-[130px] truncate">
                    {ctx.user.email || `${ctx.user.role.replace("_", " ")}`}
                  </p>
                </div>
              </div>
            </div>
          </header>

          <main className="flex-1 p-3 sm:p-6 pb-24 lg:pb-8 max-w-full overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Quick Bar */}
      <nav className="no-print lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-slate-200 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {[
          { href: "/dashboard", label: "Home", icon: <BarChart3 className="h-4 w-4" /> },
          { href: "/dashboard/billing/new", label: "POS", icon: <Plus className="h-4 w-4" /> },
          { href: "/dashboard/stock", label: "Stock", icon: <Boxes className="h-4 w-4" /> },
          { href: "/dashboard/operations", label: "Ops", icon: <PackageCheck className="h-4 w-4" /> },
        ].map((b) => (
          <Link
            key={b.href}
            href={b.href}
            className={`flex flex-col items-center justify-center py-2 text-[11px] font-medium min-h-[52px] ${
              pathname === b.href ? "text-sky-600" : "text-slate-600"
            }`}
          >
            {b.icon}
            <span className="mt-0.5">{b.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex flex-col items-center justify-center py-2 text-[11px] font-medium text-slate-600 min-h-[52px]"
        >
          <Menu className="h-4 w-4" />
          <span className="mt-0.5">More</span>
        </button>
      </nav>

      {/* Sync & Conflicts Drawer */}
      <Dialog
        open={syncOpen}
        onClose={() => setSyncOpen(false)}
        title="Offline Sync & Outbox Queue"
        subtitle={online ? "Connected to server" : "Working offline — bills queue safely"}
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-600">{outbox.length} queued item(s)</span>
            <Button size="sm" onClick={triggerSync} disabled={syncing}>
              <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
              Sync Now
            </Button>
          </div>
          {outbox.length === 0 ? (
            <p className="text-xs text-slate-500 py-4 text-center">All changes synced.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {outbox.map((item) => (
                <div key={item.idempotency_key} className="rounded-lg border border-slate-200 p-2.5 text-xs flex items-start justify-between gap-2">
                  <div>
                    <div className="font-semibold flex items-center gap-1.5">
                      {item.status === "conflict" && <AlertTriangle className="h-3.5 w-3.5 text-rose-600" />}
                      {item.op} • {item.status.toUpperCase()}
                    </div>
                    {item.error && <p className="text-rose-600 mt-0.5">{item.error}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      await removeOutboxEntry(item.idempotency_key);
                      await refreshOutbox();
                    }}
                  >
                    Discard
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </Dialog>

      {/* Change Password Modal */}
      <Dialog
        open={pwOpen}
        onClose={() => {
          if (!ctx.user.must_change_password) setPwOpen(false);
        }}
        title={ctx.user.must_change_password ? "Set Your New Password" : "Change Password"}
        subtitle={ctx.user.must_change_password ? "Please replace your temporary password to continue." : ""}
      >
        <form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <Label>Current Password</Label>
            <Input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} required />
          </div>
          <div>
            <Label>New Password (min 8 chars)</Label>
            <Input type="password" minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
          </div>
          <Button type="submit" className="w-full" disabled={pwBusy}>
            Update Password
          </Button>
        </form>
      </Dialog>
    </div>
  );
}
