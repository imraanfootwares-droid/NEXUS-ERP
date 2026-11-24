"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getServerSessionContext } from "@/lib/auth/session";
import { withPlatformTx } from "@/lib/db";

const inputSchema = z.object({
  target: z.enum(["business", "user"]),
  id: z.string().min(1).max(64),
  blocked: z.boolean(),
  message: z.string().trim().max(500).optional(),
  amountDue: z.number().min(0).max(999999999999).nullable().optional(),
  contact: z.string().trim().max(120).optional(),
});

/** Blocks or unblocks a business or person. Every change is recorded in the audit log. */
export async function setAccessBlockAction(input: z.input<typeof inputSchema>) {
  const ctx = await getServerSessionContext("platform");
  if (!ctx || !ctx.user.is_platform_admin) {
    throw new Error("Platform Super Admin access required.");
  }
  const data = inputSchema.parse(input);

  await withPlatformTx(async (client) => {
    let tenantId: string;
    if (data.target === "business") {
      const res = await client.query<{ id: string }>(
        "/* access_block_tenant */ SELECT id FROM public.tenants WHERE id = $1 FOR UPDATE",
        [data.id]
      );
      if (!res.rows[0]) throw new Error("Business not found.");
      tenantId = res.rows[0].id;
    } else {
      const res = await client.query<{ tenant_id: string | null; is_platform_admin: boolean }>(
        "/* access_block_profile */ SELECT tenant_id, is_platform_admin FROM public.profiles WHERE id = $1 FOR UPDATE",
        [data.id]
      );
      const person = res.rows[0];
      if (!person) throw new Error("Person not found.");
      if (person.is_platform_admin || !person.tenant_id) throw new Error("Platform admins cannot be blocked.");
      tenantId = person.tenant_id;
    }

    const table = data.target === "business" ? "tenants" : "profiles";
    await client.query(
      `/* access_block_update */
       UPDATE public.${table}
       SET access_blocked = $2,
           access_block_message = $3,
           access_block_amount = $4,
           access_block_contact = $5,
           access_blocked_at = CASE WHEN $2 THEN COALESCE(access_blocked_at, now()) ELSE NULL END,
           access_blocked_by = CASE WHEN $2 THEN $6::uuid ELSE NULL END
       WHERE id = $1`,
      [
        data.id,
        data.blocked,
        data.blocked ? data.message || null : null,
        data.blocked ? data.amountDue ?? null : null,
        data.blocked ? data.contact || null : null,
        ctx.user.id,
      ]
    );

    await client.query(
      `/* access_block_audit */
       INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tenantId,
        ctx.user.id,
        data.blocked ? "platform.access_blocked" : "platform.access_unblocked",
        data.target === "business" ? "tenant" : "profile",
        data.id,
        JSON.stringify({
          target: data.target,
          message: data.blocked ? data.message || null : null,
          amount_due: data.blocked ? data.amountDue ?? null : null,
        }),
      ]
    );
  });

  revalidatePath("/platform/access");
  revalidatePath("/dashboard", "layout");
}
