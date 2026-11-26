"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, Home, RefreshCw } from "lucide-react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RootError]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f6f6f7] p-6">
      <div className="w-full max-w-md rounded-2xl border border-[#e5e5e7] bg-white p-6 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-lg font-semibold text-[#171717]">Something went wrong</h1>
        <p className="mt-1.5 text-sm text-[#71717a]">
          This screen ran into an unexpected problem. Your saved shop data is safe — try reloading this screen.
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
            <Home className="h-3.5 w-3.5" /> Go to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
