"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Globe,
  Inbox,
  Info,
  KeyRound,
  LayoutDashboard,
  Lock,
  LogOut,
  Menu,
  Network,
  PackageCheck,
  Plus,
  Printer,
  Receipt,
  RefreshCw,
  Settings,
  Trash2,
  Truck,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { setActiveBranchAction } from "@/actions/branch";
import { exitImpersonationAction } from "@/actions/platform";
import { Form, Button, Dialog, Input, Label, Select } from "@/components/ui/primitives";
import { AccessBlockedScreen } from "@/components/access/access-blocked-screen";
import { canAccess } from "@/lib/auth/access";
import { getPageGuide } from "@/lib/help/page-guides";
import { fetchAccessStatus, readCachedBlock, writeCachedBlock } from "@/lib/offline/access-block";
import type { PermissionKey } from "@/lib/constants/saas";
import {
  clearCatalogCacheOnLogout,
  listOutboxEntries,
  removeOutboxEntry,
  replayOutboxFifo,
  type OutboxEntry,
} from "@/lib/offline/sync-engine";
import type { AccessBlock, BranchRow, SessionContext, UiStyleKey } from "@/types/database";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  permission?: PermissionKey;
  roles?: Array<"owner" | "branch_admin" | "worker">;
}

export function ErpShell({
  ctx,
  lowStockCount,
  newEnquiryCount = 0,
  branchOptions,
  initialBranchId,
  children,
}: {
  ctx: SessionContext;
  lowStockCount: number;
  newEnquiryCount?: number;
  branchOptions: BranchRow[];
  initialBranchId: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const tenant = ctx.tenant!;
  const uiStyle: UiStyleKey = tenant.brand_config?.ui_style ?? "style_4";

  const [liveBlock, setLiveBlock] = useState<AccessBlock | null>(ctx.accessBlock ?? null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [activeBranchId, setActiveBranchId] = useState(initialBranchId);
  const [branchPending, startBranchSwitch] = useTransition();

  const switchBranch = (id: string) => {
    const previous = activeBranchId;
    setActiveBranchId(id);
    startBranchSwitch(async () => {
      try {
        await setActiveBranchAction(id);
        router.refresh();
        const name = branchOptions.find((b) => b.id === id)?.name ?? "All branches";
        toast.success(`Now viewing ${name}`);
      } catch (err) {
        setActiveBranchId(previous);
        toast.error(err instanceof Error ? err.message : "Could not switch branch.");
      }
    });
  };
  const [online, setOnline] = useState(true);
  const [outbox, setOutbox] = useState<OutboxEntry[]>([]);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pageGuide = getPageGuide(pathname);

  const [pwOpen, setPwOpen] = useState(false);
  const [pwBannerDismissed, setPwBannerDismissed] = useState(false);
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
        if (r.status === 423) {
          // Blocked: keep every entry queued so it syncs after access returns.
          const held = await r.json().catch(() => ({}));
          if (held.block && !ctx.impersonation) {
            writeCachedBlock(tenant.id, ctx.user.id, held.block);
            setLiveBlock(held.block);
          }
          throw new Error("Held until access is restored");
        }
        if (!r.ok) throw new Error("Sync failed");
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
      const host = window.location.hostname;
      if (host === "localhost" || host === "127.0.0.1") {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => Promise.all(regs.map((r) => r.unregister())))
          .catch(() => undefined);
      } else {
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      }
    }
    listOutboxEntries(tenant.id)
      .then((entries) => {
        if (!active) return;
        setOutbox(entries);
        // Sends anything held during a block or an offline period.
        if (navigator.onLine && entries.some((e) => e.status === "pending") && !readCachedBlock(tenant.id, ctx.user.id)) {
          void triggerSync();
        }
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

  // Keeps a block in force offline and picks up changes from Super Admin while the app is open.
  useEffect(() => {
    if (ctx.impersonation) return;
    let active = true;
    // The server just verified accessBlock during SSR; persist it without firing an extra mount API call.
    const cached = readCachedBlock(tenant.id, ctx.user.id);
    if (navigator.onLine) {
      writeCachedBlock(tenant.id, ctx.user.id, ctx.accessBlock ?? null);
      setLiveBlock(ctx.accessBlock ?? null);
      if (cached && !ctx.accessBlock) void triggerSync();
    } else if (cached) {
      setLiveBlock(cached);
    }

    // Rare checks (30m) let Neon Postgres scale to zero when idle; every save still enforces blocks server-side.
    let lastCheck = Date.now();
    const check = async () => {
      if (!navigator.onLine || document.visibilityState !== "visible") return;
      if (Date.now() - lastCheck < 25 * 60_000) return;
      lastCheck = Date.now();
      const status = await fetchAccessStatus();
      if (!active || !status.known) return;
      writeCachedBlock(tenant.id, ctx.user.id, status.block);
      setLiveBlock(status.block);
    };
    const onOnline = () => {
      lastCheck = 0;
      void check();
    };
    const timer = window.setInterval(check, 30 * 60_000);
    window.addEventListener("focus", check);
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", check);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", check);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx.impersonation, ctx.user.id, tenant.id]);

  // The page behind the mobile menu must not scroll, and Escape closes it.
  useEffect(() => {
    if (!mobileOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [mobileOpen]);

  const handleLogout = async () => {
    await clearCatalogCacheOnLogout().catch(() => undefined);
    await fetch("/api/auth?scope=tenant", { method: "DELETE" });
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

  const navGroups: Array<{ title: string; items: NavItem[] }> = [
    {
      title: "Daily Work",
      items: [
        { href: "/dashboard", label: "Home", icon: <LayoutDashboard className="h-4 w-4" /> },
        { href: "/dashboard/billing/new", label: "New Bill", icon: <Plus className="h-4 w-4" />, permission: "billing.create" },
        { href: "/dashboard/billing", label: "All Bills", icon: <Receipt className="h-4 w-4" />, permission: "billing.view" },
        { href: "/dashboard/stock", label: "Stock & Products", icon: <Boxes className="h-4 w-4" />, permission: "stock.view" },
        { href: "/dashboard/suppliers", label: "Suppliers", icon: <Truck className="h-4 w-4" />, permission: "suppliers.manage" },
        { href: "/dashboard/operations", label: "Send Stock", icon: <PackageCheck className="h-4 w-4" />, permission: "transfers.receive" },
      ],
    },
    {
      title: "Customers",
      items: [
        { href: "/dashboard/customers", label: "Customers", icon: <Users className="h-4 w-4" />, permission: "customers.view" },
        { href: "/dashboard/enquiries", label: "Enquiries", icon: <Inbox className="h-4 w-4" />, permission: "enquiries.view" },
        { href: "/dashboard/storefront", label: "Website & Catalogue", icon: <Globe className="h-4 w-4" />, permission: "catalogue.export" },
      ],
    },
    {
      title: "Business",
      items: [
        { href: "/dashboard/valuation", label: "Stock Value", icon: <BarChart3 className="h-4 w-4" />, roles: ["owner", "branch_admin"] },
        { href: "/dashboard/organisation", label: "Shops & Team", icon: <Network className="h-4 w-4" />, roles: ["owner", "branch_admin"] },
        { href: "/dashboard/reports", label: "GST & Reports", icon: <FileSpreadsheet className="h-4 w-4" />, permission: "reports.export_gst" },
        { href: "/dashboard/bill-designer", label: "Bill Designs", icon: <Printer className="h-4 w-4" />, permission: "bill_designer.manage" },
      ],
    },
    {
      title: "Settings",
      items: [
        { href: "/dashboard/settings", label: "Profile & Settings", icon: <Settings className="h-4 w-4" /> },
        { href: "/dashboard/trash", label: "Trash", icon: <Trash2 className="h-4 w-4" />, permission: "trash.manage" },
      ],
    },
  ];

  const allNavItems = navGroups.flatMap((g) => g.items);
  // Longest match wins, so /billing/new highlights POS rather than Billing too.
  // Supplier ledger URLs live under /dashboard/customers/ledger/supplier/... but belong to Suppliers.
  const activeHref = pathname.startsWith("/dashboard/customers/ledger/supplier")
    ? "/dashboard/suppliers"
    : allNavItems
        .filter((n) => pathname === n.href || (n.href !== "/dashboard" && pathname.startsWith(n.href + "/")))
        .sort((a, b) => b.href.length - a.href.length)[0]?.href ?? "/dashboard";
  const currentSectionLabel = allNavItems.find((n) => n.href === activeHref)?.label ?? "Dashboard";

  const sidebarTone = uiStyle === "style_2" || uiStyle === "style_5" ? "dark" : "light";
  const accentColor = tenant.brand_config?.primary_color || "#171717";
  const pendingCount = outbox.filter((o) => o.status === "pending").length;
  const conflictCount = outbox.filter((o) => o.status === "conflict").length;
  const tierLabel = tenant.tier.replace("_", " ").replace(/^t/, "T");
  const roleLabel = ctx.user.role.replace(/_/g, " ");

  const initialsOf = (name: string) =>
    name
      .split(/\s+/)
      .map((w) => w[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase();
  const userInitials = initialsOf(ctx.user.full_name);

  const renderLinks = (onClick?: () => void) => (
    <div className="space-y-3.5">
      {navGroups.map((group, groupIdx) => {
        const links = group.items.flatMap((item) => {
          if (item.roles && !item.roles.includes(ctx.user.role)) return [];
          const check = item.permission ? canAccess(ctx, item.permission) : { allowed: true };
          const lockedByFeature = check.reason === "FEATURE_DISABLED";
          if (!check.allowed && !lockedByFeature) return [];
          const active = item.href === activeHref;
          return [
            <Link
              key={item.href}
              href={item.href}
              prefetch={false}
              onClick={onClick}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-[36px] items-center justify-between gap-2 rounded-[9px] px-2.5 py-[7px] text-[13px] transition-all duration-150 lg:min-h-[32px] ${
                active
                  ? "bg-[var(--nav-active)] font-medium text-[var(--nav-active-text)] shadow-[0_1px_2px_rgba(0,0,0,.06),0_0_0_1px_rgba(0,0,0,.05)]"
                  : "text-[var(--nav-text)] hover:bg-[var(--nav-hover)]"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span className={`shrink-0 [&_svg]:h-[15px] [&_svg]:w-[15px] ${active ? "" : "opacity-70"}`}>{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </span>
              {item.href === "/dashboard/stock" && lowStockCount > 0 && !lockedByFeature ? (
                <span className="rounded-full bg-[var(--nav-pill)] px-1.5 py-px font-mono text-[10px] font-medium">
                  {lowStockCount}
                </span>
              ) : item.href === "/dashboard/enquiries" && newEnquiryCount > 0 && !lockedByFeature ? (
                <span className="rounded-full bg-[var(--nav-pill)] px-1.5 py-px font-mono text-[10px] font-medium">
                  {newEnquiryCount}
                </span>
              ) : lockedByFeature ? (
                <Lock className="h-3 w-3 opacity-50" />
              ) : null}
            </Link>,
          ];
        });
        if (links.length === 0) return null;
        return (
          <div key={group.title} className={groupIdx > 0 ? "border-t border-[var(--nav-line)] pt-3" : ""}>
            <p className="px-2.5 pb-1.5 text-[11px] text-[var(--nav-title)]">{group.title}</p>
            <nav aria-label={group.title} className="space-y-px">
              {links}
            </nav>
          </div>
        );
      })}
    </div>
  );

  const storageUsedMb = (Number(tenant.storage_used_bytes || 0) / (1024 * 1024)).toFixed(1);
  const storagePct = Math.min(100, Math.round((Number(tenant.storage_used_bytes || 0) / (tenant.max_storage_mb * 1024 * 1024)) * 100));

  const workspacePill = (
    <Link
      href="/dashboard"
      className="flex items-center gap-2.5 rounded-[11px] bg-[var(--nav-pill)] p-1.5 shadow-[inset_0_0_0_1px_rgba(0,0,0,.04)] transition-opacity hover:opacity-85"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-[11px] font-bold text-[#171717] shadow-[0_1px_2px_rgba(0,0,0,.1)]">
        {initialsOf(tenant.name) || "N"}
      </span>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate text-[10.5px] text-[var(--nav-title)]">{tierLabel} workspace</span>
        <span className="block truncate text-[13px] font-medium text-[var(--nav-active-text)] data-[tone=dark]:text-white" style={sidebarTone === "dark" ? { color: "#fff" } : undefined}>
          {tenant.name}
        </span>
      </span>
    </Link>
  );

  const accountCard = (
    <div className="relative">
      {profileOpen && (
        <div className="absolute inset-x-0 bottom-full z-20 mb-1.5 rounded-xl bg-white p-1 text-[#27272a] shadow-[0_12px_32px_rgba(0,0,0,.16),0_0_0_1px_rgba(0,0,0,.06)]">
          <div className="px-2.5 py-1.5">
            <div className="flex items-center justify-between text-[11px] text-[#77777d]">
              <span>Storage</span>
              <span className="font-mono">{storageUsedMb} / {tenant.max_storage_mb} MB</span>
            </div>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-[#ececee]">
              <div className="h-full rounded-full bg-[#171717]" style={{ width: `${storagePct}%` }} />
            </div>
          </div>
          <div className="my-1 h-px bg-[#f1f1f2]" />
          <Link
            href="/dashboard/settings?tab=profile"
            onClick={() => {
              setProfileOpen(false);
              setMobileOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-[#f4f4f5]"
          >
            <Settings className="h-3.5 w-3.5" /> My Profile &amp; Bank Details
          </Link>
          <button
            type="button"
            onClick={() => {
              setProfileOpen(false);
              setMobileOpen(false);
              setPwOpen(true);
            }}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs hover:bg-[#f4f4f5]"
          >
            <KeyRound className="h-3.5 w-3.5" /> Change Password
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50"
          >
            <LogOut className="h-3.5 w-3.5" /> Sign Out
          </button>
        </div>
      )}
      <button
        type="button"
        aria-expanded={profileOpen}
        aria-label="Account menu"
        onClick={() => setProfileOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2.5 rounded-[11px] bg-white p-1.5 text-left shadow-[0_1px_2px_rgba(0,0,0,.05),0_0_0_1px_rgba(0,0,0,.05)]"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#171717] text-[11px] font-semibold text-white">
          {userInitials}
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-[12.5px] font-medium text-[#171717]">{ctx.user.full_name}</span>
          <span className="block truncate text-[10.5px] capitalize text-[#77777d]">{roleLabel}</span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-[#a3a3a8] transition-transform duration-200 ${profileOpen ? "rotate-180" : ""}`} />
      </button>
    </div>
  );

  if (liveBlock && !ctx.impersonation) {
    return <AccessBlockedScreen block={liveBlock} tenantId={tenant.id} userId={ctx.user.id} />;
  }

  return (
    <div
      className="spark-ui flex min-h-screen flex-col bg-white"
      style={{ "--brand-accent": accentColor } as React.CSSProperties}
    >
      {ctx.impersonation && (
        <div className="no-print bg-rose-600 text-white px-4 py-2 text-xs font-medium flex flex-wrap items-center justify-between gap-2">
          <span>
            Support View: Inspecting <strong>{tenant.name}</strong> ({ctx.impersonation.mode.toUpperCase()} mode)
          </span>
          <Form action={exitImpersonationAction}>
            <button type="submit" className="rounded-md bg-white/20 px-2.5 py-1 font-semibold hover:bg-white/30 cursor-pointer">
              Exit Support View
            </button>
          </Form>
        </div>
      )}

      {ctx.user.must_change_password && !ctx.impersonation && !pwBannerDismissed && (
        <div className="no-print bg-amber-50 border-b border-amber-200 text-amber-950 px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-amber-700 shrink-0" />
            <span>You are signed in with a temporary password. Replace it to secure your account.</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPwOpen(true)}
              className="rounded-md bg-[#171717] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#2a2a2a] cursor-pointer"
            >
              Set New Password
            </button>
            <button
              type="button"
              onClick={() => setPwBannerDismissed(true)}
              aria-label="Dismiss password reminder"
              className="rounded-md p-1 text-amber-800 hover:bg-amber-200/70 cursor-pointer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {tenant.stock_outdated_banner && (
        <div className="no-print bg-amber-50 border-b border-amber-200 text-amber-950 px-4 py-1.5 text-xs flex items-center justify-between gap-2">
          <span>Stock tracking was turned back on. Please check your item counts in Stock &amp; Products.</span>
          <Link href="/dashboard/stock" className="shrink-0 font-semibold underline">Go to Stock</Link>
        </div>
      )}

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside
          data-tone={sidebarTone}
          className="ui-sidebar no-print sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col gap-3 border-r border-[var(--nav-line)] p-2.5 lg:flex"
        >
          {workspacePill}
          <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pt-1">{renderLinks()}</div>
          {accountCard}
        </aside>

        {/* Mobile Drawer */}
        {mobileOpen && (
          <div className="no-print fixed inset-0 z-[60] flex lg:hidden">
            <div data-tone={sidebarTone} role="dialog" aria-modal="true" aria-label="Main menu" className="ui-sidebar ui-drawer flex h-[100dvh] w-72 max-w-[85vw] flex-col gap-3 p-2.5">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">{workspacePill}</div>
                <button type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-[var(--nav-text)]">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="ui-drawer-scroll min-h-0 flex-1">{renderLinks(() => setMobileOpen(false))}</div>
              {accountCard}
            </div>
            <div className="flex-1 bg-black/30 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          </div>
        )}

        {/* Main Content */}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print sticky top-0 z-20 flex h-[52px] items-center justify-between gap-2 border-b border-[var(--ui-line)] bg-white/90 px-3 backdrop-blur-md sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setMobileOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[#55555b] hover:bg-[#f4f4f5] lg:hidden"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
                <Link href="/dashboard" className="text-[#a3a3a8] transition-colors hover:text-[#171717]">Home</Link>
                {currentSectionLabel !== "Home" && (
                  <>
                    <ChevronRight className="h-3 w-3 shrink-0 text-[#c9c9cd]" />
                    <span className="truncate font-medium text-[#171717]">{currentSectionLabel}</span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setHelpOpen(true)}
                title={`How ${pageGuide.title} works`}
                aria-label={`How ${pageGuide.title} works`}
                className="inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-[#e5e5e7] bg-[#fafafa] px-2.5 text-[11.5px] font-medium text-[#52525b] transition-colors hover:border-[#171717] hover:bg-[#171717] hover:text-white"
              >
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">How it works</span>
              </button>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              {branchOptions.length > 1 ? (
                <span className={branchPending ? "ui-branch-pending" : undefined}>
                  <Select
                    aria-label="Active branch"
                    value={activeBranchId}
                    disabled={branchPending}
                    onChange={(e) => switchBranch(e.target.value)}
                    className="!min-h-[32px] !w-[132px] !bg-[#f4f4f5] !py-1 !text-xs !shadow-none sm:!w-[176px]"
                  >
                    <option value="all">All branches</option>
                    {branchOptions.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </Select>
                </span>
              ) : branchOptions[0] ? (
                <span
                  title="Only one branch is assigned to you"
                  className="inline-flex h-8 max-w-[132px] items-center truncate rounded-lg bg-[#f4f4f5] px-3 text-xs text-[#3f3f46] sm:max-w-[176px]"
                >
                  <span className="truncate">{branchOptions[0].name}</span>
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => setSyncOpen(true)}
                title={online ? "Connected. Open sync queue" : "Offline. Open sync queue"}
                aria-label={online ? "Online, open sync queue" : "Offline, open sync queue"}
                className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[#55555b] hover:bg-[#f4f4f5]"
              >
                {online ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4 text-amber-600" />}
                {(pendingCount > 0 || conflictCount > 0) && (
                  <span className={`absolute -right-0.5 -top-0.5 rounded-full px-1 font-mono text-[9px] font-medium text-white ${conflictCount > 0 ? "bg-rose-600" : "bg-[#171717]"}`}>
                    {pendingCount + conflictCount}
                  </span>
                )}
              </button>

              <Link
                href="/dashboard/stock"
                title="Low-stock alerts"
                aria-label={`Low-stock alerts: ${lowStockCount}`}
                className="relative flex h-8 w-8 items-center justify-center rounded-lg text-[#55555b] hover:bg-[#f4f4f5]"
              >
                <Bell className="h-4 w-4" />
                {lowStockCount > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 rounded-full bg-rose-600 px-1 font-mono text-[9px] font-medium text-white">
                    {lowStockCount}
                  </span>
                )}
              </Link>

              {canAccess(ctx, "billing.create").allowed && (
                <Link
                  href="/dashboard/billing/new"
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#171717] px-2.5 text-xs font-medium text-white shadow-[0_1px_2px_rgba(0,0,0,.25),inset_0_1px_0_rgba(255,255,255,.12)] transition-colors hover:bg-[#2a2a2a]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">New Bill</span>
                </Link>
              )}
            </div>
          </header>

          <main className="mx-auto w-full max-w-[1480px] flex-1 overflow-x-hidden p-3 pb-24 sm:p-5 lg:pb-6">
            {children}
          </main>
        </div>
      </div>

      {/* Mobile Bottom Quick Bar */}
      <nav aria-label="Quick navigation" className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-[var(--ui-line)] bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        {[
          { href: "/dashboard", label: "Home", icon: <BarChart3 className="h-4 w-4" /> },
          { href: "/dashboard/billing/new", label: "Bill", icon: <Plus className="h-4 w-4" /> },
          { href: "/dashboard/stock", label: "Stock", icon: <Boxes className="h-4 w-4" /> },
          { href: "/dashboard/operations", label: "Send", icon: <PackageCheck className="h-4 w-4" /> },
        ].map((b) => (
          <Link
            key={b.href}
            href={b.href}
            className={`flex min-h-[52px] flex-col items-center justify-center py-2 text-[11px] font-medium ${
              pathname === b.href ? "text-[#171717]" : "text-[#8a8a90]"
            }`}
          >
            {b.icon}
            <span className="mt-0.5">{b.label}</span>
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex min-h-[52px] flex-col items-center justify-center py-2 text-[11px] font-medium text-[#8a8a90]"
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

      {/* Universal Page Guide Modal (i icon) */}
      <Dialog
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={`How "${pageGuide.title}" Works`}
        subtitle={pageGuide.whatItIs}
        maxWidth="max-w-lg"
      >
        <div className="space-y-4">
          <div className="space-y-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#77777d]">
              Step-by-step guide
            </p>
            <ol className="space-y-2">
              {pageGuide.steps.map((step, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 rounded-xl border border-[#ececee] bg-[#fafafa] p-3 text-xs leading-relaxed text-[#171717]"
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#171717] text-[10.5px] font-bold text-white">
                    {idx + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </div>

          <div className="rounded-xl border border-[#e5e5e7] bg-white p-3 text-xs text-[#52525b]">
            <span className="font-semibold text-[#171717]">Tip: </span>
            {pageGuide.tip}
          </div>

          <div className="flex justify-end pt-1">
            <Button type="button" size="sm" onClick={() => setHelpOpen(false)}>
              Got it
            </Button>
          </div>
        </div>
      </Dialog>

      {/* Change Password Modal */}
      <Dialog
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title={ctx.user.must_change_password ? "Set Your New Password" : "Change Password"}
        subtitle={ctx.user.must_change_password ? "Replace your temporary password with a personal password." : ""}
      >
        <Form onSubmit={handlePasswordChange} className="space-y-3">
          <div>
            <Label>Current Password</Label>
            <Input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} required />
          </div>
          <div>
            <Label>New Password (min 8 chars)</Label>
            <Input type="password" minLength={8} value={newPw} onChange={(e) => setNewPw(e.target.value)} required />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" className="flex-1" disabled={pwBusy}>
              {pwBusy ? "Updating..." : "Update Password"}
            </Button>
          </div>
        </Form>
      </Dialog>
    </div>
  );
}
