"use server";

import { revalidatePath } from "next/cache";
import { assertAccess, isFeatureEnabled } from "@/lib/auth/access";
import { hashPassword, verifyPassword } from "@/lib/auth/crypto";
import { getServerSessionContext } from "@/lib/auth/session";
import { excelKeyFor, runTenantBackup } from "@/lib/backups/exporter";
import { PERMISSION_PARENT_MAP, type TenantRole } from "@/lib/constants/saas";
import { withTenantTx } from "@/lib/db";
import { deleteObject, getPresignedDownloadUrl, headObject } from "@/lib/storage/s3-client";
import type { BrandConfig, BusinessBillingProfile, CategoryTemplate, LedgerConfig, RatioPreset, TaxConfig } from "@/types/database";

export async function updateBrandConfigAction(
  brand: BrandConfig,
  confirmLogoKey?: string | null
) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.tax_and_hsn", { isMutation: true });

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    let finalLogoKey = ctx.tenant.brand_config?.logo_key ?? null;
    let deltaBytes = 0;

    if (confirmLogoKey === null) {
      if (finalLogoKey) {
        const oldHead = await headObject("public", finalLogoKey).catch(() => ({ exists: false, contentLength: 0 }));
        await deleteObject("public", finalLogoKey).catch(() => undefined);
        deltaBytes -= oldHead.contentLength;
      }
      finalLogoKey = null;
    } else if (confirmLogoKey && confirmLogoKey !== finalLogoKey) {
      const head = await headObject("public", confirmLogoKey);
      if (head.exists) {
        if (finalLogoKey) {
          const oldHead = await headObject("public", finalLogoKey).catch(() => ({ exists: false, contentLength: 0 }));
          await deleteObject("public", finalLogoKey).catch(() => undefined);
          deltaBytes -= oldHead.contentLength;
        }
        deltaBytes += head.contentLength;
        finalLogoKey = confirmLogoKey;
      }
      await client.query("DELETE FROM public.pending_uploads WHERE key = $1 AND tenant_id = $2", [
        confirmLogoKey,
        ctx.tenant.id,
      ]);
    }

    const nextBrand = { ...ctx.tenant.brand_config, ...brand, logo_key: finalLogoKey };
    await client.query(
      `UPDATE public.tenants
       SET brand_config = $1, storage_used_bytes = GREATEST(0, storage_used_bytes + $2)
       WHERE id = $3`,
      [JSON.stringify(nextBrand), deltaBytes, ctx.tenant.id]
    );
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/bill-designer");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/billing/new");
  revalidatePath("/dashboard/storefront");
  revalidatePath(`/s/${ctx.tenant.slug}`);
  revalidatePath("/dashboard");
}

