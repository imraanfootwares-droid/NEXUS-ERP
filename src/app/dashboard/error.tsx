"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[DashboardError]", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#e5e5e7] bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-base font-semibold text-[#171717]">Could not load this page</h2>
        <p className="mt-1.5 text-xs text-[#71717a]">
          A temporary connection or server error happened. None of your bills or stock were lost. Click Try Again below.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-[11px] text-[#a1a1aa]">Reference: {error.digest}</p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-[#171717] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a2a2a]"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try Again
          </button>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#d4d4d8] bg-white px-4 py-2 text-xs font-semibold text-[#171717] hover:bg-[#fafafa]"
          >
            <Home className="h-3.5 w-3.5" /> Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
