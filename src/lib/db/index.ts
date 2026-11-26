import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from "pg";
import { env, isConfigured } from "@/lib/env";
import { createMockClient, mockQuery } from "@/lib/dev/mock-db";
import { DEV_ROLE_COOKIE, isDevPreviewAllowed, parseDevPreviewRole } from "@/lib/dev/preview";

declare global {
  var __nexusPgPool: Pool | undefined;
}

async function shouldUseMockDb(): Promise<boolean> {
  if (!isDevPreviewAllowed()) return false;
  if (!isConfigured.db) return true;
  try {
    const { cookies } = await import("next/headers");
    const store = await cookies();
    return Boolean(parseDevPreviewRole(store.get(DEV_ROLE_COOKIE)?.value));
  } catch {
    return false;
  }
}

function isWorkersRuntime(): boolean {
  return (
    typeof navigator !== "undefined" &&
    navigator.userAgent === "Cloudflare-Workers"
  );
}

function createPool(max = 10): Pool {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max,
    idleTimeoutMillis: isWorkersRuntime() ? 5_000 : 20_000,
    connectionTimeoutMillis: 10_000,
    ssl: env.DATABASE_URL.includes("localhost") || env.DATABASE_URL.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  });
  // Handle idle socket closes gracefully when Neon computes scale to zero
  pool.on("error", (err) => {
    console.warn("[db] Idle PostgreSQL client error (recovered automatically):", err.message);
  });
  return pool;
}

export function getPool(): Pool {
  if (isWorkersRuntime()) {
    return createPool(1);
  }
  if (!globalThis.__nexusPgPool) {
    globalThis.__nexusPgPool = createPool();
  }
  return globalThis.__nexusPgPool;
}

export interface DbContext {
  tenantId: string | null;
  isPlatformAdmin: boolean;
}

/**
 * Wraps a pg PoolClient so concurrent `Promise.all([client.query(...), ...])`
 * calls execute one at a time on the single connection, avoiding pg's
 * concurrent-query deprecation warning (and pg@9 error).
 */
function serializeClientQueries(client: PoolClient): PoolClient {
  let tail: Promise<unknown> = Promise.resolve();
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === "query") {
        return (...args: Parameters<PoolClient["query"]>) => {
          const run = () => (target.query as (...a: unknown[]) => Promise<unknown>)(...args);
          const next = tail.then(run, run);
          tail = next.catch(() => undefined);
          return next;
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

/**
 * Execute a callback inside a PostgreSQL transaction with transaction-local
 * RLS GUC context (`set_config(..., true)` — safe with Neon PgBouncer pooling).
 */
export async function withTenantTx<T>(
  ctx: DbContext,
  fn: (client: PoolClient) => Promise<T>,
  options?: { snapshot?: boolean }
): Promise<T> {
  if (await shouldUseMockDb()) {
    return fn(createMockClient());
  }
  const workers = isWorkersRuntime();
  const pool = workers ? createPool(1) : getPool();
  const rawClient = await pool.connect();
  const client = serializeClientQueries(rawClient);
  // A snapshot gives exports one consistent view without blocking people who are billing.
  await client.query(options?.snapshot ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
  await client.query(
    "SELECT set_config('app.tenant_id', $1, true), set_config('app.is_platform_admin', $2, true)",
    [ctx.tenantId ?? "", ctx.isPlatformAdmin ? "true" : "false"]
  );
  try {
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    rawClient.release();
    if (workers) {
      await pool.end().catch(() => undefined);
    }
  }
}

export async function withPlatformTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  return withTenantTx({ tenantId: null, isPlatformAdmin: true }, fn);
}

/**
 * Execute a single parameterized query without tenant context (only for
 * SECURITY DEFINER pre-auth lookup RPCs or platform_settings).
 */
export async function query<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  if (await shouldUseMockDb()) {
    return mockQuery<T>(sql, params);
  }
  if (isWorkersRuntime()) {
    const pool = createPool(1);
    try {
      return await pool.query<T>(sql, params);
    } finally {
      await pool.end().catch(() => undefined);
    }
  }
  return getPool().query<T>(sql, params);
}

export async function checkDbHealth(): Promise<{ ok: boolean; latencyMs: number; sizeBytes?: number; error?: string }> {
  const start = Date.now();
  try {
    const res = await query<{ size_bytes: string }>(
      "SELECT pg_database_size(current_database())::text AS size_bytes"
    );
    return {
      ok: true,
      latencyMs: Date.now() - start,
      sizeBytes: Number(res.rows[0]?.size_bytes ?? 0),
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Database unreachable",
    };
  }
}
