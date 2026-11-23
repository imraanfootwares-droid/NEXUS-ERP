import { openDB, type IDBPDatabase } from "idb";

export type OutboxOp =
  | "create_invoice"
  | "quick_customer"
  | "collect_due"
  | "adjust_stock"
  | "record_production"
  | "receive_transfer";

export type OutboxStatus = "pending" | "syncing" | "conflict" | "synced";

export interface OutboxEntry<T = Record<string, unknown>> {
  idempotency_key: string;
  tenant_id: string;
  branch_id: string;
  user_id: string;
  device_id: string;
  device_seq?: number;
  op: OutboxOp;
  payload: T;
  created_at: string;
  status: OutboxStatus;
  error?: string;
}

export interface OfflineCatalogSnapshot {
  cache_key: string; // `${tenant_id}:${branch_id}`
  tenant_id: string;
  branch_id: string;
  synced_at: string;
  products: Array<Record<string, unknown>>;
  variants: Array<Record<string, unknown>>;
  stock: Array<{ variant_id: string; quantity: number }>;
  customers: Array<Record<string, unknown>>;
  hsn_codes: Array<Record<string, unknown>>;
  bill_template: Record<string, unknown> | null;
}

export interface RegisteredDeviceState {
  key: string; // `${tenant_id}:${branch_id}`
  device_id: string;
  device_no: number;
  next_seq: number;
  branch_code: string;
}

const DB_NAME = "nexus-erp-offline";
const DB_VERSION = 1;

async function getOfflineDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("catalog_cache")) {
        db.createObjectStore("catalog_cache", { keyPath: "cache_key" });
      }
      if (!db.objectStoreNames.contains("outbox_queue")) {
        const store = db.createObjectStore("outbox_queue", { keyPath: "idempotency_key" });
        store.createIndex("by_created_at", "created_at");
        store.createIndex("by_status", "status");
      }
      if (!db.objectStoreNames.contains("devices")) {
        db.createObjectStore("devices", { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains("drafts")) {
        db.createObjectStore("drafts", { keyPath: "key" });
      }
    },
  });
}

export async function saveCatalogSnapshot(snapshot: OfflineCatalogSnapshot): Promise<void> {
  const db = await getOfflineDb();
  await db.put("catalog_cache", snapshot);
}

export async function getCatalogSnapshot(
  tenantId: string,
  branchId: string
): Promise<OfflineCatalogSnapshot | undefined> {
  const db = await getOfflineDb();
  return db.get("catalog_cache", `${tenantId}:${branchId}`);
}

/** Called on logout: clears PII/catalog cache while preserving pending outbox entries. */
export async function clearCatalogCacheOnLogout(): Promise<void> {
  const db = await getOfflineDb();
  await db.clear("catalog_cache");
  await db.clear("drafts");
}

export async function getDeviceState(
  tenantId: string,
  branchId: string
): Promise<RegisteredDeviceState | undefined> {
  const db = await getOfflineDb();
  return db.get("devices", `${tenantId}:${branchId}`);
}

export async function saveDeviceState(state: RegisteredDeviceState): Promise<void> {
  const db = await getOfflineDb();
  await db.put("devices", state);
}

/**
 * Allocates the next sequential offline GST invoice number for this device
 * formatted strictly within 16 characters: `{BR}{dev}/{FY}/{seq4}` (e.g. `CHN1/26-27/0001`).
 */
export async function allocateNextOfflineInvoiceNumber(
  tenantId: string,
  branchId: string,
  fyCode: string
): Promise<{ invoiceNumber: string; deviceId: string; deviceSeq: number }> {
  const db = await getOfflineDb();
  const key = `${tenantId}:${branchId}`;
  const dev = (await db.get("devices", key)) as RegisteredDeviceState | undefined;
  if (!dev) {
    throw new Error("Device is not registered for offline billing on this branch.");
  }
  const seq = dev.next_seq;
  await db.put("devices", { ...dev, next_seq: seq + 1 });
  const prefix = `${dev.branch_code.slice(0, 4).toUpperCase()}${dev.device_no}`;
  const seqStr = String(seq).padStart(4, "0");
  return {
    invoiceNumber: `${prefix}/${fyCode}/${seqStr}`,
    deviceId: dev.device_id,
    deviceSeq: seq,
  };
}