export async function updateBusinessBillingProfileAction(input: BusinessBillingProfile) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) throw new Error("Unauthorized");
  if (ctx.impersonation?.mode === "read") throw new Error("Read-only support session.");
  if (ctx.user.role !== "owner" && ctx.user.role !== "branch_admin") {
    throw new Error("Only the Shop Owner or Branch Manager can update shop & bank details.");
  }

  const clean = (v?: string) => (v ? v.trim() : "");
  const cleanGstin = clean(input.gstin).toUpperCase();
  const cleanIfsc = clean(input.bank_details?.ifsc_code).toUpperCase();

  const businessProfile: BusinessBillingProfile = {
    business_name: clean(input.business_name) || ctx.tenant.name,
    address: clean(input.address) || undefined,
    phone: clean(input.phone) || undefined,
    email: clean(input.email).toLowerCase() || undefined,
    gstin: cleanGstin || undefined,
    signatory_name: clean(input.signatory_name) || clean(input.business_name) || ctx.tenant.name,
    bank_details: {
      account_holder: clean(input.bank_details?.account_holder) || undefined,
      bank_name: clean(input.bank_details?.bank_name) || undefined,
      account_number: clean(input.bank_details?.account_number) || undefined,
      ifsc_code: cleanIfsc || undefined,
      branch_name: clean(input.bank_details?.branch_name) || undefined,
      upi_id: clean(input.bank_details?.upi_id) || undefined,
    },
  };

  const tenant = ctx.tenant;
  const nextBrand: BrandConfig = {
    ...tenant.brand_config,
    address: businessProfile.address ?? tenant.brand_config?.address,
    phone: businessProfile.phone ?? tenant.brand_config?.phone,
    email: businessProfile.email ?? tenant.brand_config?.email,
    business_profile: businessProfile,
  };

  await withTenantTx({ tenantId: tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query("UPDATE public.tenants SET brand_config = $1 WHERE id = $2", [
      JSON.stringify(nextBrand),
      tenant.id,
    ]);
    // Keep the default branch's GSTIN & state code in sync so the user only enters GSTIN once.
    const detectedState = /^\d{2}/.test(cleanGstin) ? cleanGstin.slice(0, 2) : null;
    await client.query(
      `UPDATE public.branches
       SET gstin = $1,
           state_code = COALESCE($2, state_code)
       WHERE tenant_id = $3 AND is_default = true`,
      [cleanGstin || null, detectedState, tenant.id]
    );
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/bill-designer");
  revalidatePath("/dashboard/billing");
  revalidatePath("/dashboard/billing/new");
  revalidatePath("/dashboard");
}

export async function updateLedgerConfigAction(ledgerConfig: LedgerConfig) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) throw new Error("Unauthorized");
  if (ctx.impersonation?.mode === "read") throw new Error("Read-only support session.");
  if (ctx.user.role !== "owner" && ctx.user.role !== "branch_admin") {
    throw new Error("Only Owners and Branch Admins can customize ledger fields.");
  }

  const clean = (arr: LedgerConfig["item_columns"]) =>
    arr
      .map((f) => ({
        key: String(f.key).trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").slice(0, 40),
        label: String(f.label).trim().slice(0, 40),
        enabled: Boolean(f.enabled),
        isCustom: Boolean(f.isCustom),
      }))
      .filter((f) => f.key.length > 0 && f.label.length > 0)
      .slice(0, 20);

  const tenant = ctx.tenant;
  const nextBrand: BrandConfig = {
    ...tenant.brand_config,
    ledger_config: {
      item_columns: clean(ledgerConfig.item_columns),
      header_fields: clean(ledgerConfig.header_fields),
    },
  };

  await withTenantTx({ tenantId: tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query("UPDATE public.tenants SET brand_config = $1 WHERE id = $2", [
      JSON.stringify(nextBrand),
      tenant.id,
    ]);
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/customers");
}

export async function updateCategoryTemplatesAction(templates: CategoryTemplate[]) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) throw new Error("Unauthorized");
  if (ctx.impersonation?.mode === "read") throw new Error("Read-only support session.");
  if (ctx.user.role !== "owner" && ctx.user.role !== "branch_admin") {
    throw new Error("Only Owners and Branch Admins can manage product categories and fields.");
  }

  const tenant = ctx.tenant;
  const cleaned: CategoryTemplate[] = templates
    .map((t) => ({
      category: String(t.category || "").trim().slice(0, 60),
      default_sizes: (t.default_sizes ?? []).map((s) => String(s).trim()).filter(Boolean).slice(0, 30),
      default_colours: (t.default_colours ?? []).map((c) => String(c).trim()).filter(Boolean).slice(0, 20),
      default_pieces_per_carton: Math.max(1, Math.floor(Number(t.default_pieces_per_carton) || 20)),
      extra_fields: (t.extra_fields ?? []).map((f) => String(f).trim()).filter(Boolean).slice(0, 15),
    }))
    .filter((t) => t.category.length > 0)
    .slice(0, 40);

  const nextBrand: BrandConfig = {
    ...tenant.brand_config,
    category_templates: cleaned,
  };

  await withTenantTx({ tenantId: tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query("UPDATE public.tenants SET brand_config = $1 WHERE id = $2", [
      JSON.stringify(nextBrand),
      tenant.id,
    ]);
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/stock");
}

export async function updateTaxConfigAction(tax: TaxConfig) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.tax_and_hsn", { isMutation: true });

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query("UPDATE public.tenants SET tax_config = $1 WHERE id = $2", [
      JSON.stringify(tax),
      ctx.tenant.id,
    ]);
  });

  revalidatePath("/dashboard/settings");
}

