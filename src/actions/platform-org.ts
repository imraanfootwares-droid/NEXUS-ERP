"use server";

import { revalidatePath } from "next/cache";
import { TIER_ORDER, tierRank } from "@/lib/auth/access";
import { hashPassword } from "@/lib/auth/crypto";
import { getServerSessionContext } from "@/lib/auth/session";
import type { TierKey } from "@/lib/constants/saas";
import { withPlatformTx } from "@/lib/db";

async function requirePlatformAdmin() {
  const ctx = await getServerSessionContext("platform");
  if (!ctx || !ctx.user.is_platform_admin) {
    throw new Error("Platform Super Admin access required.");
  }
  return ctx;
}

export async function platformCreateBranchAction(input: {
  tenantId: string;
  name: string;
  code: string;
  type: "factory" | "retail" | "warehouse";
  gstin?: string;
  stateCode: string;
}) {
  await requirePlatformAdmin();
  await withPlatformTx(async (client) => {
    await client.query(
      `INSERT INTO public.branches (tenant_id, name, code, type, gstin, state_code)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        input.tenantId,
        input.name.trim(),
        input.code.trim().toUpperCase().slice(0, 4),
        input.type,
        input.gstin?.trim() || null,
        input.stateCode,
      ]
    );
  });
  revalidatePath("/platform/organisation");
  revalidatePath(`/platform/tenants/${input.tenantId}`);
}

export async function platformUpdateBranchAction(input: {
  id: string;
  name: string;
  code: string;
  type: "factory" | "retail" | "warehouse";
  gstin?: string;
  stateCode: string;
}) {
  await requirePlatformAdmin();
  await withPlatformTx(async (client) => {
    await client.query(
      `UPDATE public.branches SET name = $1, code = $2, type = $3, gstin = $4, state_code = $5
       WHERE id = $6`,
      [
        input.name.trim(),
        input.code.trim().toUpperCase().slice(0, 4),
        input.type,
        input.gstin?.trim() || null,
        input.stateCode,
        input.id,
      ]
    );
  });
  revalidatePath("/platform/organisation");
}

export async function platformDeleteBranchAction(branchId: string) {
  await requirePlatformAdmin();
  await withPlatformTx(async (client) => {
    await client.query(
      "DELETE FROM public.branches WHERE id = $1 AND is_default = false",
      [branchId]
    );
  });
  revalidatePath("/platform/organisation");
}

export async function platformCreatePersonAction(input: {
  tenantId: string;
  fullName: string;
  username: string;
  email?: string;
  role: "branch_admin" | "worker";
  password: string;
  branchId?: string;
}) {
  await requirePlatformAdmin();
  if (input.password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  const cleanUser = input.username.trim().toLowerCase().replace(/[^a-z0-9_.-]+/g, "");
  await withPlatformTx(async (client) => {
    const res = await client.query<{ id: string }>(
      `INSERT INTO public.profiles (tenant_id, role, full_name, username, email, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, true)
       RETURNING id`,
      [
        input.tenantId,
        input.role,
        input.fullName.trim(),
        cleanUser,
        input.email?.trim() || null,
        hashPassword(input.password),
      ]
    );
    if (input.branchId && res.rows[0]?.id) {
      await client.query(
        "INSERT INTO public.user_branch_assignments (user_id, branch_id, tenant_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
        [res.rows[0].id, input.branchId, input.tenantId]
      );
    }
  });
  revalidatePath("/platform/organisation");
  revalidatePath(`/platform/tenants/${input.tenantId}`);
}

export async function platformUpdatePersonAction(input: {
  tenantId: string;
  userId: string;
  fullName: string;
  email?: string;
  role: "branch_admin" | "worker";
  branchIds: string[];
}) {
  await requirePlatformAdmin();
  if (input.branchIds.length === 0) throw new Error("Assign at least one branch.");
  await withPlatformTx(async (client) => {
    await client.query(
      `UPDATE public.profiles SET full_name = $1, email = $2, role = $3
       WHERE id = $4 AND role <> 'owner'`,
      [input.fullName.trim(), input.email?.trim() || null, input.role, input.userId]
    );
    await client.query("DELETE FROM public.user_branch_assignments WHERE user_id = $1", [input.userId]);
    const assigned = await client.query(
      `INSERT INTO public.user_branch_assignments (user_id, branch_id, tenant_id)
       SELECT $1::uuid, b.id, b.tenant_id FROM public.branches b
       WHERE b.tenant_id = $2 AND b.id = ANY($3::uuid[])
       ON CONFLICT DO NOTHING
       RETURNING branch_id`,
      [input.userId, input.tenantId, input.branchIds]
    );
    if (assigned.rows.length === 0) throw new Error("Choose a branch from this business.");
  });
  revalidatePath("/platform/organisation");
  revalidatePath("/dashboard", "layout");
}

export async function platformTogglePersonActiveAction(userId: string, active: boolean) {
  await requirePlatformAdmin();
  await withPlatformTx(async (client) => {
    await client.query(
      `UPDATE public.profiles
       SET is_active = $1, session_version = session_version + 1
       WHERE id = $2 AND role <> 'owner'`,
      [active, userId]
    );
  });
  revalidatePath("/platform/organisation");
}

export async function platformResetPersonPasswordAction(userId: string, newPassword: string) {
  await requirePlatformAdmin();
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  await withPlatformTx(async (client) => {
    await client.query(
      `UPDATE public.profiles
       SET password_hash = $1, must_change_password = true, session_version = session_version + 1, failed_login_count = 0, locked_until = NULL
       WHERE id = $2`,
      [hashPassword(newPassword), userId]
    );
    await client.query(
      "UPDATE public.password_reset_requests SET status = 'resolved', resolved_at = now() WHERE user_id = $1 AND status = 'pending'",
      [userId]
    );
  });
  revalidatePath("/platform/organisation");
}

/**
 * Promotes or demotes one person. `tier: null`, or the plan's own tier, makes them
 * follow the business plan again. Takes effect on the person's next request.
 */
export async function setPersonTierAction(userId: string, tier: TierKey | null) {
  const ctx = await requirePlatformAdmin();
  if (tier !== null && !TIER_ORDER.includes(tier)) {
    throw new Error("Unknown tier.");
  }
  const tenantId = await withPlatformTx(async (client) => {
    const res = await client.query<{
      id: string;
      tenant_id: string | null;
      is_platform_admin: boolean;
      tier_override: TierKey | null;
      plan_tier: TierKey | null;
    }>(
      `/* person_tier_lookup */
       SELECT p.id, p.tenant_id, p.is_platform_admin, p.tier_override, t.tier AS plan_tier
       FROM public.profiles p
       LEFT JOIN public.tenants t ON t.id = p.tenant_id
       WHERE p.id = $1
       FOR UPDATE OF p`,
      [userId]
    );
    const person = res.rows[0];
    if (!person) throw new Error("Person not found.");
    if (person.is_platform_admin || !person.tenant_id || !person.plan_tier) {
      throw new Error("Platform admins are not limited by tiers.");
    }
    if (tier && tierRank(tier) > tierRank(person.plan_tier)) {
      throw new Error("Upgrade the business plan before promoting this person to that tier.");
    }
    const next = tier === person.plan_tier ? null : tier;
    await client.query("UPDATE public.profiles SET tier_override = $1 WHERE id = $2", [next, userId]);
    await client.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'platform.user_tier_changed', 'profile', $3, $4)`,
      [
        person.tenant_id,
        ctx.user.id,
        userId,
        JSON.stringify({ from: person.tier_override ?? person.plan_tier, to: next ?? person.plan_tier }),
      ]
    );
    return person.tenant_id;
  });
  revalidatePath("/platform/permissions");
  revalidatePath("/platform/organisation");
  revalidatePath("/platform/tenants");
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath("/dashboard", "layout");
}

export async function setEnquiryStatusAction(id: string, status: "new" | "contacted" | "closed") {
  await requirePlatformAdmin();
  if (!["new", "contacted", "closed"].includes(status)) throw new Error("Unknown status.");
  await withPlatformTx(async (client) => {
    await client.query("UPDATE public.landing_enquiries SET status = $1 WHERE id = $2", [status, id]);
  });
  revalidatePath("/platform/enquiries");
}
