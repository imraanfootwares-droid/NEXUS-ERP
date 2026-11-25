"use server";

import { revalidatePath } from "next/cache";
import { assertAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
import {
  diffLedgerEntrySnapshots,
  recordBillRevision,
  type LedgerEntrySnapshot,
} from "@/lib/billing/revisions";
import { withTenantTx } from "@/lib/db";
import type { LedgerItemLine, PartyType } from "@/lib/ledger/party-ledger";

export async function savePartyLedgerEntryAction(input: {
  partyType: PartyType;
  partyId: string;
  entryId?: string | null;
  sourceType: "invoice" | "purchase" | "payment" | "manual";
  sourceId?: string | null;
  entryDate: string;
  voucherNo: string;
  particulars: string;
  debit: number;
  credit: number;
  extraFields: Record<string, string>;
  items: LedgerItemLine[];
}) {
  const ctx = await getServerSessionContext();
  if (input.partyType === "customer") {
    assertAccess(ctx, "customers.manage", { isMutation: true });
  } else {
    assertAccess(ctx, "suppliers.manage", { isMutation: true });
  }

  const parsedDate = new Date(input.entryDate);
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date().toISOString() : parsedDate.toISOString();

  const newDebit = Math.max(0, Number(input.debit || 0));
  const newCredit = Math.max(0, Number(input.credit || 0));

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      if (input.sourceType !== "manual" && input.sourceId) {
        const existingRes = await client.query(
          `SELECT * FROM public.party_ledger_entries
           WHERE tenant_id = $1 AND party_type = $2 AND party_id = $3 AND source_type = $4 AND source_id = $5`,
          [ctx.tenant.id, input.partyType, input.partyId, input.sourceType, input.sourceId]
        );
        const prev = existingRes.rows[0];
        const upRes = await client.query<{ id: string }>(
          `INSERT INTO public.party_ledger_entries
             (tenant_id, party_type, party_id, source_type, source_id, entry_date, voucher_no, particulars, debit, credit, extra_fields, items_json, created_by, updated_by, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12::jsonb, $13, $13, now())
           ON CONFLICT (tenant_id, party_type, party_id, source_type, source_id) WHERE source_id IS NOT NULL
           DO UPDATE SET
             entry_date = EXCLUDED.entry_date,
             voucher_no = EXCLUDED.voucher_no,
             particulars = EXCLUDED.particulars,
             extra_fields = EXCLUDED.extra_fields,
             items_json = EXCLUDED.items_json,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
           RETURNING id`,
          [
            ctx.tenant.id,
            input.partyType,
            input.partyId,
            input.sourceType,
            input.sourceId,
            safeDate,
            input.voucherNo.trim() || null,
            input.particulars.trim() || null,
            newDebit,
            newCredit,
            JSON.stringify(input.extraFields ?? {}),
            JSON.stringify(input.items ?? []),
            ctx.user.id,
          ]
        );
        const savedId = upRes.rows[0]?.id;
        if (savedId) {
          const beforeSnap: LedgerEntrySnapshot = prev
            ? {
                id: prev.id,
                party_type: prev.party_type,
                party_id: prev.party_id,
                source_type: prev.source_type,
                source_id: prev.source_id,
                entry_date: prev.entry_date,
                voucher_no: prev.voucher_no || "",
                particulars: prev.particulars || "",
                debit: Number(prev.debit || 0),
                credit: Number(prev.credit || 0),
                extra_fields: prev.extra_fields ?? {},
                items: Array.isArray(prev.items_json) ? prev.items_json : [],
              }
            : {
                id: savedId,
                party_type: input.partyType,
                party_id: input.partyId,
                source_type: input.sourceType,
                source_id: input.sourceId,
                entry_date: safeDate,
                voucher_no: "",
                particulars: "",
                debit: newDebit,
                credit: newCredit,
                extra_fields: {},
                items: [],
              };
          const afterSnap: LedgerEntrySnapshot = {
            id: savedId,
            party_type: input.partyType,
            party_id: input.partyId,
            source_type: input.sourceType,
            source_id: input.sourceId,
            entry_date: safeDate,
            voucher_no: input.voucherNo.trim(),
            particulars: input.particulars.trim(),
            debit: newDebit,
            credit: newCredit,
            extra_fields: input.extraFields ?? {},
            items: input.items ?? [],
          };
          const diff = diffLedgerEntrySnapshots(beforeSnap, afterSnap);
          await recordBillRevision(client, {
            tenantId: ctx.tenant.id,
            entityType: "ledger_entry",
            entityId: savedId,
            entityLabel: afterSnap.voucher_no || "ENTRY",
            action: prev ? "edited" : "created",
            summary: diff.summary,
            changes: diff.changes,
            beforeSnapshot: beforeSnap,
            afterSnapshot: afterSnap,
            actorId: ctx.user.id,
            actorName: ctx.user.full_name,
          });
        }
      } else if (input.entryId) {
        const prevRes = await client.query(
          "SELECT * FROM public.party_ledger_entries WHERE id = $1 AND tenant_id = $2 AND source_type = 'manual'",
          [input.entryId, ctx.tenant.id]
        );
        const prev = prevRes.rows[0];
        const oldNet = prev ? Number(prev.debit || 0) - Number(prev.credit || 0) : 0;
        const delta = newDebit - newCredit - oldNet;

        await client.query(
          `UPDATE public.party_ledger_entries
           SET entry_date = $1, voucher_no = $2, particulars = $3, debit = $4, credit = $5,
               extra_fields = $6::jsonb, items_json = $7::jsonb, updated_by = $8, updated_at = now()
           WHERE id = $9 AND tenant_id = $10 AND source_type = 'manual'`,
          [
            safeDate,
            input.voucherNo.trim() || null,
            input.particulars.trim() || null,
            newDebit,
            newCredit,
            JSON.stringify(input.extraFields ?? {}),
            JSON.stringify(input.items ?? []),
            ctx.user.id,
            input.entryId,
            ctx.tenant.id,
          ]
        );

        if (prev) {
          const beforeSnap: LedgerEntrySnapshot = {
            id: prev.id,
            party_type: prev.party_type,
            party_id: prev.party_id,
            source_type: prev.source_type,
            source_id: prev.source_id,
            entry_date: prev.entry_date,
            voucher_no: prev.voucher_no || "",
            particulars: prev.particulars || "",
            debit: Number(prev.debit || 0),
            credit: Number(prev.credit || 0),
            extra_fields: prev.extra_fields ?? {},
            items: Array.isArray(prev.items_json) ? prev.items_json : [],
          };
          const afterSnap: LedgerEntrySnapshot = {
            id: input.entryId,
            party_type: input.partyType,
            party_id: input.partyId,
            source_type: "manual",
            source_id: null,
            entry_date: safeDate,
            voucher_no: input.voucherNo.trim(),
            particulars: input.particulars.trim(),
            debit: newDebit,
            credit: newCredit,
            extra_fields: input.extraFields ?? {},
            items: input.items ?? [],
          };
          const diff = diffLedgerEntrySnapshots(beforeSnap, afterSnap);
          await recordBillRevision(client, {
            tenantId: ctx.tenant.id,
            entityType: "ledger_entry",
            entityId: input.entryId,
            entityLabel: afterSnap.voucher_no || "ENTRY",
            action: "edited",
            summary: diff.summary,
            changes: diff.changes,
            beforeSnapshot: beforeSnap,
            afterSnapshot: afterSnap,
            actorId: ctx.user.id,
            actorName: ctx.user.full_name,
          });
        }

        if (delta !== 0) {
          const tbl = input.partyType === "customer" ? "public.customers" : "public.suppliers";
          await client.query(
            `UPDATE ${tbl} SET current_due = GREATEST(0, current_due + $1) WHERE id = $2 AND tenant_id = $3`,
            [delta, input.partyId, ctx.tenant.id]
          );
        }
      } else {
        await client.query(
          `INSERT INTO public.party_ledger_entries
             (tenant_id, party_type, party_id, source_type, source_id, entry_date, voucher_no, particulars, debit, credit, extra_fields, items_json, created_by, updated_by)
           VALUES ($1, $2, $3, 'manual', NULL, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $11)`,
          [
            ctx.tenant.id,
            input.partyType,
            input.partyId,
            safeDate,
            input.voucherNo.trim() || null,
            input.particulars.trim() || null,
            newDebit,
            newCredit,
            JSON.stringify(input.extraFields ?? {}),
            JSON.stringify(input.items ?? []),
            ctx.user.id,
          ]
        );

        const delta = newDebit - newCredit;
        if (delta !== 0) {
          const tbl = input.partyType === "customer" ? "public.customers" : "public.suppliers";
          await client.query(
            `UPDATE ${tbl} SET current_due = GREATEST(0, current_due + $1) WHERE id = $2 AND tenant_id = $3`,
            [delta, input.partyId, ctx.tenant.id]
          );
        }
      }
    }
  );

  revalidatePath(`/dashboard/customers/ledger/${input.partyType}/${input.partyId}`);
  revalidatePath("/dashboard/customers");
}

