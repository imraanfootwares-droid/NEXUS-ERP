import React from "react";

function Pulse({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-xl bg-slate-200/75 ${className}`} />;
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <Pulse className="h-7 w-52" />
          <Pulse className="h-4 w-80 max-w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Pulse className="h-9 w-24 rounded-xl" />
          <Pulse className="h-9 w-32 rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
            <div className="flex items-center justify-between">
              <Pulse className="h-4 w-24" />
              <Pulse className="h-7 w-7 rounded-lg" />
            </div>
            <Pulse className="h-8 w-28" />
            <Pulse className="h-10 w-full rounded-lg" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Pulse className="h-10 w-64 rounded-xl" />
        <Pulse className="h-10 w-72 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-4 space-y-3">
            <div className="flex items-center gap-3">
              <Pulse className="h-14 w-14 rounded-xl shrink-0" />
              <div className="flex-1 space-y-2">
                <Pulse className="h-4 w-36" />
                <Pulse className="h-3 w-24" />
              </div>
            </div>
            <Pulse className="h-2 w-full rounded-full" />
            <div className="grid grid-cols-3 gap-2">
              <Pulse className="h-12 rounded-xl" />
              <Pulse className="h-12 rounded-xl" />
              <Pulse className="h-12 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlatformTenantsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-2">
          <Pulse className="h-7 w-56" />
          <Pulse className="h-4 w-96 max-w-full" />
        </div>
        <Pulse className="h-10 w-44 rounded-xl" />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Pulse className="h-10 w-72 rounded-xl" />
        <Pulse className="h-10 w-80 rounded-xl" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Pulse className="h-11 w-11 rounded-xl" />
                <div className="space-y-2">
                  <Pulse className="h-4 w-36" />
                  <Pulse className="h-3 w-24" />
                </div>
              </div>
              <Pulse className="h-6 w-16 rounded-full" />
            </div>
            <div className="space-y-2.5">
              <Pulse className="h-2.5 w-full rounded-full" />
              <Pulse className="h-2.5 w-4/5 rounded-full" />
            </div>
            <div className="flex items-center justify-between pt-2 border-t border-slate-100">
              <Pulse className="h-4 w-20" />
              <Pulse className="h-8 w-32 rounded-xl" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TenantStudioSkeleton() {
  return (
    <div className="space-y-6">
      <div className="rounded-3xl bg-slate-900/95 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-2xl bg-slate-800 animate-pulse" />
            <div className="space-y-2">
              <div className="h-6 w-52 rounded-lg bg-slate-800 animate-pulse" />
              <div className="h-4 w-64 rounded-lg bg-slate-800 animate-pulse" />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="h-10 w-40 rounded-xl bg-slate-800 animate-pulse" />
            <div className="h-10 w-36 rounded-xl bg-slate-800 animate-pulse" />
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-2xl bg-slate-800/70 animate-pulse" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Pulse key={i} className="h-28 rounded-2xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Pulse key={i} className="h-36 rounded-2xl" />
        ))}
      </div>
    </div>
  );
}
