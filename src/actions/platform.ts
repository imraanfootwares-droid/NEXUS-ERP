"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  IMPERSONATE_COOKIE_NAME,
  IMPERSONATE_TTL_SECONDS,
  generateTempPassword,
  hashPassword,
  signImpersonationToken,
} from "@/lib/auth/crypto";
import { getServerSessionContext } from "@/lib/auth/session";
import {
  getDependentFeatures,
  getRequiredPrerequisites,
  isFeatureEnabled,
} from "@/lib/auth/access";
import { VERTICAL_PRESETS } from "@/lib/catalog/verticals";
import {
  PERMISSION_DEFINITIONS,
  TIER_META,
  type FeatureKey,
  type TenantRole,
  type TenantStatus,
  type TierKey,
} from "@/lib/constants/saas";
import { withPlatformTx } from "@/lib/db";
import type { VerticalKey } from "@/types/database";

async function requirePlatformAdmin() {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.user.is_platform_admin) {
    throw new Error("Platform Super Admin access required.");
  }
  return ctx;
}

export async function provisionTenantAction(input: {
  name: string;
  slug: string;
  customDomain?: string;
  verticalKey: VerticalKey;
  tier: TierKey;
  ownerName: string;
  ownerEmail: string;
  ownerUsername: string;
  ownerPassword?: string;
  maxUsers?: number;
  maxBranches?: number;
  maxStorageMb?: number;
  amcRenewalDate?: string;
  branches: Array<{ name: string; code: string; type: "factory" | "retail" | "warehouse"; gstin?: string; stateCode: string }>;
}) {
  const ctx = await requirePlatformAdmin();
  const cleanSlug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-");
  const cleanDomain = input.customDomain?.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] || null;
  const tierMeta = TIER_META[input.tier];
  const tempPassword = input.ownerPassword?.trim() || generateTempPassword(10);

  if (tempPassword.length < 8) {
    throw new Error("Owner password must be at least 8 characters.");
  }

  const tenantId = await withPlatformTx(async (client) => {
    const tRes = await client.query<{ id: string }>(
      `INSERT INTO public.tenants (name, slug, custom_domain, vertical_key, tier, max_users, max_branches, max_storage_mb, amc_renewal_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        input.name.trim(),
        cleanSlug,
        cleanDomain,
        input.verticalKey,
        input.tier,
        input.maxUsers ?? tierMeta.maxUsers,
        input.maxBranches ?? tierMeta.maxBranches,
        input.maxStorageMb ?? 250,
        input.amcRenewalDate || null,
      ]
    );
    const tid = tRes.rows[0].id;

    // Always seed all 30 x 3 role permission rows
    for (const p of PERMISSION_DEFINITIONS) {
      for (const role of ["owner", "branch_admin", "worker"] as const) {
        await client.query(
          `INSERT INTO public.tenant_role_permissions (tenant_id, role, permission_key, allowed)
           VALUES ($1, $2, $3, $4)`,
          [tid, role, p.key, p[role]]
        );
      }
    }

    // Seed vertical preset UOM, variant axes & custom fields
    const preset = VERTICAL_PRESETS[input.verticalKey];
    await client.query(
      "INSERT INTO public.uoms (tenant_id, code, allow_decimal) VALUES ($1, $2, $3)",
      [tid, preset.defaultUom, preset.allowDecimal]
    );
    for (let i = 0; i < preset.defaultAxes.length; i++) {
      const ax = preset.defaultAxes[i];
      await client.query(
        `INSERT INTO public.variant_axis_definitions (tenant_id, name, preset_values, ratio_presets, sort_order)
         VALUES ($1, $2, $3, $4, $5)`,
        [tid, ax.name, ax.preset_values, JSON.stringify(ax.ratio_presets), i]
      );
    }
    for (let i = 0; i < preset.defaultCustomFields.length; i++) {
      const cf = preset.defaultCustomFields[i];
      await client.query(
        `INSERT INTO public.custom_field_definitions (tenant_id, field_key, label, field_type, options, show_on_bill, show_on_website, show_in_catalogue, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [tid, cf.field_key, cf.label, cf.field_type, cf.options, cf.show_on_bill, cf.show_on_website, cf.show_in_catalogue, i]
      );
    }

    // Seed branches & initial POS device #1
    const branchesToCreate =
      input.branches.length > 0
        ? input.branches
        : [{ name: "Main Branch", code: "MAIN", type: "retail" as const, stateCode: "33" }];

    for (let i = 0; i < branchesToCreate.length; i++) {
      const b = branchesToCreate[i];
      const bRes = await client.query<{ id: string }>(
        `INSERT INTO public.branches (tenant_id, name, code, type, gstin, state_code, is_default)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [tid, b.name.trim(), b.code.trim().toUpperCase().slice(0, 4), b.type, b.gstin?.trim().toUpperCase() || null, b.stateCode || "33", i === 0]
      );
      await client.query(
        "INSERT INTO public.devices (tenant_id, branch_id, device_no, label) VALUES ($1, $2, 1, $3)",
        [tid, bRes.rows[0].id, `${b.code.toUpperCase()} Counter 1`]
      );
    }

    // Seed default A4 bill template
    await client.query(
      `INSERT INTO public.bill_templates (tenant_id, name, format, is_default, config)
       VALUES ($1, 'Standard A4 GST Invoice', 'a4', true, $2)`,
      [
        tid,
        JSON.stringify({
          header_title: input.name.trim().toUpperCase(),
          header_subtitle: "GST Tax Invoice",
          footer_note: "Thank you for your business!",
          terms: "Goods once sold can be exchanged within 7 days with original bill.",
          accent_color: "#0284c7",
          show_logo: true,
          show_hsn: true,
          show_gst_summary: true,
          show_discount: true,
          show_custom_fields: false,
          show_upi_qr: true,
        }),
      ]
    );

    // Seed Tenant Owner user
    await client.query(
      `INSERT INTO public.profiles (tenant_id, role, full_name, email, username, password_hash, must_change_password)
       VALUES ($1, 'owner', $2, $3, $4, $5, true)`,
      [
        tid,
        input.ownerName.trim(),
        input.ownerEmail.trim().toLowerCase() || null,
        input.ownerUsername.trim().toLowerCase(),
        hashPassword(tempPassword),
      ]
    );

    await client.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'platform.tenant_provisioned', 'tenant', $1::text, $3)`,
      [tid, ctx.user.id, JSON.stringify({ tier: input.tier, vertical: input.verticalKey })]
    );

    return tid;
  });

  revalidatePath("/platform/tenants");
  return { tenantId, tempPassword };
}

