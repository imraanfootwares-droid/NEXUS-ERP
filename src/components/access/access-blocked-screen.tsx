"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CloudOff, LogOut, Mail, Phone, RefreshCw, ShieldCheck } from "lucide-react";
import { fetchAccessStatus, writeCachedBlock } from "@/lib/offline/access-block";
import { listOutboxEntries } from "@/lib/offline/sync-engine";
import type { AccessBlock } from "@/types/database";

const inr = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

function contactHref(contact: string): { href: string; email: boolean } | null {
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) return { href: `mailto:${contact}`, email: true };
  const digits = contact.replace(/[^\d+]/g, "");
  return digits.replace(/\D/g, "").length >= 10 ? { href: `tel:${digits}`, email: false } : null;
}

export function AccessBlockedScreen({
  block,
  tenantId,
  userId,
}: {
  block: AccessBlock;
  tenantId: string;
  userId: string;
}) {
  const [current, setCurrent] = useState(block);
  const [checking, setChecking] = useState(false);
  const [note, setNote] = useState("");
  const [offline, setOffline] = useState(false);
  const [heldCount, setHeldCount] = useState(0);

  const check = useCallback(
    async (manual: boolean) => {
      if (!navigator.onLine) {
        if (manual) setNote("You are offline. Connect to the internet to check again.");
        return;
      }
      if (manual) setChecking(true);
      const result = await fetchAccessStatus();
      if (manual) setChecking(false);
      if (!result.known) {
        if (manual) setNote("Could not reach the server. Please try again.");
        return;
      }
      writeCachedBlock(tenantId, userId, result.block);
      if (!result.block) {
        window.location.reload();
        return;
      }
      setCurrent(result.block);
      if (manual) setNote("Access is still paused.");
    },
    [tenantId, userId]
  );

  useEffect(() => {
    writeCachedBlock(tenantId, userId, block);
    listOutboxEntries(tenantId)
      .then((entries) => setHeldCount(entries.filter((e) => e.status !== "synced").length))
      .catch(() => undefined);

    const syncOnline = () => {
      setOffline(!navigator.onLine);
      void check(false);
    };
    // A blocked screen left open must not keep the free database awake.
    let lastCheck = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastCheck < 60_000) return;
      lastCheck = Date.now();
      void check(false);
    };
    const first = window.setTimeout(syncOnline, 0);
    const timer = window.setInterval(onVisible, 5 * 60_000);
    window.addEventListener("online", syncOnline);
    window.addEventListener("offline", syncOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("online", syncOnline);
      window.removeEventListener("offline", syncOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [block, check, tenantId, userId]);

  const signOut = async () => {
    await fetch("/api/auth", { method: "DELETE" }).catch(() => undefined);
    window.location.href = "/login";
  };

  const contact = current.contact ? contactHref(current.contact) : null;
  const ContactIcon = contact?.email ? Mail : Phone;

  return (
    <div className="spark-ui flex min-h-screen flex-col bg-[#fff5f5]">
      <div role="alert" className="no-print flex items-center justify-center gap-2 bg-rose-600 px-4 py-2.5 text-center text-[13px] font-medium text-white">
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        Payment required. Pay your bill or contact the administrator to continue working.
      </div>

      <main className="flex flex-1 items-center justify-center p-4">
        <div className="ui-rise w-full max-w-[460px] rounded-[18px] bg-rose-100 p-[3px] shadow-[0_24px_60px_-24px_rgba(225,29,72,.45)]">
          <div className="rounded-[15px] bg-white p-6 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-600 text-white shadow-[0_0_0_6px_#ffe4e6]">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <h1 className="mt-5">{current.scope === "business" ? "Your workspace is paused" : "Your account is paused"}</h1>
            <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#55555b]">
              {current.message || "Your access is on hold because of a pending payment. Please clear the bill to continue."}
            </p>

            {current.amountDue !== null && current.amountDue > 0 ? (
              <div className="mt-4 rounded-xl bg-rose-50 px-4 py-3">
                <p className="ui-eyebrow !text-rose-700">Amount Due</p>
                <p className="mt-0.5 font-mono text-[26px] font-semibold tracking-[-0.04em] text-rose-700">{inr(current.amountDue)}</p>
              </div>
            ) : null}

            <div className="mt-4 space-y-2">
              {contact ? (
                <a href={contact.href} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-rose-600 text-[13px] font-medium text-white transition-colors hover:bg-rose-700">
                  <ContactIcon className="h-4 w-4" aria-hidden="true" />
                  Contact to Pay: {current.contact}
                </a>
              ) : current.contact ? (
                <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700">Contact: {current.contact}</p>
              ) : (
                <p className="rounded-lg bg-rose-50 px-3 py-2.5 text-[13px] font-medium text-rose-700">Contact your Nexus ERP administrator to pay.</p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => void check(true)} disabled={checking} className="flex h-9 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white text-xs font-medium text-[#27272a] shadow-[0_0_0_1px_rgba(0,0,0,.1)] transition-colors hover:bg-[#fafafa] disabled:opacity-60">
                  <RefreshCw className={`h-3.5 w-3.5 ${checking ? "animate-spin" : ""}`} aria-hidden="true" />
                  I have paid, check again
                </button>
                <button type="button" onClick={signOut} className="flex h-9 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-white px-3 text-xs font-medium text-[#55555b] shadow-[0_0_0_1px_rgba(0,0,0,.1)] transition-colors hover:bg-[#fafafa]">
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  Sign Out
                </button>
              </div>
            </div>

            {note ? <p role="status" className="mt-2.5 text-xs text-[#77777d]">{note}</p> : null}
            {offline ? (
              <p className="mt-3 flex items-center justify-center gap-1.5 text-xs text-amber-700">
                <CloudOff className="h-3.5 w-3.5" aria-hidden="true" /> You are offline. This will update when you reconnect.
              </p>
            ) : null}
            <p className="mt-4 flex items-start justify-center gap-1.5 border-t border-[#f1f1f2] pt-3 text-[11.5px] text-[#77777d]">
              <ShieldCheck className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
              {heldCount > 0
                ? `Your data is safe. ${heldCount} offline ${heldCount === 1 ? "entry is" : "entries are"} saved and will sync after access returns.`
                : "Your data is safe and will be here when access returns."}
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
