import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  allocateNextOfflineInvoiceNumber,
  clearCatalogCacheOnLogout,
  enqueueOutbox,
  getCatalogSnapshot,
  listOutboxEntries,
  replayOutboxFifo,
  saveCatalogSnapshot,
  saveDeviceState,
} from "../sync-engine";

describe("Offline Sync Engine", () => {
  beforeEach(async () => {
    await clearCatalogCacheOnLogout();
    const existing = await listOutboxEntries();
    for (const e of existing) {
      const { removeOutboxEntry } = await import("../sync-engine");
      await removeOutboxEntry(e.idempotency_key);
    }
  });

  it("allocates sequential <= 16-char offline GST invoice numbers per device", async () => {
    await saveDeviceState({
      key: "t1:b1",
      device_id: "dev-1",
      device_no: 1,
      next_seq: 1,
      branch_code: "CHN",
    });

    const first = await allocateNextOfflineInvoiceNumber("t1", "b1", "26-27");
    const second = await allocateNextOfflineInvoiceNumber("t1", "b1", "26-27");

    expect(first.invoiceNumber).toBe("CHN1/26-27/0001");
    expect(first.invoiceNumber.length).toBeLessThanOrEqual(16);
    expect(second.invoiceNumber).toBe("CHN1/26-27/0002");
    expect(second.deviceSeq).toBe(2);
  });

  it("clears catalog cache on logout while preserving pending outbox entries", async () => {
    await saveCatalogSnapshot({
      cache_key: "t1:b1",
      tenant_id: "t1",
      branch_id: "b1",
      synced_at: new Date().toISOString(),
      products: [{ id: "p1", name: "Shoe" }],
      variants: [],
      stock: [],
      customers: [],
      hsn_codes: [],
      bill_template: null,
    });
    await enqueueOutbox({
      idempotency_key: "k-1",
      tenant_id: "t1",
      branch_id: "b1",
      user_id: "u1",
      device_id: "dev-1",
      op: "create_invoice",
      payload: { total: 1000 },
    });

    await clearCatalogCacheOnLogout();
    expect(await getCatalogSnapshot("t1", "b1")).toBeUndefined();
    const outbox = await listOutboxEntries("t1");
    expect(outbox).toHaveLength(1);
    expect(outbox[0].idempotency_key).toBe("k-1");
  });

  it("replays FIFO and isolates conflict entries without blocking valid ones", async () => {
    await enqueueOutbox({
      idempotency_key: "k-a",
      tenant_id: "t1",
      branch_id: "b1",
      user_id: "u1",
      device_id: "dev-1",
      op: "adjust_stock",
      payload: { qty: -99 },
    });
    await enqueueOutbox({
      idempotency_key: "k-b",
      tenant_id: "t1",
      branch_id: "b1",
      user_id: "u1",
      device_id: "dev-1",
      op: "create_invoice",
      payload: { total: 500 },
    });

    const result = await replayOutboxFifo("t1", async (batch) =>
      batch.map((item) =>
        item.idempotency_key === "k-a"
          ? { idempotency_key: item.idempotency_key, ok: false, conflict: true, error: "Negative stock" }
          : { idempotency_key: item.idempotency_key, ok: true }
      )
    );

    expect(result).toEqual({ synced: 1, conflicts: 1, remaining: 0 });
    const remaining = await listOutboxEntries("t1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0].status).toBe("conflict");
  });
});