function revalidateProductSchemaPaths(slug: string) {
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard/stock");
  revalidatePath("/dashboard/stock/import");
  revalidatePath("/dashboard/billing/new");
  revalidatePath("/dashboard/operations");
  revalidatePath("/dashboard/storefront");
  revalidatePath(`/s/${slug}`);
}

export async function upsertVariantAxisAction(input: {
  id?: string;
  name: string;
  presetValues: string[];
  ratioPresets?: RatioPreset[];
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.catalog_schema", { isMutation: true });

  const cleanName = input.name.trim();
  const cleanValues = Array.from(new Set(input.presetValues.map((v) => v.trim()).filter(Boolean)));
  if (!cleanName) throw new Error("Option group name is required.");
  if (cleanValues.length === 0) throw new Error("Add at least one choice.");

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    if (input.id) {
      await client.query(
        `UPDATE public.variant_axis_definitions
         SET name = $1, preset_values = $2, ratio_presets = COALESCE($3::jsonb, ratio_presets)
         WHERE id = $4 AND tenant_id = $5`,
        [cleanName, cleanValues, input.ratioPresets ? JSON.stringify(input.ratioPresets) : null, input.id, ctx.tenant.id]
      );
    } else {
      await client.query(
        `INSERT INTO public.variant_axis_definitions (tenant_id, name, preset_values, ratio_presets)
         VALUES ($1, $2, $3, $4)`,
        [ctx.tenant.id, cleanName, cleanValues, JSON.stringify(input.ratioPresets ?? [])]
      );
    }
  });
  revalidateProductSchemaPaths(ctx.tenant.slug);
}

export async function createCustomFieldAction(input: {
  fieldKey: string;
  label: string;
  fieldType: "text" | "number" | "select" | "boolean" | "date";
  options: string[];
  showOnBill: boolean;
  showOnWebsite: boolean;
  showInCatalogue: boolean;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.catalog_schema", { isMutation: true });

  const cleanLabel = input.label.trim();
  if (!cleanLabel) throw new Error("Field name is required.");
  const cleanKey = input.fieldKey.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  const cleanOptions = Array.from(new Set(input.options.map((o) => o.trim()).filter(Boolean)));
  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query(
      `INSERT INTO public.custom_field_definitions
       (tenant_id, field_key, label, field_type, options, show_on_bill, show_on_website, show_in_catalogue)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        ctx.tenant.id,
        cleanKey,
        cleanLabel,
        input.fieldType,
        cleanOptions,
        input.showOnBill,
        input.showOnWebsite,
        input.showInCatalogue,
      ]
    );
  });
  revalidateProductSchemaPaths(ctx.tenant.slug);
}

export async function updateCustomFieldAction(input: {
  id: string;
  label: string;
  fieldType: "text" | "number" | "select" | "boolean" | "date";
  options: string[];
  showOnBill: boolean;
  showOnWebsite: boolean;
  showInCatalogue: boolean;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.catalog_schema", { isMutation: true });

  const cleanLabel = input.label.trim();
  if (!cleanLabel) throw new Error("Field name is required.");
  const cleanOptions = Array.from(new Set(input.options.map((o) => o.trim()).filter(Boolean)));

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query(
      `UPDATE public.custom_field_definitions
       SET label = $1,
           field_type = $2,
           options = $3,
           show_on_bill = $4,
           show_on_website = $5,
           show_in_catalogue = $6
       WHERE id = $7 AND tenant_id = $8`,
      [
        cleanLabel,
        input.fieldType,
        cleanOptions,
        input.showOnBill,
        input.showOnWebsite,
        input.showInCatalogue,
        input.id,
        ctx.tenant.id,
      ]
    );
  });
  revalidateProductSchemaPaths(ctx.tenant.slug);
}

export async function createBranchAction(input: {
  name: string;
  code: string;
  type: "factory" | "retail" | "warehouse";
  gstin?: string;
  stateCode: string;
  address?: string;
  phone?: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.tax_and_hsn", { isMutation: true });

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    const cntRes = await client.query<{ cnt: string }>(
      "SELECT COUNT(*)::text AS cnt FROM public.branches WHERE tenant_id = $1",
      [ctx.tenant.id]
    );
    if (Number(cntRes.rows[0].cnt) >= ctx.tenant.max_branches) {
      throw new Error(`Branch quota reached (${ctx.tenant.max_branches}). Contact Application Owner to upgrade.`);
    }

    const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const bRes = await client.query<{ id: string }>(
      `INSERT INTO public.branches (tenant_id, name, code, type, gstin, state_code, address, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [ctx.tenant.id, input.name.trim(), code, input.type, input.gstin?.trim().toUpperCase() || null, input.stateCode, input.address || null, input.phone || null]
    );
    await client.query(
      "INSERT INTO public.devices (tenant_id, branch_id, device_no, label) VALUES ($1, $2, 1, $3)",
      [ctx.tenant.id, bRes.rows[0].id, `${code} Counter 1`]
    );
  });
  revalidatePath("/dashboard/settings");
}