export async function deleteManualPartyLedgerEntryAction(
  partyType: PartyType,
  partyId: string,
  entryId: string
) {
  const ctx = await getServerSessionContext();
  if (partyType === "customer") {
    assertAccess(ctx, "customers.manage", { isMutation: true });
  } else {
    assertAccess(ctx, "suppliers.manage", { isMutation: true });
  }

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      const deleted = await client.query(
        `DELETE FROM public.party_ledger_entries
         WHERE id = $1 AND tenant_id = $2 AND source_type = 'manual'
         RETURNING *`,
        [entryId, ctx.tenant.id]
      );
      const row = deleted.rows[0];
      if (row) {
        await recordBillRevision(client, {
          tenantId: ctx.tenant.id,
          entityType: "ledger_entry",
          entityId: entryId,
          entityLabel: row.voucher_no || "ENTRY",
          action: "deleted",
          summary: `Deleted ledger entry ${row.voucher_no || ""} (${row.particulars || "Manual Entry"})`,
          changes: [
            { field: "Debit", before: `₹${Number(row.debit || 0).toFixed(2)}`, after: "Deleted" },
            { field: "Credit", before: `₹${Number(row.credit || 0).toFixed(2)}`, after: "Deleted" },
          ],
          beforeSnapshot: {
            id: row.id,
            party_type: row.party_type,
            party_id: row.party_id,
            source_type: row.source_type,
            source_id: row.source_id,
            entry_date: row.entry_date,
            voucher_no: row.voucher_no || "",
            particulars: row.particulars || "",
            debit: Number(row.debit || 0),
            credit: Number(row.credit || 0),
            extra_fields: row.extra_fields ?? {},
            items: Array.isArray(row.items_json) ? row.items_json : [],
          },
          afterSnapshot: null,
          actorId: ctx.user.id,
          actorName: ctx.user.full_name,
        });
        const delta = -(Number(row.debit || 0) - Number(row.credit || 0));
        if (delta !== 0) {
          const tbl = partyType === "customer" ? "public.customers" : "public.suppliers";
          await client.query(
            `UPDATE ${tbl} SET current_due = GREATEST(0, current_due + $1) WHERE id = $2 AND tenant_id = $3`,
            [delta, partyId, ctx.tenant.id]
          );
        }
      }
    }
  );

  revalidatePath(`/dashboard/customers/ledger/${partyType}/${partyId}`);
  revalidatePath("/dashboard/customers");
}

