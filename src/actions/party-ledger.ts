"use server";

import { revalidatePath } from "next/cache";
import { assertAccess } from "@/lib/auth/access";
import { getServerSessionContext } from "@/lib/auth/session";
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
        await client.query(
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
             updated_at = now()`,
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
      } else if (input.entryId) {
        const prevRes = await client.query<{ debit: string; credit: string }>(
          "SELECT debit::text, credit::text FROM public.party_ledger_entries WHERE id = $1 AND tenant_id = $2 AND source_type = 'manual'",
          [input.entryId, ctx.tenant.id]
        );
        const oldNet = prevRes.rows[0]
          ? Number(prevRes.rows[0].debit || 0) - Number(prevRes.rows[0].credit || 0)
          : 0;
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
      const deleted = await client.query<{ debit: string; credit: string }>(
        `DELETE FROM public.party_ledger_entries
         WHERE id = $1 AND tenant_id = $2 AND source_type = 'manual'
         RETURNING debit::text, credit::text`,
        [entryId, ctx.tenant.id]
      );
      if (deleted.rows[0]) {
        const delta = -(Number(deleted.rows[0].debit || 0) - Number(deleted.rows[0].credit || 0));
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
