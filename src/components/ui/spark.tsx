"use client";

import React, { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import type { TrendPeriod, TrendPoint, TrendSeries } from "@/lib/analytics/trend";
import { cn } from "./primitives";

/** Signature double-layer card: grey tray, label strip, raised white surface. */
export function TrayCard({
  title,
  hint,
  action,
  footer,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  hint?: string;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("ui-tray flex min-w-0 flex-col", className)}>
      {(title || action) && (
        <header className="flex min-h-[38px] flex-wrap items-center justify-between gap-2 px-3 py-1.5">
          <div className="ui-eyebrow flex items-center gap-1.5">
            <span>{title}</span>
            {hint && (
              <span title={hint} aria-label={hint} className="inline-flex">
                <Info className="h-3 w-3 text-[var(--ui-faint)]" />
              </span>
            )}
          </div>
          {action}
        </header>
      )}
      <div className={cn("ui-surface min-w-0 flex-1", bodyClassName)}>{children}</div>
      {footer && <footer className="px-3 py-1.5 text-[11px] text-[var(--ui-muted)]">{footer}</footer>}
    </section>
  );
}

/** Nine-needle sparkline: a quiet track with the real value filled in. */
export function MiniNeedles({ values, meter }: { values?: number[]; meter?: number }) {
  const series =
    meter !== undefined
      ? Array.from({ length: 9 }, (_, i) => (Math.min(100, meter) >= ((i + 1) / 9) * 100 || (i === 0 && meter > 0) ? 1 : 0))
      : values;
  if (!series || series.length === 0) return null;
  const max = Math.max(...series, 0);
  const peak = max > 0 ? series.lastIndexOf(max) : -1;
  return (
    <div className="flex h-10 shrink-0 items-end gap-[5px]" aria-hidden="true">
      {series.map((v, i) => (
        <span key={i} className="relative block h-full w-[2px] overflow-hidden rounded-full bg-[#ececee]">
          {v > 0 && (
            <span
              className="ui-needle-in absolute inset-x-0 bottom-0 rounded-full"
              style={{
                height: `${Math.max(18, (v / max) * 100)}%`,
                backgroundColor: i === peak || meter !== undefined ? "var(--ui-ink)" : "#a9a9ae",
                animationDelay: `${i * 26}ms`,
              }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

export function DeltaLabel({ change, suffix }: { change: number | null; suffix: string }) {
  if (change === null) return <span className="text-[var(--ui-muted)]">No earlier data</span>;
  const flat = Math.abs(change) < 0.05;
  const up = change > 0;
  return (
    <span className="inline-flex items-center gap-1">
      <span className={cn("font-mono font-medium tabular-nums", flat ? "text-[var(--ui-muted)]" : up ? "text-emerald-600" : "text-rose-600")}>
        {up ? "+" : ""}
        {change.toFixed(1)}%
      </span>
      <span className="text-[var(--ui-muted)]">{suffix}</span>
    </span>
  );
}

export function StatTray({
  label,
  value,
  unit,
  needles,
  meter,
  change,
  changeSuffix = "last month",
  footnote,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  needles?: number[];
  /** 0-100 capacity shown on the needles instead of a time series. */
  meter?: number;
  /** Pass a number or null to show a real comparison; omit to use `footnote`. */
  change?: number | null;
  changeSuffix?: string;
  footnote?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  const hasChange = change !== undefined;
  const TrendIcon = !hasChange || change === null || Math.abs(change) < 0.05 ? Minus : change > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="ui-tray ui-rise">
      <div className="ui-surface flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <p className="ui-eyebrow truncate">{label}</p>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="truncate font-mono text-[22px] font-semibold leading-none tracking-[-0.03em] text-[var(--ui-ink)] tabular-nums">
              {value}
            </span>
            {unit && <span className="truncate text-[11px] text-[var(--ui-muted)]">{unit}</span>}
          </div>
        </div>
        <MiniNeedles values={needles} meter={meter} />
      </div>
      <div className="flex min-h-[28px] items-center justify-between gap-2 px-3 py-1 text-[11px]">
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[var(--ui-line-strong)] text-white">
          {icon ?? <TrendIcon className="h-2.5 w-2.5" strokeWidth={2.6} />}
        </span>
        <span className="min-w-0 truncate text-right text-[var(--ui-muted)]">
          {hasChange ? <DeltaLabel change={change ?? null} suffix={changeSuffix} /> : footnote}
        </span>
      </div>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full bg-[var(--ui-tray)] p-[3px] text-[11.5px]">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          aria-pressed={o === value}
          onClick={() => onChange(o)}
          className={cn(
            "cursor-pointer rounded-full px-3 py-1 font-medium transition-all duration-200",
            o === value
              ? "bg-white text-[var(--ui-ink)] shadow-[0_1px_2px_rgba(0,0,0,.08),0_0_0_1px_rgba(0,0,0,.03)]"
              : "text-[var(--ui-muted)] hover:text-[var(--ui-ink)]"
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

const ROWS = 22;
const RANGE_LABEL: Record<TrendPeriod, string> = {
  Weekly: "Last 6 weeks, by day",
  Monthly: "Last 12 months, by week",
  Yearly: "Last 3 years, by month",
};

function niceCeiling(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 1.5, 2, 3, 4, 5, 6, 8, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

function axisGroups(points: TrendPoint[]) {
  const groups: Array<{ label: string; start: number; count: number }> = [];
  points.forEach((p, i) => {
    if (p.tick || groups.length === 0) groups.push({ label: p.tick ?? "", start: i, count: 1 });
    else groups[groups.length - 1]!.count += 1;
  });
  return groups;
}

/** Pixel matrix: each column is a real time bucket, stacked collected + outstanding. */
export function PixelTrendChart({
  series,
  format,
  primaryLabel = "Collected",
  secondaryLabel = "Outstanding",
  headline = "Total Billed",
}: {
  series: TrendSeries;
  format: (n: number) => string;
  primaryLabel?: string;
  secondaryLabel?: string;
  headline?: string;
}) {
  const [period, setPeriod] = useState<TrendPeriod>("Monthly");
  const [hover, setHover] = useState<number | null>(null);
  const points = series[period];

  const { ceiling, total, latest } = useMemo(() => {
    const totals = points.map((p) => p.collected + p.outstanding);
    let last = -1;
    totals.forEach((t, i) => {
      if (t > 0) last = i;
    });
    return {
      ceiling: niceCeiling(Math.max(...totals, 0)),
      total: totals.reduce((a, b) => a + b, 0),
      latest: last,
    };
  }, [points]);

  const activeIdx = hover ?? (latest >= 0 ? latest : null);
  const active: TrendPoint | null = activeIdx === null ? null : points[activeIdx] ?? null;
  const leftPct = activeIdx === null ? 0 : ((activeIdx + 0.5) / points.length) * 100;
  const flip = leftPct > 68;
  const activeTop = active
    ? 100 - Math.min(100, ((active.collected + active.outstanding) / ceiling) * 100)
    : 0;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const from = activeIdx ?? points.length - 1;
    const next = e.key === "ArrowLeft" ? from - 1 : from + 1;
    setHover(Math.max(0, Math.min(points.length - 1, next)));
  };

  return (
    <div className="flex h-full flex-col p-4 sm:px-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5">
        <div>
          <div className="flex items-baseline gap-2.5">
            <span className="text-[11.5px] text-[var(--ui-muted)]">{headline} :</span>
            <span className="font-mono text-[20px] font-semibold tracking-[-0.03em] text-[var(--ui-ink)] tabular-nums">
              {format(total)}
            </span>
          </div>
          <p className="mt-0.5 text-[10.5px] text-[var(--ui-faint)]">{RANGE_LABEL[period]}</p>
        </div>
        <div className="ui-eyebrow flex items-center gap-4">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ui-pixel-mid)]" />
            {secondaryLabel}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--ui-ink)]" />
            {primaryLabel}
          </span>
        </div>
        <Segmented
          label="Chart period"
          options={["Weekly", "Monthly", "Yearly"] as const}
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setHover(null);
          }}
        />
      </div>

      <div className="flex min-h-0 flex-1 gap-2.5">
        <div className="hidden w-11 shrink-0 flex-col justify-between pb-5 text-right font-mono text-[10px] text-[var(--ui-faint)] sm:flex" aria-hidden="true">
          {[1, 0.75, 0.5, 0.25, 0].map((f) => (
            <span key={f} className="flex items-center justify-end gap-1 leading-none">
              {f === 0 ? "0" : format(ceiling * f)}
              <span className="h-[3px] w-[3px] rounded-full bg-[var(--ui-line-strong)]" />
            </span>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <div
            key={period}
            role="img"
            tabIndex={0}
            onKeyDown={onKeyDown}
            onMouseLeave={() => setHover(null)}
            aria-label={`${headline} ${period.toLowerCase()} chart. Total ${format(total)}.${
              active ? ` ${active.label}: ${primaryLabel} ${format(active.collected)}, ${secondaryLabel} ${format(active.outstanding)}.` : ""
            } Use left and right arrow keys to explore.`}
            className="relative grid h-[260px] rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ui-ink)] sm:h-[300px]"
            style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))`, columnGap: 2 }}
          >
            {points.map((p, i) => {
              const value = p.collected + p.outstanding;
              const filled = value > 0 ? Math.max(1, Math.round((value / ceiling) * ROWS)) : 0;
              const dark = p.collected > 0 ? Math.max(1, Math.round((p.collected / value) * filled)) : 0;
              return (
                <div
                  key={p.key}
                  onMouseEnter={() => setHover(i)}
                  className="ui-pixel-col flex cursor-crosshair flex-col-reverse gap-[2px]"
                  style={{ animationDelay: `${Math.min(i * 9, 420)}ms` }}
                >
                  {Array.from({ length: ROWS }, (_, row) => (
                    <span
                      key={row}
                      className="min-h-0 flex-1 rounded-[1.5px] transition-colors duration-100"
                      style={{
                        backgroundColor:
                          row < dark
                            ? "var(--ui-ink)"
                            : row < filled
                            ? "var(--ui-pixel-mid)"
                            : activeIdx === i
                            ? "var(--ui-pixel-hover)"
                            : "var(--ui-pixel-empty)",
                      }}
                    />
                  ))}
                </div>
              );
            })}

            {total === 0 && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <span className="rounded-lg bg-white px-3 py-1.5 text-xs text-[var(--ui-muted)] shadow-[0_2px_10px_rgba(0,0,0,.08),0_0_0_1px_rgba(0,0,0,.05)]">
                  No bills in this period
                </span>
              </div>
            )}

            {active && total > 0 && (
              <>
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 border-l border-dashed border-[var(--ui-muted)] transition-[left] duration-100"
                  style={{ left: `${leftPct}%` }}
                />
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--ui-ink)] ring-2 ring-white transition-all duration-100"
                  style={{ left: `${leftPct}%`, top: `${activeTop}%` }}
                />
                <div
                  className="pointer-events-none absolute z-10 w-[176px] rounded-[10px] bg-white p-1 text-[11.5px] shadow-[0_10px_28px_rgba(0,0,0,.13),0_0_0_1px_rgba(0,0,0,.06)] transition-[left] duration-100"
                  style={{
                    left: flip ? `calc(${leftPct}% - 188px)` : `calc(${leftPct}% + 12px)`,
                    top: `clamp(4px, calc(${activeTop}% - 30px), calc(100% - 104px))`,
                  }}
                >
                  <p className="truncate rounded-md bg-[var(--ui-tray)] px-2 py-1 text-[var(--ui-muted)]">{active.label}</p>
                  <dl className="space-y-1 px-2 py-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <dt className="inline-flex items-center gap-1.5 text-[var(--ui-muted)]">
                        <span className="h-1 w-1 rounded-full bg-[var(--ui-pixel-mid)]" />
                        {secondaryLabel}
                      </dt>
                      <dd className="font-mono font-semibold text-[var(--ui-ink)]">{format(active.outstanding)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <dt className="inline-flex items-center gap-1.5 text-[var(--ui-muted)]">
                        <span className="h-1 w-1 rounded-full bg-[var(--ui-ink)]" />
                        {primaryLabel}
                      </dt>
                      <dd className="font-mono font-semibold text-[var(--ui-ink)]">{format(active.collected)}</dd>
                    </div>
                  </dl>
                </div>
              </>
            )}
          </div>

          <div className="mt-2 flex h-3 text-[10px] tracking-[0.04em] text-[var(--ui-faint)]" aria-hidden="true">
            {axisGroups(points).map((g, i) => {
              const isActive = activeIdx !== null && activeIdx >= g.start && activeIdx < g.start + g.count;
              return (
                <span
                  key={g.start}
                  className={`relative min-w-0 overflow-hidden whitespace-nowrap text-center leading-none ${isActive ? "font-semibold text-[var(--ui-ink)]" : ""}`}
                  style={{ flex: `${g.count} 1 0%` }}
                >
                  {g.count >= 2 ? g.label : ""}
                  {i > 0 && <span className="absolute left-0 top-1/2 h-[2px] w-[2px] -translate-y-1/2 rounded-full bg-[var(--ui-line-strong)]" />}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface NeedleItem {
  label: string;
  /** Short axis label; shown under each bar when every item has one. */
  short?: string;
  /** Solid black portion. */
  value: number;
  /** Light portion stacked above the black. */
  extra?: number;
}

/** Stacked needle bars with dotted guides and an always-visible readout. */
export function NeedleChart({
  items,
  format,
  emptyMessage = "Nothing to show yet",
  height = 214,
  max: fixedMax,
  valueLabel,
  extraLabel,
}: {
  items: NeedleItem[];
  format: (n: number) => string;
  emptyMessage?: string;
  height?: number;
  max?: number;
  valueLabel?: string;
  extraLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const totals = items.map((i) => i.value + (i.extra ?? 0));
  const largest = Math.max(...totals, 0);
  const max = fixedMax ?? largest;
  if (items.length === 0 || largest === 0) {
    return (
      <div className="flex items-center justify-center text-xs text-[var(--ui-muted)]" style={{ height }}>
        {emptyMessage}
      </div>
    );
  }
  const shownIdx = hover ?? totals.lastIndexOf(largest);
  const shown = items[shownIdx]!;
  const showShort = items.every((i) => i.short);
  return (
    <div>
      <div className="mb-2.5 flex min-h-[34px] items-center justify-between gap-2 rounded-lg bg-[var(--ui-tray)] px-2.5 py-1.5" aria-live="polite">
        <span className="min-w-0 truncate text-[11.5px] text-[var(--ui-text)]">{shown.label}</span>
        <span className="flex shrink-0 items-center gap-2 font-mono text-[11.5px] font-semibold text-[var(--ui-ink)]">
          {format(shown.value)}
          {shown.extra ? <span className="font-normal text-[var(--ui-muted)]">+{format(shown.extra)}</span> : null}
        </span>
      </div>
      <div className="relative" style={{ height }} onMouseLeave={() => setHover(null)}>
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((g) => (
            <span key={g} className="block border-t border-dotted border-[var(--ui-line-strong)]" />
          ))}
        </div>
        <div className="relative flex h-full items-end justify-between gap-0.5">
          {items.map((item, i) => {
            const dim = hover !== null && hover !== i;
            return (
              <button
                key={`${item.label}-${i}`}
                type="button"
                aria-label={`${item.label}: ${format(item.value)}${item.extra ? ` plus ${format(item.extra)}` : ""}`}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                className="flex h-full flex-1 cursor-pointer flex-col items-center justify-end rounded-sm transition-colors hover:bg-black/[0.025] focus-visible:outline-1 focus-visible:outline-[var(--ui-ink)]"
              >
                <span
                  className="ui-needle-in flex w-[5px] flex-col overflow-hidden rounded-t-[2px] transition-opacity duration-150"
                  style={{
                    height: `${Math.max(1.5, (totals[i]! / max) * 100)}%`,
                    opacity: dim ? 0.3 : 1,
                    animationDelay: `${i * 34}ms`,
                  }}
                >
                  {item.extra ? <span className="block bg-[var(--ui-pixel-mid)]" style={{ flex: item.extra }} /> : null}
                  <span className="block bg-[var(--ui-ink)]" style={{ flex: Math.max(item.value, item.extra ? 0 : 1) }} />
                </span>
              </button>
            );
          })}
        </div>
      </div>
      {showShort ? (
        <div className="mt-2 flex justify-between gap-0.5 font-mono text-[8.5px] tracking-[0.02em] text-[var(--ui-faint)]" aria-hidden="true">
          {items.map((item, i) => (
            <span key={item.label} className={`flex-1 truncate text-center ${i === shownIdx ? "font-semibold text-[var(--ui-ink)]" : ""}`}>
              {item.short}
            </span>
          ))}
        </div>
      ) : (
        <div className="mt-2 flex justify-between gap-2 text-[10px] tracking-[0.04em] text-[var(--ui-faint)]">
          <span className="truncate">{items[0]!.label}</span>
          {items.length > 1 && <span className="truncate">{items[items.length - 1]!.label}</span>}
        </div>
      )}
      {(valueLabel || extraLabel) && (
        <div className="ui-eyebrow mt-2.5 flex items-center gap-3 !text-[9.5px]">
          {valueLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ui-ink)]" />
              {valueLabel}
            </span>
          )}
          {extraLabel && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ui-pixel-mid)]" />
              {extraLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral";
  children: React.ReactNode;
}) {
  const styles = {
    success: "text-emerald-700 [--dot:#10b981]",
    warning: "text-amber-700 [--dot:#f59e0b]",
    danger: "text-rose-700 [--dot:#f43f5e]",
    neutral: "text-[var(--ui-muted)] [--dot:#a1a1aa]",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-2.5 py-[3px] text-[11px] font-medium capitalize shadow-[0_0_0_1px_rgba(0,0,0,.07),0_1px_2px_rgba(0,0,0,.04)]",
        styles[tone]
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--dot)]" />
      {children}
    </span>
  );
}
