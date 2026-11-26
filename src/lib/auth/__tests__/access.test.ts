import { describe, expect, it } from "vitest";
import { assertAccess, canAccess, getDependentFeatures, getRequiredPrerequisites, isFeatureEnabled, resolveAllFeatures, resolveRolePermissions, effectiveUserTier, resolveUserFeatures, resolveAccessBlock } from "../access";
import { hashPassword, isSameOriginRequest, verifyPassword } from "../crypto";
import { buildVariantSku, generateVariantCombinations } from "@/lib/catalog/verticals";
import { PERMISSION_DEFINITIONS } from "@/lib/constants/saas";
import type { SessionContext, TenantRow } from "@/types/database";

function makeTenant(overrides?: Partial<TenantRow>): TenantRow {
  return {
    id: "t-1",
    name: "Test Footwear",
    slug: "test-footwear",
    custom_domain: null,
    vertical_key: "footwear",
    tier: "tier_1",
    status: "active",
    max_users: 5,
    max_branches: 1,
    max_storage_mb: 250,
    storage_used_bytes: 0,
    amc_renewal_date: null,
    feature_overrides: {},
    brand_config: {},
    tax_config: {
      gst_enabled: true,
      default_tax_mode: "inclusive",
      allow_estimate_mode: true,
      allow_negative_stock: false,
      hsn_digits: 4,
      costing: "weighted_avg",
      default_state_code: "33",
    },
    storefront_config: {
      price_display: "retail",
      whatsapp_number: "",
      hero_title: "",
      hero_subtitle: "",
    },
    stock_outdated_banner: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeCtx(overrides?: Partial<SessionContext>): SessionContext {
  const tenant = overrides?.tenant ?? makeTenant();
  return {
    user: {
      id: "u-1",
      tenant_id: tenant.id,
      is_platform_admin: false,
      role: "owner",
      full_name: "Imraan",
      email: "imraan@example.com",
      username: "imraan",
      phone: null,
      session_version: 1,
      must_change_password: false,
      is_active: true,
      created_at: new Date().toISOString(),
    },
    tenant,
    branches: [],
    assignedBranchIds: ["b-del"],
    permissions: resolveRolePermissions("owner", []),
    enabledFeatures: resolveAllFeatures(tenant),
    impersonation: null,
    ...overrides,
  };
}

describe("Access Control & Cross-Tier Overrides", () => {
  it("grants a Tier 1 tenant a single Tier 4 feature (public_website_cms) cleanly", () => {
    const tenant = makeTenant({
      tier: "tier_1",
      feature_overrides: { public_website_cms: true },
    });
    expect(isFeatureEnabled(tenant, "public_website_cms")).toBe(true);
    expect(isFeatureEnabled(tenant, "dynamic_stock_matrix")).toBe(false);

    const ctx = makeCtx({ tenant });
    expect(canAccess(ctx, "website.manage").allowed).toBe(true);
    expect(canAccess(ctx, "stock.view")).toEqual({ allowed: false, reason: "FEATURE_DISABLED" });
  });

  it("blocks dependent features when a Tier 4 tenant has gst_billing_pdf force-disabled (reverse override)", () => {
    const tenant = makeTenant({
      tier: "tier_4",
      feature_overrides: { gst_billing_pdf: false },
    });
    expect(isFeatureEnabled(tenant, "gst_billing_pdf")).toBe(false);
    expect(isFeatureEnabled(tenant, "bill_designer")).toBe(false);
    expect(isFeatureEnabled(tenant, "discounts_returns_payments")).toBe(false);
    expect(isFeatureEnabled(tenant, "data_exports_gst")).toBe(false);
    // Unrelated Tier 4 features keep working
    expect(isFeatureEnabled(tenant, "stock_transfers")).toBe(true);
    expect(isFeatureEnabled(tenant, "public_website_cms")).toBe(true);

    expect(getDependentFeatures("gst_billing_pdf")).toEqual(
      expect.arrayContaining(["bill_designer", "discounts_returns_payments", "data_exports_gst"])
    );
  });

  it("resolves transitive prerequisites for stock_transfers", () => {
    expect(getRequiredPrerequisites("stock_transfers")).toEqual(
      expect.arrayContaining(["dynamic_stock_matrix", "multi_branch_ledgers"])
    );

    // Enabling stock_transfers without multi_branch_ledgers on Tier 1 evaluates false until prerequisite is enabled
    const partial = makeTenant({ tier: "tier_1", feature_overrides: { stock_transfers: true } });
    expect(isFeatureEnabled(partial, "stock_transfers")).toBe(false);

    const full = makeTenant({
      tier: "tier_1",
      feature_overrides: {
        stock_transfers: true,
        multi_branch_ledgers: true,
        dynamic_stock_matrix: true,
      },
    });
    expect(isFeatureEnabled(full, "stock_transfers")).toBe(true);
  });

  it("enforces role permissions and branch scoping for branch_admin and worker", () => {
    const tenant = makeTenant({ tier: "tier_4" });
    const workerPerms = resolveRolePermissions("worker", [
      { permission_key: "billing.edit", allowed: true },
    ]);
    const ctx = makeCtx({
      tenant,
      user: {
        id: "u-w",
        tenant_id: tenant.id,
        is_platform_admin: false,
        role: "worker",
        full_name: "Staff",
        email: null,
        username: "staff1",
        phone: null,
        session_version: 1,
        must_change_password: false,
        is_active: true,
        created_at: new Date().toISOString(),
      },
      assignedBranchIds: ["b-chn"],
      permissions: workerPerms,
    });

    expect(canAccess(ctx, "billing.edit", { branchId: "b-chn" }).allowed).toBe(true);
    expect(canAccess(ctx, "billing.edit", { branchId: "b-del" })).toEqual({
      allowed: false,
      reason: "BRANCH_FORBIDDEN",
    });
    expect(canAccess(ctx, "staff.reset_password")).toEqual({
      allowed: false,
      reason: "PERMISSION_DENIED",
    });
  });

  it("blocks suspended tenants and blocks mutations during read-only impersonation", () => {
    const suspendedCtx = makeCtx({ tenant: makeTenant({ status: "suspended" }) });
    expect(canAccess(suspendedCtx, "billing.view")).toEqual({
      allowed: false,
      reason: "TENANT_SUSPENDED",
    });

    const readImpCtx = makeCtx({
      tenant: makeTenant({ tier: "tier_4" }),
      impersonation: {
        tenantId: "t-1",
        adminId: "admin-1",
        mode: "read",
        expiresAt: Date.now() + 60_000,
      },
    });
    expect(canAccess(readImpCtx, "billing.view", { isMutation: false }).allowed).toBe(true);
    expect(() => assertAccess(readImpCtx, "billing.create", { isMutation: true })).toThrow(
      "ACCESS_DENIED:IMPERSONATION_READ_ONLY"
    );
  });

  it("has all 34 canonical permission definitions including customer enquiries, bill history & 15-day trash bin", () => {
    expect(PERMISSION_DEFINITIONS.length).toBe(34);
    const tier1 = makeTenant({ tier: "tier_1" });
    expect(isFeatureEnabled(tier1, "customer_enquiries")).toBe(false);
    expect(isFeatureEnabled(tier1, "bill_edit_history")).toBe(false);
    expect(isFeatureEnabled(tier1, "trash_bin")).toBe(false);
    expect(isFeatureEnabled(tier1, "daily_backups")).toBe(false);

    const tier2 = makeTenant({ tier: "tier_2" });
    expect(isFeatureEnabled(tier2, "bill_edit_history")).toBe(false);
    expect(isFeatureEnabled(tier2, "trash_bin")).toBe(false);
    expect(isFeatureEnabled(tier2, "daily_backups")).toBe(false);

    const tier3 = makeTenant({ tier: "tier_3" });
    expect(isFeatureEnabled(tier3, "bill_edit_history")).toBe(true);
    expect(isFeatureEnabled(tier3, "trash_bin")).toBe(true);
    expect(isFeatureEnabled(tier3, "daily_backups")).toBe(true);

    // Super Admin can unlock Tier 3+ features on Tier 1/2 via feature_overrides
    const tier1WithHistory = makeTenant({
      tier: "tier_1",
      feature_overrides: { bill_edit_history: true, trash_bin: true, daily_backups: true },
    });
    expect(isFeatureEnabled(tier1WithHistory, "bill_edit_history")).toBe(true);
    expect(isFeatureEnabled(tier1WithHistory, "trash_bin")).toBe(true);
    expect(isFeatureEnabled(tier1WithHistory, "daily_backups")).toBe(true);
    expect(canAccess(makeCtx({ tenant: tier1WithHistory }), "billing.history").allowed).toBe(true);
    expect(canAccess(makeCtx({ tenant: tier1WithHistory }), "trash.manage").allowed).toBe(true);

    const tier1WithEnq = makeTenant({ tier: "tier_1", feature_overrides: { customer_enquiries: true } });
    expect(isFeatureEnabled(tier1WithEnq, "customer_enquiries")).toBe(true);
    const workerCtx = makeCtx({
      tenant: tier1WithEnq,
      user: { ...makeCtx().user, role: "worker" },
      permissions: resolveRolePermissions("worker", []),
    });
    expect(canAccess(workerCtx, "enquiries.view").allowed).toBe(true);
    expect(canAccess(workerCtx, "enquiries.manage").allowed).toBe(false);
    const branchAdminCtx = makeCtx({
      tenant: tier1WithEnq,
      user: { ...makeCtx().user, role: "branch_admin" },
      permissions: resolveRolePermissions("branch_admin", []),
    });
    expect(canAccess(branchAdminCtx, "enquiries.manage").allowed).toBe(true);
  });

  it("verifies scrypt password hashing and CSRF same-origin guard", () => {
    const hashed = hashPassword("SuperSecret123");
    expect(verifyPassword("SuperSecret123", hashed)).toBe(true);
    expect(verifyPassword("WrongPass", hashed)).toBe(false);

    const sameReq = new Request("https://erp.example.com/api/auth", {
      method: "POST",
      headers: { host: "erp.example.com", origin: "https://erp.example.com" },
    });
    const crossReq = new Request("https://erp.example.com/api/auth", {
      method: "POST",
      headers: { host: "erp.example.com", origin: "https://evil.example.org" },
    });
    expect(isSameOriginRequest(sameReq)).toBe(true);
    expect(isSameOriginRequest(crossReq)).toBe(false);
  });

  it("generates cartesian product variant matrices and deterministic SKUs", () => {
    const combos = generateVariantCombinations([
      { name: "Size", values: ["UK 7", "UK 8"] },
      { name: "Colour", values: ["Black", "Tan"] },
    ]);
    expect(combos).toHaveLength(4);
    expect(buildVariantSku("IMR-101", combos[0])).toBe("IMR-101-UK7-BLACK");
  });
});

describe("per-person tiers", () => {
  const tenant = { tier: "tier_4" as const, feature_overrides: {} };

  it("follows the business plan when no personal tier is set", () => {
    expect(resolveUserFeatures(tenant, null)).toEqual(resolveAllFeatures(tenant));
  });

  it("removes higher-tier modules from a demoted person", () => {
    const features = resolveUserFeatures(tenant, "tier_1");
    expect(features.gst_billing_pdf).toBe(true);
    expect(features.dynamic_stock_matrix).toBe(false);
    expect(features.public_website_cms).toBe(false);
  });

  it("never grants more than the business plan", () => {
    const small = { tier: "tier_1" as const, feature_overrides: {} };
    expect(resolveUserFeatures(small, "tier_4")).toEqual(resolveAllFeatures(small));
    expect(effectiveUserTier("tier_1", "tier_4")).toBe("tier_1");
  });

  it("keeps a module the business disabled switched off", () => {
    const custom = { tier: "tier_4" as const, feature_overrides: { customer_crm: false } };
    expect(resolveUserFeatures(custom, "tier_3").customer_crm).toBe(false);
  });

  it("does not let a custom business add-on bypass a personal tier", () => {
    const custom = { tier: "tier_2" as const, feature_overrides: { public_website_cms: true } };
    expect(resolveUserFeatures(custom, null).public_website_cms).toBe(true);
    expect(resolveUserFeatures(custom, "tier_1").public_website_cms).toBe(false);
  });
});

describe("payment access blocks", () => {
  const baseCtx = {
    user: { is_active: true, role: "owner" },
    tenant: { status: "active" },
    assignedBranchIds: [],
    enabledFeatures: { gst_billing_pdf: true },
    permissions: { "billing.view": true },
    impersonation: null,
  };
  const block = { scope: "user", message: null, amountDue: 500, contact: null, blockedAt: null };

  it("has no block by default", () => {
    expect(resolveAccessBlock({ access_blocked: false }, { access_blocked: false })).toBeNull();
  });

  it("gives a business block priority over a personal block", () => {
    const result = resolveAccessBlock(
      { access_blocked: true, access_block_amount: "1500.50" },
      { access_blocked: true, access_block_amount: 20 }
    );
    expect(result?.scope).toBe("business");
    expect(result?.amountDue).toBe(1500.5);
  });

  it("denies every permission while blocked", () => {
    const ctx = { ...baseCtx, accessBlock: block } as never;
    expect(canAccess(ctx, "billing.view")).toEqual({ allowed: false, reason: "ACCESS_BLOCKED" });
  });

  it("restores access after unblocking", () => {
    expect(canAccess({ ...baseCtx, accessBlock: null } as never, "billing.view").allowed).toBe(true);
  });

  it("keeps platform support sessions working", () => {
    const ctx = { ...baseCtx, accessBlock: block, impersonation: { mode: "read" } } as never;
    expect(canAccess(ctx, "billing.view").allowed).toBe(true);
  });
});