export async function createStaffAction(input: {
  fullName: string;
  username: string;
  email?: string;
  phone?: string;
  role: "branch_admin" | "worker";
  password: string;
  branchIds: string[];
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "staff.create", { isMutation: true });

  if (input.password.length < 8) throw new Error("Password must be at least 8 characters.");
  if (input.password.toLowerCase() === input.username.trim().toLowerCase()) {
    throw new Error("Password cannot match username.");
  }

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    const cntRes = await client.query<{ cnt: string }>(
      "SELECT COUNT(*)::text AS cnt FROM public.profiles WHERE tenant_id = $1 AND is_active = true",
      [ctx.tenant.id]
    );
    if (Number(cntRes.rows[0].cnt) >= ctx.tenant.max_users) {
      throw new Error(`User seat quota reached (${ctx.tenant.max_users}). Contact Application Owner.`);
    }

    const uRes = await client.query<{ id: string }>(
      `INSERT INTO public.profiles (tenant_id, role, full_name, email, username, phone, password_hash, must_change_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true) RETURNING id`,
      [
        ctx.tenant.id,
        input.role,
        input.fullName.trim(),
        input.email?.trim().toLowerCase() || null,
        input.username.trim().toLowerCase(),
        input.phone?.trim() || null,
        hashPassword(input.password),
      ]
    );

    for (const bid of input.branchIds) {
      await client.query(
        "INSERT INTO public.user_branch_assignments (user_id, branch_id, tenant_id) VALUES ($1, $2, $3)",
        [uRes.rows[0].id, bid, ctx.tenant.id]
      );
    }
  });
  revalidatePath("/dashboard/settings");
}

