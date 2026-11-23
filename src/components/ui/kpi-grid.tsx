import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Lock, MoreHorizontal } from "lucide-react";
import { FEATURE_META, type FeatureKey } from "@/lib/constants/saas";
import { Card, CardContent } from "./primitives";

const DEFAULT_SPARKLINES: number[][] = [
  [18, 28, 22, 42, 34, 52, 48],
  [22, 30, 44, 38, 56, 50, 68],
  [48, 36, 52, 60, 40, 44, 24],
  [44, 34, 48, 58, 42, 46, 22],
];

function SparklineSvg({
  points,
  positive,
  gradId,
}: {
  points: number[];
  positive: boolean;
  gradId: string;
}) {
  const w = 220;
  const h = 48;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = Math.max(max - min, 1);
  const coords = points.map((p, i) => {
    const x = (i / Math.max(points.length - 1, 1)) * w;
    const y = h - 6 - ((p - min) / span) * (h - 14);
    return { x, y };
  });

  const linePath = coords
    .map((c, i) => {
      if (i === 0) return `M ${c.x} ${c.y}`;
      const prev = coords[i - 1];
      const cx = (prev.x + c.x) / 2;
      return `C ${cx} ${prev.y}, ${cx} ${c.y}, ${c.x} ${c.y}`;
    })
    .join(" ");

  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;
  const stroke = positive ? "#16a34a" : "#e11d48";
  const stopColor = positive ? "#22c55e" : "#f43f5e";

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12 overflow-visible mt-2" preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stopColor} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stopColor} stopOpacity="0.01" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}

export function KpiGrid({
  items,
}: {
  items: Array<{
    label: string;
    value: string | number;
    subtext?: string;
    tone?: "default" | "success" | "warning" | "danger" | "info";
    icon?: React.ReactNode;
    trend?: "up" | "down";
    sparkline?: number[];
  }>;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
      {items.map((item, idx) => {
        const isNegative = item.trend === "down" || item.tone === "danger" || item.tone === "warning";
        const points = item.sparkline ?? DEFAULT_SPARKLINES[idx % DEFAULT_SPARKLINES.length];
        const safeId = `spark-${idx}-${item.label.replace(/[^a-zA-Z0-9]/g, "")}`;
        return (
          <Card key={item.label} className="overflow-hidden hover:border-slate-300/90 transition-colors">
            <CardContent className="p-4 pb-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {item.icon && (
                    <span className="h-7 w-7 rounded-lg bg-slate-100 text-[#4B5A94] flex items-center justify-center shrink-0">
                      {item.icon}
                    </span>
                  )}
                  <p className="text-xs font-semibold text-slate-600 truncate">
                    {item.label}
                  </p>
                </div>
                <MoreHorizontal className="h-4 w-4 text-slate-400 shrink-0" />
              </div>

              <div className="mt-3 flex items-baseline gap-1.5">
                <p className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900 font-display tabular-nums">
                  {item.value}
                </p>
                {isNegative ? (
                  <ArrowDownRight className="h-4 w-4 text-rose-500 shrink-0" />
                ) : (
                  <ArrowUpRight className="h-4 w-4 text-emerald-600 shrink-0" />
                )}
              </div>

              {item.subtext && (
                <p className={`mt-0.5 text-[11px] font-medium truncate ${isNegative ? "text-rose-600" : "text-emerald-600"}`}>
                  {item.subtext}
                </p>
              )}

              <SparklineSvg points={points} positive={!isNegative} gradId={safeId} />
              <div className="flex justify-between text-[9px] text-slate-400 mt-1 px-0.5">
                <span>W1</span>
                <span>W2</span>
                <span>W3</span>
                <span className="font-semibold text-slate-600">Now</span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export function TierLockOverlay({
  featureKey,
  title,
}: {
  featureKey: FeatureKey;
  title?: string;
}) {
  const meta = FEATURE_META[featureKey];
  return (
    <Card className="border-dashed border-2 border-slate-300 bg-slate-50/70">
      <CardContent className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
        <div className="h-12 w-12 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 mb-3">
          <Lock className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-900">
          {title ?? meta.label} is not active on your plan
        </h3>
        <p className="text-sm text-slate-600 mt-1">{meta.description}</p>
        <p className="text-xs text-slate-500 mt-3">
          Ask your Nexus ERP Application Owner to unlock{" "}
          <span className="font-semibold text-slate-700">{meta.label}</span> or upgrade your Tier.
        </p>
      </CardContent>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center">
        {icon && <div className="text-slate-400 mb-3">{icon}</div>}
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-500 mt-1 max-w-sm">{description}</p>
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  );
}

export function SetupBanner({ missing }: { missing: string[] }) {
  if (missing.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Environment configuration required</p>
          <p className="text-xs text-amber-800 mt-0.5">
            Missing variables in <code>.env.local</code>: {missing.join(", ")}. See{" "}
            <code>.env.example</code> and <code>README.md</code>.
          </p>
        </div>
      </div>
      <Link
        href="/"
        className="text-xs font-semibold underline text-amber-900 shrink-0"
      >
        Setup Guide
      </Link>
    </div>
  );
}