/**
 * Simple Add / Deduct money transaction directly from the Customer or Supplier table.
 * Updates both `party_ledger_entries` (for full statement & history) and `current_due` atomically.
 */
export async function recordPartyMoneyTransactionAction(input: {
  partyType: PartyType;
  partyId: string;
  direction: "add" | "deduct"; // add = increases due (debit); deduct = paid/received (credit)
  amount: number;
  mode: "cash" | "upi" | "bank_transfer" | "card";
  voucherNo?: string;
  note?: string;
}) {
  const ctx = await getServerSessionContext();
  if (input.partyType === "customer") {
    assertAccess(ctx, "customers.manage", { isMutation: true });
  } else {
    assertAccess(ctx, "suppliers.manage", { isMutation: true });
  }

  const amt = Number(input.amount || 0);
  if (!Number.isFinite(amt) || amt <= 0) {
    throw new Error("Enter a valid amount greater than 0.");
  }

  const isAdd = input.direction === "add";
  const debit = isAdd ? amt : 0;
  const credit = isAdd ? 0 : amt;
  const modeLabel = input.mode.replace("_", " ").toUpperCase();
  const defaultParticulars =
    input.partyType === "supplier"
      ? isAdd
        ? `Goods / Bill Added (${modeLabel})`
        : `Paid to Supplier — ${modeLabel}`
      : isAdd
      ? `Bill / Due Added (${modeLabel})`
      : `Payment Received — ${modeLabel}`;

  const particulars = input.note?.trim()
    ? `${defaultParticulars} — ${input.note.trim()}`
    : defaultParticulars;

  const voucherNo = input.voucherNo?.trim() || (isAdd ? "BILL" : "R1");

  await withTenantTx(
    { tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin },
    async (client) => {
      await client.query(
        `INSERT INTO public.party_ledger_entries
           (tenant_id, party_type, party_id, source_type, source_id, entry_date, voucher_no, particulars, debit, credit, extra_fields, items_json, created_by, updated_by)
         VALUES ($1, $2, $3, 'manual', NULL, now(), $4, $5, $6, $7, '{}'::jsonb, '[]'::jsonb, $8, $8)`,
        [
          ctx.tenant.id,
          input.partyType,
          input.partyId,
          voucherNo,
          particulars,
          debit,
          credit,
          ctx.user.id,
        ]
      );

      const delta = isAdd ? amt : -amt;
      if (input.partyType === "customer") {
        await client.query(
          "UPDATE public.customers SET current_due = GREATEST(0, current_due + $1) WHERE id = $2 AND tenant_id = $3",
          [delta, input.partyId, ctx.tenant.id]
        );
      } else {
        await client.query(
          "UPDATE public.suppliers SET current_due = GREATEST(0, current_due + $1) WHERE id = $2 AND tenant_id = $3",
          [delta, input.partyId, ctx.tenant.id]
        );
      }
    }
  );

  revalidatePath("/dashboard/customers");
  revalidatePath(`/dashboard/customers/ledger/${input.partyType}/${input.partyId}`);
}