export async function updateTenantTierAction(tenantId: string, nextTier: TierKey) {
  const ctx = await requirePlatformAdmin();
  await withPlatformTx(async (client) => {
    const oldRes = await client.query<{ tier: TierKey; max_branches: number }>(
      "SELECT tier, max_branches FROM public.tenants WHERE id = $1 FOR UPDATE",
      [tenantId]
    );
    const old = oldRes.rows[0];
    if (!old) throw new Error("Tenant not found");

    const nextMeta = TIER_META[nextTier];
    const nextMaxBranches = Math.max(old.max_branches, nextMeta.maxBranches);

    await client.query(
      "UPDATE public.tenants SET tier = $1, max_branches = GREATEST(max_branches, $2) WHERE id = $3",
      [nextTier, nextMeta.maxBranches, tenantId]
    );

    // If stock was turned back on from off, show stock outdated banner
    if (
      (old.tier === "tier_1" && nextTier !== "tier_1")
    ) {
      await client.query("UPDATE public.tenants SET stock_outdated_banner = true WHERE id = $1", [tenantId]);
    }

    // Mark branches read-only if over quota
    await client.query(
      `WITH ranked AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY is_default DESC, created_at ASC) AS rn
         FROM public.branches WHERE tenant_id = $1
       )
       UPDATE public.branches b SET is_read_only = (r.rn > $2)
       FROM ranked r WHERE b.id = r.id`,
      [tenantId, nextMaxBranches]
    );

    await client.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'platform.tier_changed', 'tenant', $1::text, $3)`,
      [tenantId, ctx.user.id, JSON.stringify({ from: old.tier, to: nextTier })]
    );
  });
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath("/platform/tenants");
}

export async function setFeatureOverrideAction(
  tenantId: string,
  featureKey: FeatureKey,
  mode: "inherit" | "enable" | "disable",
  autoResolveDependencies = true
) {
  const ctx = await requirePlatformAdmin();
  await withPlatformTx(async (client) => {
    const res = await client.query<{
      tier: TierKey;
      feature_overrides: Partial<Record<FeatureKey, boolean>>;
      max_branches: number;
    }>("SELECT tier, feature_overrides, max_branches FROM public.tenants WHERE id = $1 FOR UPDATE", [tenantId]);
    const t = res.rows[0];
    if (!t) throw new Error("Tenant not found");

    const wasStockEnabled = isFeatureEnabled(t, "dynamic_stock_matrix");
    const nextOverrides: Partial<Record<FeatureKey, boolean>> = { ...(t.feature_overrides ?? {}) };

    if (mode === "inherit") {
      delete nextOverrides[featureKey];
    } else if (mode === "enable") {
      nextOverrides[featureKey] = true;
      if (autoResolveDependencies) {
        for (const reqKey of getRequiredPrerequisites(featureKey)) {
          if (!isFeatureEnabled({ tier: t.tier, feature_overrides: nextOverrides }, reqKey)) {
            nextOverrides[reqKey] = true;
          }
        }
      }
    } else {
      nextOverrides[featureKey] = false;
      for (const depKey of getDependentFeatures(featureKey)) {
        if (isFeatureEnabled({ tier: t.tier, feature_overrides: nextOverrides }, depKey)) {
          nextOverrides[depKey] = false;
        }
      }
    }

    let nextMaxBranches = t.max_branches;
    if (isFeatureEnabled({ tier: t.tier, feature_overrides: nextOverrides }, "stock_transfers") && nextMaxBranches < 2) {
      nextMaxBranches = 2;
    }

    const nowStockEnabled = isFeatureEnabled({ tier: t.tier, feature_overrides: nextOverrides }, "dynamic_stock_matrix");
    const showOutdated = !wasStockEnabled && nowStockEnabled;

    await client.query(
      `UPDATE public.tenants
       SET feature_overrides = $1, max_branches = $2, stock_outdated_banner = stock_outdated_banner OR $3
       WHERE id = $4`,
      [JSON.stringify(nextOverrides), nextMaxBranches, showOutdated, tenantId]
    );

    await client.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'platform.feature_override', 'tenant', $1::text, $3)`,
      [tenantId, ctx.user.id, JSON.stringify({ featureKey, mode })]
    );
  });
  revalidatePath(`/platform/tenants/${tenantId}`);
}

