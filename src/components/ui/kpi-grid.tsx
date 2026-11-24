import React from "react";
import { AlertTriangle, Lock } from "lucide-react";
import { FEATURE_META, type FeatureKey } from "@/lib/constants/saas";
import { Card, CardContent } from "./primitives";
import { StatTray } from "./spark";

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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <StatTray
          key={item.label}
          label={item.label}
          value={item.value}
          needles={item.sparkline}
          footnote={
            item.subtext ? (
              <span className={item.tone === "danger" ? "text-rose-600" : item.tone === "warning" ? "text-amber-700" : undefined}>
                {item.subtext}
              </span>
            ) : null
          }
        />
      ))}
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
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-12 text-center max-w-md mx-auto">
        <div className="h-10 w-10 rounded-xl bg-[#f1f1f2] flex items-center justify-center text-[#55555b] mb-3">
          <Lock className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-[#171717]">
          {title ?? meta.label} is not included in your access
        </h3>
        <p className="text-[13px] text-[#77777d] mt-1">{meta.description}</p>
        <p className="text-xs text-slate-500 mt-3">
          Ask your Nexus ERP administrator to unlock{" "}
          <span className="font-semibold text-slate-700">{meta.label}</span> or raise your tier.
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
        <h3 className="text-sm font-semibold text-[#171717]">{title}</h3>
        <p className="text-[13px] text-[#77777d] mt-1 max-w-sm">{description}</p>
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
      <a
        href="/"
        className="text-xs font-semibold underline text-amber-900 shrink-0"
      >
        Setup Guide
      </a>
    </div>
  );
}
