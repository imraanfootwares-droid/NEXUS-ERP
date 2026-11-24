/**
 * Real sales time-series for the pixel trend chart.
 * All buckets are calendar buckets in IST and are zero-filled, so a quiet
 * period renders as an empty column rather than an invented value.
 */

export type TrendGrain = "day" | "week" | "month";
export type TrendPeriod = "Weekly" | "Monthly" | "Yearly";

export interface TrendBucketRow {
  grain: TrendGrain;
  bucket: string; // YYYY-MM-DD
  total: string | number;
  due: string | number;
  bills: string | number;
}

export interface TrendPoint {
  key: string;
  /** Full label for the tooltip, e.g. "12 Nov 2026". */
  label: string;
  /** Axis label, only set on the column that starts a new axis period. */
  tick: string | null;
  collected: number;
  outstanding: number;
  bills: number;
}

export type TrendSeries = Record<TrendPeriod, TrendPoint[]>;

const DAY_COLUMNS = 42;
const WEEK_COLUMNS = 52;
const MONTH_COLUMNS = 36;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * `$1` is the tenant id when `scoped`; platform-wide otherwise. `$2` is a branch id array when `branchScoped`.
 * The trend_buckets marker lets the dev mock database recognise this query.
 */
export function trendBucketsSql(scoped: boolean, branchScoped = false): string {
  return `/* trend_buckets */
    WITH base AS (
      SELECT (created_at AT TIME ZONE 'Asia/Kolkata') AS ts, grand_total, due_amount
      FROM public.invoices
      WHERE status NOT IN ('draft','cancelled') AND invoice_type = 'sale'
        AND created_at >= now() - interval '37 months'
        ${scoped ? "AND tenant_id = $1" : ""}
        ${branchScoped ? "AND branch_id = ANY($2::uuid[])" : ""}
    )
    SELECT grain, TO_CHAR(bucket, 'YYYY-MM-DD') AS bucket,
           SUM(grand_total)::text AS total, SUM(due_amount)::text AS due, COUNT(*)::text AS bills
    FROM (
      SELECT 'day' AS grain, date_trunc('day', ts) AS bucket, grand_total, due_amount
        FROM base WHERE ts >= (now() AT TIME ZONE 'Asia/Kolkata') - interval '${DAY_COLUMNS} days'
      UNION ALL
      SELECT 'week', date_trunc('week', ts), grand_total, due_amount
        FROM base WHERE ts >= (now() AT TIME ZONE 'Asia/Kolkata') - interval '${WEEK_COLUMNS + 1} weeks'
      UNION ALL
      SELECT 'month', date_trunc('month', ts), grand_total, due_amount FROM base
    ) buckets
    GROUP BY grain, bucket`;
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function istToday(now: Date): Date {
  const shifted = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

function fullDay(d: Date): string {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function buildTrendSeries(rows: TrendBucketRow[], now: Date = new Date()): TrendSeries {
  const lookup = new Map(rows.map((r) => [`${r.grain}:${r.bucket}`, r]));
  const point = (grain: TrendGrain, d: Date, label: string, tick: string | null): TrendPoint => {
    const key = isoDay(d);
    const row = lookup.get(`${grain}:${key}`);
    const total = Number(row?.total ?? 0);
    const outstanding = Math.min(total, Number(row?.due ?? 0));
    return {
      key,
      label,
      tick,
      collected: Math.max(0, total - outstanding),
      outstanding,
      bills: Number(row?.bills ?? 0),
    };
  };

  const today = istToday(now);

  const Weekly: TrendPoint[] = [];
  for (let i = DAY_COLUMNS - 1; i >= 0; i--) {
    const d = new Date(today.getTime() - i * DAY_MS);
    const tick = d.getUTCDay() === 1 ? `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]!.toUpperCase()}` : null;
    Weekly.push(point("day", d, fullDay(d), tick));
  }

  const monday = new Date(today.getTime() - ((today.getUTCDay() + 6) % 7) * DAY_MS);
  const Monthly: TrendPoint[] = [];
  let lastMonth = -1;
  for (let i = WEEK_COLUMNS - 1; i >= 0; i--) {
    const d = new Date(monday.getTime() - i * 7 * DAY_MS);
    const month = d.getUTCMonth();
    const tick = month !== lastMonth ? MONTHS[month]!.toUpperCase() : null;
    lastMonth = month;
    Monthly.push(point("week", d, `Week of ${fullDay(d)}`, tick));
  }

  const Yearly: TrendPoint[] = [];
  for (let i = MONTH_COLUMNS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
    const tick = d.getUTCMonth() === 0 || i === MONTH_COLUMNS - 1 ? String(d.getUTCFullYear()) : null;
    Yearly.push(point("month", d, `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, tick));
  }

  return { Weekly, Monthly, Yearly };
}

/** Percentage change, or null when there is no prior value to compare with. */
export function percentChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

/** Compact Indian notation: ₹950, ₹38k, ₹1.2L, ₹3.4Cr. */
export function formatCompactInr(value: number): string {
  const abs = Math.abs(value);
  const trim = (n: number) => n.toFixed(n >= 10 ? 0 : 1).replace(/\.0$/, "");
  if (abs >= 1e7) return `₹${trim(value / 1e7)}Cr`;
  if (abs >= 1e5) return `₹${trim(value / 1e5)}L`;
  if (abs >= 1e3) return `₹${trim(value / 1e3)}k`;
  return `₹${Math.round(value)}`;
}