export async function applyFeatureOverridesBatchAction(
  tenantId: string,
  overrides: Partial<Record<FeatureKey, boolean>>,
  presetLabel: string
) {
  const ctx = await requirePlatformAdmin();
  await withPlatformTx(async (client) => {
    const res = await client.query<{
      tier: TierKey;
      feature_overrides: Partial<Record<FeatureKey, boolean>>;
      max_branches: number;
    }>("SELECT tier, feature_overrides, max_branches FROM public.tenants WHERE id = $1 FOR UPDATE", [tenantId]);
    const t = res.rows[0];
    if (!t) throw new Error("Tenant not found");

    const wasStockEnabled = isFeatureEnabled(t, "dynamic_stock_matrix");
    const nextOverrides: Partial<Record<FeatureKey, boolean>> = { ...overrides };

    let nextMaxBranches = t.max_branches;
    if (isFeatureEnabled({ tier: t.tier, feature_overrides: nextOverrides }, "stock_transfers") && nextMaxBranches < 2) {
      nextMaxBranches = 2;
    }

    const nowStockEnabled = isFeatureEnabled({ tier: t.tier, feature_overrides: nextOverrides }, "dynamic_stock_matrix");
    const showOutdated = !wasStockEnabled && nowStockEnabled;

    await client.query(
      `UPDATE public.tenants
       SET feature_overrides = $1, max_branches = $2, stock_outdated_banner = stock_outdated_banner OR $3
       WHERE id = $4`,
      [JSON.stringify(nextOverrides), nextMaxBranches, showOutdated, tenantId]
    );

    await client.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'platform.feature_preset_applied', 'tenant', $1::text, $3)`,
      [tenantId, ctx.user.id, JSON.stringify({ presetLabel, overrideCount: Object.keys(nextOverrides).length })]
    );
  });
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath("/platform/tenants");
}

export async function updateTenantQuotasAndStatusAction(
  tenantId: string,
  input: {
    status: TenantStatus;
    maxUsers: number;
    maxBranches: number;
    maxStorageMb: number;
    amcRenewalDate: string | null;
    customDomain: string | null;
  }
) {
  const ctx = await requirePlatformAdmin();
  await withPlatformTx(async (client) => {
    const cleanDomain = input.customDomain?.trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0] || null;
    await client.query(
      `UPDATE public.tenants
       SET status = $1, max_users = $2, max_branches = $3, max_storage_mb = $4, amc_renewal_date = $5, custom_domain = $6
       WHERE id = $7`,
      [input.status, input.maxUsers, input.maxBranches, input.maxStorageMb, input.amcRenewalDate || null, cleanDomain, tenantId]
    );

    // Bump session_version on suspension so active JWTs are immediately revoked
    if (input.status === "suspended") {
      await client.query("UPDATE public.profiles SET session_version = session_version + 1 WHERE tenant_id = $1", [
        tenantId,
      ]);
    }

    // Mark branches beyond max_branches as read-only
    await client.query(
      `WITH ranked AS (
         SELECT id, ROW_NUMBER() OVER (ORDER BY is_default DESC, created_at ASC) AS rn
         FROM public.branches WHERE tenant_id = $1
       )
       UPDATE public.branches b SET is_read_only = (r.rn > $2)
       FROM ranked r WHERE b.id = r.id`,
      [tenantId, input.maxBranches]
    );

    await client.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'platform.tenant_updated', 'tenant', $1::text, $3)`,
      [tenantId, ctx.user.id, JSON.stringify({ status: input.status, maxBranches: input.maxBranches })]
    );
  });
  revalidatePath(`/platform/tenants/${tenantId}`);
  revalidatePath("/platform/tenants");
}

