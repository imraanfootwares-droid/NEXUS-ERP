import type { PoolClient } from "pg";
import { normalizeGstin, normalizePhone, walkInDisplayName } from "./walk-in-identity";

interface InvoicePayload {
  customer_id?: string | null;
  is_draft?: boolean;
  customer_snapshot?: {
    name?: string | null;
    phone?: string | null;
    gstin?: string | null;
    state_code?: string | null;
  } | null;
}

/**
 * Finds or creates the customer for a finalized walk-in bill and returns the payload
 * linked to them. Runs inside the invoice transaction, so a failed bill saves nothing.
 * Bills without a valid phone or GSTIN stay as plain walk-ins.
 */
export async function linkWalkInCustomer<T extends InvoicePayload>(
  client: PoolClient,
  tenantId: string,
  payload: T
): Promise<T> {
  if (payload.customer_id || payload.is_draft) return payload;

  const snapshot = payload.customer_snapshot ?? {};
  const phone = normalizePhone(snapshot.phone);
  const gstin = normalizeGstin(snapshot.gstin);
  if (!phone && !gstin) return payload;

  // Two counters billing the same new customer at once must not create duplicates.
  for (const key of [gstin && `gstin:${gstin}`, phone && `phone:${phone}`].filter(Boolean).sort()) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [tenantId, key]);
  }

  const match = await client.query<{ id: string }>(
    `/* walk_in_customer_match */
     SELECT id FROM public.customers
     WHERE tenant_id = $1
       AND (($2::text IS NOT NULL AND UPPER(gstin) = $2)
         OR ($3::text IS NOT NULL AND RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) = $3))
     ORDER BY (UPPER(gstin) = $2) DESC NULLS LAST, is_active DESC, created_at ASC
     LIMIT 1
     FOR UPDATE`,
    [tenantId, gstin, phone]
  );

  let customerId = match.rows[0]?.id;
  if (customerId) {
    // Keep the saved name and only fill in details that are missing.
    await client.query(
      `/* walk_in_customer_update */
       UPDATE public.customers
       SET is_active = true,
           phone = COALESCE(NULLIF(phone, ''), $3),
           gstin = COALESCE(NULLIF(gstin, ''), $4),
           state_code = COALESCE(NULLIF(state_code, ''), $5)
       WHERE id = $1 AND tenant_id = $2`,
      [customerId, tenantId, phone, gstin, snapshot.state_code || null]
    );
  } else {
    const created = await client.query<{ id: string }>(
      `/* walk_in_customer_insert */
       INSERT INTO public.customers (tenant_id, name, phone, gstin, state_code, customer_type)
       VALUES ($1, $2, $3, $4, $5, 'retail')
       RETURNING id`,
      [tenantId, walkInDisplayName(snapshot.name, phone, gstin), phone, gstin, snapshot.state_code || null]
    );
    customerId = created.rows[0]!.id;
  }

  return { ...payload, customer_id: customerId };
}
