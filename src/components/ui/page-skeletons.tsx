import React from "react";

function Bone({ className = "", style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={`ui-skeleton ${className}`} style={style} />;
}

/** Deterministic wave so the server and client render the same loader. */
export function PixelLoader({ columns = 14, rows = 7 }: { columns?: number; rows?: number }) {
  return (
    <div
      className="ui-pixel-loader grid gap-[2px]"
      style={{ gridTemplateColumns: `repeat(${columns}, 7px)`, gridAutoRows: 7 }}
      role="status"
      aria-label="Loading"
    >
      {Array.from({ length: columns * rows }, (_, i) => {
        const col = i % columns;
        const row = Math.floor(i / columns);
        return <span key={i} style={{ animationDelay: `${col * 62 + (rows - row) * 34}ms` }} />;
      })}
    </div>
  );
}

function StatSkeleton() {
  return (
    <div className="ui-tray">
      <div className="ui-surface flex items-center justify-between px-4 py-3.5">
        <div className="space-y-2.5">
          <Bone className="h-2.5 w-24" />
          <Bone className="h-5 w-28" />
        </div>
        <div className="flex h-9 items-end gap-[3px]">
          {[40, 62, 34, 78, 52, 100, 46, 30].map((h, i) => (
            <Bone key={i} className="w-[2px]" style={{ height: `${h}%` }} />
          ))}
        </div>
      </div>
      <div className="flex h-7 items-center justify-between px-3">
        <Bone className="h-3 w-3 rounded-full" />
        <Bone className="h-2.5 w-20" />
      </div>
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="ui-tray flex min-w-0 flex-col">
      <div className="flex h-[38px] items-center justify-between px-3">
        <Bone className="h-2.5 w-28" />
        <Bone className="h-5 w-5 rounded-full" />
      </div>
      <div className="ui-surface flex h-[344px] flex-col gap-4 p-4 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <Bone className="h-5 w-40" />
          <Bone className="hidden h-7 w-44 rounded-full sm:block" />
        </div>
        <div className="flex flex-1 items-center justify-center rounded-md bg-[#fafafa]">
          <PixelLoader columns={22} rows={9} />
        </div>
      </div>
    </div>
  );
}

function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="ui-tray">
      <div className="flex h-[42px] items-center justify-between gap-3 px-3">
        <Bone className="h-2.5 w-36" />
        <Bone className="h-7 w-44 rounded-lg" />
      </div>
      <div className="ui-surface divide-y divide-[#f1f1f2]">
        {Array.from({ length: rows + 1 }, (_, i) => (
          <div key={i} className="flex h-[42px] items-center gap-6 px-4">
            <Bone className="h-2.5 w-14" />
            <Bone className="h-2.5 flex-1 max-w-44" />
            <Bone className="hidden h-2.5 w-28 md:block" />
            <Bone className={`hidden w-16 md:block ${i === 0 ? "h-2.5" : "h-5 rounded-full"}`} />
            <Bone className="ml-auto h-2.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
      <Bone className="h-7 w-56" />
      <div className="flex gap-2">
        <Bone className="h-8 w-24 rounded-lg" />
        <Bone className="h-8 w-28 rounded-lg" />
      </div>
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="ui-page space-y-4" aria-busy="true">
      <HeaderSkeleton />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,2.15fr)_minmax(0,1fr)]">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>
      <TableSkeleton />
    </div>
  );
}

export function PlatformTenantsSkeleton() {
  return (
    <div className="ui-page space-y-4" aria-busy="true">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
      <TableSkeleton rows={8} />
    </div>
  );
}

export function TenantStudioSkeleton() {
  return (
    <div className="ui-page space-y-4" aria-busy="true">
      <Bone className="h-6 w-32 rounded-full" />
      <div className="flex items-center gap-3">
        <Bone className="h-11 w-11 rounded-xl" />
        <div className="space-y-2">
          <Bone className="h-5 w-52" />
          <Bone className="h-3 w-72 max-w-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <StatSkeleton key={i} />
        ))}
      </div>
      <Bone className="h-9 w-96 max-w-full rounded-full" />
      <TableSkeleton rows={7} />
    </div>
  );
}

/** Compact row placeholder for data loading inside dialogs and panels. */
export function InlineRowsSkeleton({ rows = 4, label }: { rows?: number; label: string }) {
  return (
    <div className="space-y-2.5 py-1" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Bone className="h-7 w-7 shrink-0 rounded-lg" />
          <Bone className="h-2.5 flex-1" style={{ maxWidth: `${72 - i * 9}%` }} />
          <Bone className="ml-auto h-2.5 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Shown while a signed-in layout resolves the session on first entry. */
export function AppBootSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <PixelLoader />
        <p className="ui-eyebrow">Loading workspace</p>
      </div>
    </div>
  );
}
