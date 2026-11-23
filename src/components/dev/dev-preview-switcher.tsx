"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Building2,
  FlaskConical,
  Power,
  ShieldCheck,
  Store,
  UserCheck,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { DEV_ROLE_COOKIE, parseDevPreviewRole, type DevPreviewRole } from "@/lib/dev/preview";

function readDevRoleCookie(): DevPreviewRole | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${DEV_ROLE_COOKIE}=`));
  if (!match) return null;
  return parseDevPreviewRole(decodeURIComponent(match.split("=")[1] ?? ""));
}

const ROLE_CARDS: Array<{
  role: DevPreviewRole;
  label: string;
  subtitle: string;
  target: string;
  icon: React.ReactNode;
}> = [
  {
    role: "platform_admin",
    label: "Platform Super Admin",
    subtitle: "Mohammad Hassan • Tenants, Tiers, Overrides & Infra",
    target: "/platform",
    icon: <ShieldCheck className="h-4 w-4 text-amber-400" />,
  },
  {
    role: "owner",
    label: "Shop Owner (Super Admin)",
    subtitle: "Imraan Ahmed • Full Tier 4 ERP (DEL + CHN)",
    target: "/dashboard",
    icon: <Building2 className="h-4 w-4 text-sky-400" />,
  },
  {
    role: "branch_admin",
    label: "Branch Admin (Manager)",
    subtitle: "Rizwan • Chennai Retail Shop Manager",
    target: "/dashboard",
    icon: <UserCheck className="h-4 w-4 text-emerald-400" />,
  },
  {
    role: "worker",
    label: "Staff (Counter Worker)",
    subtitle: "Arjun • POS Billing & Stock Receiving Only",
    target: "/dashboard/billing/new",
    icon: <Users className="h-4 w-4 text-violet-400" />,
  },
];

const noopSubscribe = () => () => {};

export function DevPreviewSwitcher() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [roleOverride, setRoleOverride] = useState<DevPreviewRole | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const activeRole: DevPreviewRole | null =
    roleOverride !== undefined ? roleOverride : hydrated ? readDevRoleCookie() : null;

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const switchRole = async (role: DevPreviewRole | null, target?: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/dev-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        toast.error("Dev preview is disabled.");
        return;
      }
      setRoleOverride(role);
      setOpen(false);
      if (!role) {
        toast.info("Dev Preview turned OFF (Live Backend Mode).");
        router.push("/login");
        router.refresh();
        return;
      }
      const meta = ROLE_CARDS.find((c) => c.role === role);
      toast.success(`Dev Preview: ${meta?.label ?? role}`);
      router.push(target || meta?.target || "/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const activeLabel =
    activeRole === "platform_admin"
      ? "Platform Super Admin"
      : activeRole === "owner"
      ? "Shop Owner"
      : activeRole === "branch_admin"
      ? "Branch Admin"
      : activeRole === "worker"
      ? "Staff Worker"
      : "OFF";

  return (
    <div
      className="no-print"
      style={{ position: "fixed", bottom: "4.5rem", right: "1rem", zIndex: 9999 }}
    >
      {open && (
        <div className="mb-2 w-[310px] sm:w-[340px] rounded-2xl border border-slate-700 bg-[#0B1120] text-white shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-amber-400" />
              <div>
                <p className="text-xs font-bold">Dev UI Preview (Mock Data)</p>
                <p className="text-[10px] text-slate-400">Works without Neon / R2 backend</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
              aria-label="Close Dev Preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="p-3 space-y-1.5">
            {ROLE_CARDS.map((card) => {
              const selected = activeRole === card.role;
              return (
                <button
                  key={card.role}
                  type="button"
                  disabled={busy}
                  onClick={() => switchRole(card.role, card.target)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition-colors flex items-start gap-2.5 cursor-pointer ${
                    selected
                      ? "border-sky-500 bg-sky-500/15"
                      : "border-slate-800 bg-slate-900/70 hover:border-slate-600"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">{card.icon}</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-white">{card.label}</span>
                      {selected && (
                        <span className="rounded bg-sky-500 px-1.5 py-0.5 text-[9px] font-bold text-slate-950">
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-0.5">{card.subtitle}</p>
                  </div>
                </button>
              );
            })}

            <div className="pt-2 border-t border-slate-800 flex items-center justify-between gap-2">
              <Link
                href="/s/imraan-footwear"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-[11px] font-semibold text-sky-300 hover:bg-slate-800"
              >
                <Store className="h-3.5 w-3.5" />
                Demo Storefront
              </Link>
              <button
                type="button"
                disabled={busy || !activeRole}
                onClick={() => switchRole(null)}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-800/80 bg-rose-950/60 px-2.5 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/60 disabled:opacity-40 cursor-pointer"
              >
                <Power className="h-3.5 w-3.5" />
                Turn Off
              </button>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold shadow-xl transition-all cursor-pointer ${
          activeRole
            ? "border-amber-400/70 bg-[#0B1120] text-amber-300 hover:bg-slate-900"
            : "border-slate-700 bg-[#0B1120]/95 text-slate-200 hover:bg-slate-900"
        }`}
      >
        <FlaskConical className={`h-3.5 w-3.5 ${activeRole ? "text-amber-400" : "text-sky-400"}`} />
        <span>Dev Mode: {activeLabel}</span>
      </button>
    </div>
  );
}