export async function resetStaffPasswordAction(targetUserId: string, newPassword: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "staff.reset_password", { isMutation: true });
  if (newPassword.length < 8) throw new Error("Password must be at least 8 characters.");

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    const tRes = await client.query<{ role: TenantRole; username: string | null }>(
      "SELECT role, username FROM public.profiles WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
      [targetUserId, ctx.tenant.id]
    );
    const target = tRes.rows[0];
    if (!target) throw new Error("Staff member not found.");
    if (target.role === "owner") throw new Error("Cannot reset Shop Owner password from tenant settings.");
    if (ctx.user.role === "branch_admin" && target.role === "branch_admin") {
      throw new Error("Branch Admins can only reset Worker passwords.");
    }
    if (target.username && newPassword.toLowerCase() === target.username.toLowerCase()) {
      throw new Error("Password cannot match username.");
    }

    await client.query(
      `UPDATE public.profiles
       SET password_hash = $1, must_change_password = true, session_version = session_version + 1,
           failed_login_count = 0, locked_until = NULL
       WHERE id = $2 AND tenant_id = $3`,
      [hashPassword(newPassword), targetUserId, ctx.tenant.id]
    );

    await client.query(
      `UPDATE public.password_reset_requests
       SET status = 'resolved', resolved_by = $1, resolved_at = now()
       WHERE user_id = $2 AND tenant_id = $3 AND status = 'pending'`,
      [ctx.user.id, targetUserId, ctx.tenant.id]
    );
  });
  revalidatePath("/dashboard/settings");
}

export async function updateTenantRolePermissionAction(
  role: "branch_admin" | "worker",
  permissionKey: string,
  allowed: boolean
) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.staff_and_roles", { isMutation: true });

  const parentFeature = PERMISSION_PARENT_MAP[permissionKey as keyof typeof PERMISSION_PARENT_MAP];
  if (!parentFeature || !isFeatureEnabled(ctx.tenant, parentFeature)) {
    throw new Error("Parent feature is not enabled on your plan.");
  }

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query(
      `INSERT INTO public.tenant_role_permissions (tenant_id, role, permission_key, allowed)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, role, permission_key) DO UPDATE SET allowed = EXCLUDED.allowed`,
      [ctx.tenant.id, role, permissionKey, allowed]
    );
  });
  revalidatePath("/dashboard/settings");
}

export async function toggleDeviceActiveAction(deviceId: string, isActive: boolean) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.staff_and_roles", { isMutation: true });

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query("UPDATE public.devices SET is_active = $1 WHERE id = $2 AND tenant_id = $3", [
      isActive,
      deviceId,
      ctx.tenant.id,
    ]);
  });
  revalidatePath("/dashboard/settings");
}

export async function triggerManualBackupAction() {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "backups.manage", { isMutation: true });
  const res = await runTenantBackup(ctx.tenant.id, "manual", ctx.user.id);
  revalidatePath("/dashboard/settings");
  return res;
}

export async function getBackupDownloadUrlAction(backupId: string, format: "restore" | "excel" = "restore"): Promise<string> {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "backups.manage");

  const key = await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    const res = await client.query<{ s3_key: string }>(
      "SELECT s3_key FROM public.tenant_backups WHERE id = $1 AND tenant_id = $2",
      [backupId, ctx.tenant.id]
    );
    return res.rows[0]?.s3_key ?? null;
  });
  if (!key) throw new Error("Backup not found.");
  if (format === "excel") {
    const excelKey = excelKeyFor(key);
    if (!(await headObject("private", excelKey)).exists) {
      throw new Error("This older backup has no Excel copy.");
    }
    return getPresignedDownloadUrl("private", excelKey, 300);
  }
  return getPresignedDownloadUrl("private", key, 300);
}

export async function updateBranchAction(input: {
  id: string;
  name: string;
  code: string;
  type: "factory" | "retail" | "warehouse";
  gstin?: string;
  stateCode: string;
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.tax_and_hsn", { isMutation: true });
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query(
      `UPDATE public.branches SET name = $1, code = $2, type = $3, gstin = $4, state_code = $5
       WHERE id = $6 AND tenant_id = $7`,
      [input.name.trim(), code, input.type, input.gstin?.trim().toUpperCase() || null, input.stateCode, input.id, ctx.tenant.id]
    );
  });
  revalidatePath("/dashboard/settings");
}

export async function deleteBranchAction(branchId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.tax_and_hsn", { isMutation: true });

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query(
      "DELETE FROM public.branches WHERE id = $1 AND tenant_id = $2 AND is_default = false",
      [branchId, ctx.tenant.id]
    );
  });
  revalidatePath("/dashboard/settings");
}