export async function enqueueOutbox<T = Record<string, unknown>>(
  entry: Omit<OutboxEntry<T>, "status" | "created_at">
): Promise<OutboxEntry<T>> {
  const db = await getOfflineDb();
  const fullEntry: OutboxEntry<T> = {
    ...entry,
    created_at: new Date().toISOString(),
    status: "pending",
  };
  await db.put("outbox_queue", fullEntry);
  return fullEntry;
}

export async function listOutboxEntries(tenantId?: string): Promise<OutboxEntry[]> {
  const db = await getOfflineDb();
  const all = (await db.getAllFromIndex("outbox_queue", "by_created_at")) as OutboxEntry[];
  return tenantId ? all.filter((e) => e.tenant_id === tenantId) : all;
}

export async function updateOutboxEntry(
  idempotencyKey: string,
  patch: Partial<Pick<OutboxEntry, "status" | "error" | "payload">>
): Promise<void> {
  const db = await getOfflineDb();
  const existing = (await db.get("outbox_queue", idempotencyKey)) as OutboxEntry | undefined;
  if (!existing) return;
  await db.put("outbox_queue", { ...existing, ...patch });
}

export async function removeOutboxEntry(idempotencyKey: string): Promise<void> {
  const db = await getOfflineDb();
  await db.delete("outbox_queue", idempotencyKey);
}

export async function saveFormDraft(key: string, data: unknown): Promise<void> {
  const db = await getOfflineDb();
  await db.put("drafts", { key, data, updated_at: new Date().toISOString() });
}

export async function loadFormDraft<T = unknown>(key: string): Promise<T | null> {
  const db = await getOfflineDb();
  const row = (await db.get("drafts", key)) as { data: T } | undefined;
  return row ? row.data : null;
}

export type SyncReplaySender = (
  batch: OutboxEntry[]
) => Promise<Array<{ idempotency_key: string; ok: boolean; conflict?: boolean; error?: string }>>;

/**
 * Replays pending outbox entries strictly FIFO in batches of 20.
 * Conflict entries are isolated so valid subsequent items keep syncing.
 */
export async function replayOutboxFifo(
  tenantId: string,
  sender: SyncReplaySender
): Promise<{ synced: number; conflicts: number; remaining: number }> {
  const all = await listOutboxEntries(tenantId);
  const pending = all.filter((e) => e.status === "pending");
  let synced = 0;
  let conflicts = 0;

  for (let i = 0; i < pending.length; i += 20) {
    const batch = pending.slice(i, i + 20);
    for (const item of batch) {
      await updateOutboxEntry(item.idempotency_key, { status: "syncing" });
    }
    try {
      const results = await sender(batch);
      for (const res of results) {
        if (res.ok) {
          await removeOutboxEntry(res.idempotency_key);
          synced++;
        } else if (res.conflict) {
          await updateOutboxEntry(res.idempotency_key, {
            status: "conflict",
            error: res.error ?? "Business conflict",
          });
          conflicts++;
        } else {
          await updateOutboxEntry(res.idempotency_key, {
            status: "pending",
            error: res.error ?? "Retry needed",
          });
        }
      }
    } catch (err) {
      for (const item of batch) {
        await updateOutboxEntry(item.idempotency_key, {
          status: "pending",
          error: err instanceof Error ? err.message : "Network error",
        });
      }
      break;
    }
  }

  const after = await listOutboxEntries(tenantId);
  return {
    synced,
    conflicts,
    remaining: after.filter((e) => e.status === "pending").length,
  };
}