export async function adminSetUserPasswordAction(
  targetUserId: string,
  newPassword: string,
  mustChangePassword = true
) {
  const ctx = await requirePlatformAdmin();
  if (newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  await withPlatformTx(async (client) => {
    const uRes = await client.query<{ tenant_id: string | null; username: string | null }>(
      "SELECT tenant_id, username FROM public.profiles WHERE id = $1 FOR UPDATE",
      [targetUserId]
    );
    const u = uRes.rows[0];
    if (!u) throw new Error("User not found");
    if (u.username && newPassword.toLowerCase() === u.username.toLowerCase()) {
      throw new Error("Password cannot match username.");
    }

    await client.query(
      `UPDATE public.profiles
       SET password_hash = $1, must_change_password = $2, session_version = session_version + 1,
           failed_login_count = 0, locked_until = NULL
       WHERE id = $3`,
      [hashPassword(newPassword), mustChangePassword, targetUserId]
    );

    await client.query(
      `UPDATE public.password_reset_requests
       SET status = 'resolved', resolved_by = $1, resolved_at = now()
       WHERE user_id = $2 AND status = 'pending'`,
      [ctx.user.id, targetUserId]
    );

    await client.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'platform.password_reset', 'profile', $3, $4)`,
      [u.tenant_id, ctx.user.id, targetUserId, JSON.stringify({ mustChangePassword })]
    );
  });
  revalidatePath("/platform");
  revalidatePath("/platform/tenants");
}

export async function updatePermissionMatrixAction(
  tenantId: string | "global",
  role: TenantRole,
  permissionKey: string,
  allowed: boolean
) {
  const ctx = await requirePlatformAdmin();
  await withPlatformTx(async (client) => {
    if (tenantId === "global") {
      const col = role === "owner" ? "default_owner" : role === "branch_admin" ? "default_branch_admin" : "default_worker";
      await client.query(`UPDATE public.permission_definitions SET ${col} = $1 WHERE permission_key = $2`, [
        allowed,
        permissionKey,
      ]);
    } else {
      await client.query(
        `INSERT INTO public.tenant_role_permissions (tenant_id, role, permission_key, allowed)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (tenant_id, role, permission_key) DO UPDATE SET allowed = EXCLUDED.allowed`,
        [tenantId, role, permissionKey, allowed]
      );
      await client.query(
        `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
         VALUES ($1, $2, 'platform.permission_updated', 'permission', $3, $4)`,
        [tenantId, ctx.user.id, permissionKey, JSON.stringify({ role, allowed })]
      );
    }
  });
  revalidatePath("/platform/permissions");
}

export async function upsertMasterHsnAction(input: {
  id?: string;
  code: string;
  description: string;
  category: string;
  rateRuleType: "flat" | "price_threshold";
  thresholdAmount?: number | null;
  rateBelow?: number | null;
  rateAbove?: number | null;
  defaultGstRate: number;
}) {
  await requirePlatformAdmin();
  await withPlatformTx(async (client) => {
    if (input.id) {
      await client.query(
        `UPDATE public.hsn_codes
         SET code = $1, description = $2, category = $3, rate_rule_type = $4,
             threshold_amount = $5, rate_below_threshold = $6, rate_above_threshold = $7, default_gst_rate = $8
         WHERE id = $9 AND tenant_id IS NULL`,
        [
          input.code.trim(),
          input.description.trim(),
          input.category.trim(),
          input.rateRuleType,
          input.thresholdAmount ?? null,
          input.rateBelow ?? null,
          input.rateAbove ?? null,
          input.defaultGstRate,
          input.id,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO public.hsn_codes (tenant_id, code, description, category, rate_rule_type, threshold_amount, rate_below_threshold, rate_above_threshold, default_gst_rate)
         VALUES (NULL, $1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          input.code.trim(),
          input.description.trim(),
          input.category.trim(),
          input.rateRuleType,
          input.thresholdAmount ?? null,
          input.rateBelow ?? null,
          input.rateAbove ?? null,
          input.defaultGstRate,
        ]
      );
    }
  });
  revalidatePath("/platform/permissions");
}

export async function startImpersonationAction(tenantId: string, mode: "read" | "write" = "read") {
  const ctx = await requirePlatformAdmin();
  const token = await signImpersonationToken({
    tenantId,
    adminId: ctx.user.id,
    mode,
  });

  await withPlatformTx(async (client) => {
    await client.query(
      `INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
       VALUES ($1, $2, 'platform.impersonation_started', 'tenant', $1::text, $3)`,
      [tenantId, ctx.user.id, JSON.stringify({ mode })]
    );
  });

  const cookieStore = await cookies();
  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
  cookieStore.set(IMPERSONATE_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && proto === "https",
    path: "/",
    maxAge: IMPERSONATE_TTL_SECONDS,
  });

  redirect("/dashboard");
}

export async function exitImpersonationAction() {
  const cookieStore = await cookies();
  cookieStore.delete(IMPERSONATE_COOKIE_NAME);
  redirect("/platform");
}