export async function updateStaffAction(input: {
  id: string;
  fullName: string;
  email?: string;
  role: "branch_admin" | "worker";
}) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.staff_and_roles", { isMutation: true });

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query(
      `UPDATE public.profiles SET full_name = $1, email = $2, role = $3
       WHERE id = $4 AND tenant_id = $5 AND role <> 'owner'`,
      [input.fullName.trim(), input.email?.trim().toLowerCase() || null, input.role, input.id, ctx.tenant.id]
    );
  });
  revalidatePath("/dashboard/settings");
}

export async function toggleStaffActiveAction(userId: string, isActive: boolean) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.staff_and_roles", { isMutation: true });

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query(
      `UPDATE public.profiles
       SET is_active = $1, session_version = session_version + 1
       WHERE id = $2 AND tenant_id = $3 AND role <> 'owner'`,
      [isActive, userId, ctx.tenant.id]
    );
  });
  revalidatePath("/dashboard/settings");
}

export async function deleteVariantAxisAction(axisId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.catalog_schema", { isMutation: true });

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query("DELETE FROM public.variant_axis_definitions WHERE id = $1 AND tenant_id = $2", [
      axisId,
      ctx.tenant.id,
    ]);
  });
  revalidateProductSchemaPaths(ctx.tenant.slug);
}

export async function deleteCustomFieldAction(fieldId: string) {
  const ctx = await getServerSessionContext();
  assertAccess(ctx, "settings.catalog_schema", { isMutation: true });

  await withTenantTx({ tenantId: ctx.tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query("DELETE FROM public.custom_field_definitions WHERE id = $1 AND tenant_id = $2", [
      fieldId,
      ctx.tenant.id,
    ]);
  });
  revalidateProductSchemaPaths(ctx.tenant.slug);
}

export async function updateMyProfileAction(input: {
  fullName: string;
  email?: string;
  phone?: string;
}) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) throw new Error("Unauthorized");
  if (ctx.impersonation?.mode === "read") throw new Error("Read-only support session.");

  const cleanName = input.fullName.trim();
  if (!cleanName) throw new Error("Full name is required.");

  const tenant = ctx.tenant;
  await withTenantTx({ tenantId: tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    await client.query(
      `UPDATE public.profiles
       SET full_name = $1, email = $2, phone = $3
       WHERE id = $4 AND tenant_id = $5`,
      [
        cleanName,
        input.email?.trim() ? input.email.trim().toLowerCase() : null,
        input.phone?.trim() || null,
        ctx.user.id,
        tenant.id,
      ]
    );
  });
  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
}

export async function changeMyPasswordAction(input: {
  currentPassword: string;
  newPassword: string;
}) {
  const ctx = await getServerSessionContext();
  if (!ctx || !ctx.tenant) throw new Error("Unauthorized");
  if (ctx.impersonation?.mode === "read") throw new Error("Read-only support session.");
  if (input.newPassword.length < 8) {
    throw new Error("New password must be at least 8 characters.");
  }

  const tenant = ctx.tenant;
  await withTenantTx({ tenantId: tenant.id, isPlatformAdmin: ctx.user.is_platform_admin }, async (client) => {
    const res = await client.query<{ password_hash: string }>(
      "SELECT password_hash FROM public.profiles WHERE id = $1 AND tenant_id = $2",
      [ctx.user.id, tenant.id]
    );
    const existing = res.rows[0];
    if (!existing || !verifyPassword(input.currentPassword, existing.password_hash)) {
      throw new Error("Current password is incorrect.");
    }
    const nextHash = hashPassword(input.newPassword);
    await client.query(
      `UPDATE public.profiles
       SET password_hash = $1, must_change_password = false
       WHERE id = $2 AND tenant_id = $3`,
      [nextHash, ctx.user.id, tenant.id]
    );
  });
  revalidatePath("/dashboard/settings");
}
