"use client";

import React, { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * Sleek top-of-viewport navigation progress bar (like Linear / Vercel).
 * Triggers immediately on any internal link click so navigations never feel frozen.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (doneRef.current) {
      clearTimeout(doneRef.current);
      doneRef.current = null;
    }
  };

  useEffect(() => {
    // Route finished changing -> snap to 100% on next frame and fade out
    clearTimers();
    if (!visible) return;
    const raf = requestAnimationFrame(() => {
      setProgress(100);
      doneRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 220);
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
        return;
      }
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      const rawHref = anchor.getAttribute("href") ?? "";
      if (!rawHref.startsWith("/") || rawHref.startsWith("//")) return;

      const targetPath = rawHref.split("?")[0].split("#")[0];
      if (targetPath === pathname) return;

      clearTimers();
      setVisible(true);
      setProgress(22);
      timerRef.current = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 88) return prev;
          return prev + Math.max(2, (90 - prev) * 0.14);
        });
      }, 140);
    };

    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clearTimers();
    };
  }, [pathname]);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className="no-print fixed top-0 left-0 right-0 z-[100] h-[2px] pointer-events-none bg-transparent"
    >
      <div
        className="h-full bg-[#171717] transition-all duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
