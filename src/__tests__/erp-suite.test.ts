import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  canAccess,
  getRequiredPrerequisites,
  isFeatureEnabled,
  resolveAllFeatures,
  resolveRolePermissions,
} from "@/lib/auth/access";
import { hashPassword, verifyPassword } from "@/lib/auth/crypto";
import {
  FEATURE_DEPENDENCIES,
  FEATURE_KEYS,
  FEATURE_META,
  TIER_DEFAULT_FEATURES,
  TIER_META,
} from "@/lib/constants/saas";
import {
  parseCommaList,
  removeCategoryTemplate,
  resolveCategoryTemplates,
  resolveColoursForCategory,
  resolveCustomFieldsForCategory,
  resolveSizesForCategory,
  upsertCategoryTemplate,
  VERTICAL_CATEGORY_PRESETS,
} from "@/lib/catalog/category-templates";
import { buildVariantSku, generateVariantCombinations } from "@/lib/catalog/verticals";
import { getPageGuide } from "@/lib/help/page-guides";
import { resolveLedgerConfig } from "@/lib/ledger/defaults";
import { splitBillImageNote } from "@/lib/ledger/party-ledger";
import {
  buildPurchaseBillAiPrompt,
  FREE_VISION_AI_CHATS,
  parsePurchaseBillAiResponse,
} from "@/lib/ledger/purchase-bill-ai";
import { GET as getPublicLanding } from "@/app/api/public/landing/route";
import type { SessionContext, TenantRow } from "@/types/database";

function makeTenant(overrides?: Partial<TenantRow>): TenantRow {
  return {
    id: "t-suite-1",
    name: "Suite Footwear",
    slug: "suite-footwear",
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
  const role = overrides?.user?.role ?? "owner";
  return {
    user: {
      id: "u-suite-1",
      tenant_id: tenant.id,
      is_platform_admin: false,
      role,
      full_name: "Shop Owner",
      email: "owner@example.com",
      username: "owner",
      phone: null,
      session_version: 1,
      must_change_password: false,
      is_active: true,
      created_at: new Date().toISOString(),
      ...overrides?.user,
    },
    tenant,
    branches: [],
    assignedBranchIds: ["b-1"],
    permissions: resolveRolePermissions(role, []),
    enabledFeatures: resolveAllFeatures(tenant),
    impersonation: null,
    ...overrides,
  };
}

describe("Nexus ERP — Full Application Suite", () => {
  describe("1. Tier Matrix & Super Admin On-Demand Overrides (25 Modules)", () => {
    it("defines all 25 canonical feature keys with metadata and monotonic tier defaults", () => {
      expect(FEATURE_KEYS).toHaveLength(25);
      for (const key of FEATURE_KEYS) {
        expect(FEATURE_META[key]).toBeDefined();
        expect(FEATURE_META[key].label.length).toBeGreaterThan(2);
      }
      // Tier 4 includes every single feature
      expect(TIER_DEFAULT_FEATURES.tier_4).toHaveLength(FEATURE_KEYS.length);
      for (const key of TIER_DEFAULT_FEATURES.tier_1) {
        expect(TIER_DEFAULT_FEATURES.tier_2).toContain(key);
      }
      for (const key of TIER_DEFAULT_FEATURES.tier_2) {
        expect(TIER_DEFAULT_FEATURES.tier_3).toContain(key);
      }
      for (const key of TIER_DEFAULT_FEATURES.tier_3) {
        expect(TIER_DEFAULT_FEATURES.tier_4).toContain(key);
      }
    });

    it("enables category_size_presets and visual_product_builder across ALL tiers (Tier 1–4)", () => {
      for (const tier of ["tier_1", "tier_2", "tier_3", "tier_4"] as const) {
        const tenant = makeTenant({ tier });
        expect(isFeatureEnabled(tenant, "category_size_presets")).toBe(true);
        expect(isFeatureEnabled(tenant, "visual_product_builder")).toBe(true);
        const ctx = makeCtx({ tenant });
        expect(canAccess(ctx, "settings.catalog_schema", { isMutation: true }).allowed).toBe(true);
      }
    });

    it("keeps ai_bill_scanner and bill_photo_archive locked to Tier 3 & Tier 4 by default", () => {
      for (const tier of ["tier_1", "tier_2"] as const) {
        const tenant = makeTenant({ tier });
        expect(isFeatureEnabled(tenant, "ai_bill_scanner")).toBe(false);
        expect(isFeatureEnabled(tenant, "bill_photo_archive")).toBe(false);
        expect(canAccess(makeCtx({ tenant }), "suppliers.manage")).toEqual({
          allowed: false,
          reason: "FEATURE_DISABLED",
        });
      }

      for (const tier of ["tier_3", "tier_4"] as const) {
        const tenant = makeTenant({ tier });
        expect(isFeatureEnabled(tenant, "ai_bill_scanner")).toBe(true);
        expect(isFeatureEnabled(tenant, "bill_photo_archive")).toBe(true);
        expect(canAccess(makeCtx({ tenant }), "suppliers.manage").allowed).toBe(true);
      }
    });

    it("lets Platform Super Admin unlock ai_bill_scanner and bill_photo_archive individually on Tier 1", () => {
      // Neither has hard prerequisites so toggling either one on Tier 1 works immediately
      expect(getRequiredPrerequisites("ai_bill_scanner")).toEqual([]);
      expect(getRequiredPrerequisites("bill_photo_archive")).toEqual([]);
      expect(FEATURE_DEPENDENCIES.ai_bill_scanner).toBeUndefined();
      expect(FEATURE_DEPENDENCIES.bill_photo_archive).toBeUndefined();

      const tier1AiOnly = makeTenant({
        tier: "tier_1",
        feature_overrides: { ai_bill_scanner: true },
      });
      expect(isFeatureEnabled(tier1AiOnly, "ai_bill_scanner")).toBe(true);
      expect(isFeatureEnabled(tier1AiOnly, "bill_photo_archive")).toBe(false);
      expect(isFeatureEnabled(tier1AiOnly, "supplier_and_production")).toBe(false);

      const ownerCtx = makeCtx({ tenant: tier1AiOnly });
      // Owner can open Suppliers, save purchase bills, and auto-create scanned products
      expect(canAccess(ownerCtx, "suppliers.manage", { isMutation: true }).allowed).toBe(true);
      expect(canAccess(ownerCtx, "stock.manage", { isMutation: true }).allowed).toBe(true);
      // Production batches & full Stock View remain locked to their own features
      expect(canAccess(ownerCtx, "production.record").reason).toBe("FEATURE_DISABLED");
      expect(canAccess(ownerCtx, "stock.view").reason).toBe("FEATURE_DISABLED");

      // Worker role still cannot bypass permissions even when ai_bill_scanner is enabled
      const workerCtx = makeCtx({
        tenant: tier1AiOnly,
        user: { ...makeCtx().user, role: "worker" },
      });
      expect(canAccess(workerCtx, "suppliers.manage")).toEqual({
        allowed: false,
        reason: "PERMISSION_DENIED",
      });

      // Photo archive alone also unlocks supplier purchase bill entry on Tier 1
      const tier1PhotoOnly = makeTenant({
        tier: "tier_1",
        feature_overrides: { bill_photo_archive: true },
      });
      expect(isFeatureEnabled(tier1PhotoOnly, "bill_photo_archive")).toBe(true);
      expect(isFeatureEnabled(tier1PhotoOnly, "ai_bill_scanner")).toBe(false);
      expect(canAccess(makeCtx({ tenant: tier1PhotoOnly }), "suppliers.manage", { isMutation: true }).allowed).toBe(true);
    });
  });

  describe("2. Landing Page & Public Pricing API Parity", () => {
    it("returns all 4 plans and all 25 modules from /api/public/landing", async () => {
      const res = await getPublicLanding();
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        plans: Array<{ key: string; name: string }>;
        features: Array<{
          key: string;
          minTier: string;
          isNew: boolean;
          premiumAddon: boolean;
          requires: string[];
          tiers: Record<string, boolean>;
        }>;
      };

      expect(body.plans).toHaveLength(Object.keys(TIER_META).length);
      expect(body.features).toHaveLength(25);

      const byKey = new Map(body.features.map((f) => [f.key, f]));
      expect(byKey.get("category_size_presets")?.tiers.tier_1).toBe(true);
      expect(byKey.get("visual_product_builder")?.tiers.tier_1).toBe(true);

      const ai = byKey.get("ai_bill_scanner");
      expect(ai?.minTier).toBe("tier_3");
      expect(ai?.premiumAddon).toBe(true);
      expect(ai?.requires).toEqual([]);
      expect(ai?.tiers).toEqual({ tier_1: false, tier_2: false, tier_3: true, tier_4: true });

      const photo = byKey.get("bill_photo_archive");
      expect(photo?.minTier).toBe("tier_3");
      expect(photo?.premiumAddon).toBe(true);
      expect(photo?.requires).toEqual([]);
      expect(photo?.tiers).toEqual({ tier_1: false, tier_2: false, tier_3: true, tier_4: true });
    });

    it("keeps public/landing.html fallback JSON & copy synced with all 25 modules", () => {
      const html = fs.readFileSync(path.join(process.cwd(), "public", "landing.html"), "utf8");
      expect(html).toContain("All 25 Modules");
      expect(html).toContain("Free AI Physical Bill Scanner");
      expect(html).toContain("Visual Block Product Builder");
      expect(html).toContain("category_size_presets");
      expect(html).toContain("visual_product_builder");
      expect(html).toContain("ai_bill_scanner");
      expect(html).toContain("bill_photo_archive");
    });
  });

  describe("3. Dynamic Category Sizes & 5 Vertical Presets", () => {
    it("exposes all 5 business vertical presets with non-empty categories and sizes", () => {
      const expectedVerticals = ["footwear", "apparel", "electronics", "fmcg", "hardware"];
      expect(VERTICAL_CATEGORY_PRESETS).toHaveLength(5);
      for (const v of expectedVerticals) {
        const preset = VERTICAL_CATEGORY_PRESETS.find((p) => p.key === v);
        expect(preset, `Missing vertical preset: ${v}`).toBeDefined();
        expect(preset!.categories.length).toBeGreaterThanOrEqual(3);
        for (const tpl of preset!.categories) {
          expect(tpl.category.length).toBeGreaterThan(0);
          expect(tpl.default_sizes.length).toBeGreaterThan(0);
        }
      }
    });

    it("resolves category-specific sizes, colours, and attached fields dynamically", () => {
      const templates = resolveCategoryTemplates({}, "footwear");
      expect(resolveSizesForCategory(templates, "Men's Footwear", []).sizes).toContain("8");
      expect(resolveSizesForCategory(templates, "Baby Footwear", []).sizes).toContain("0-3M");
      expect(resolveColoursForCategory(templates, "Women's Footwear", []).colours.length).toBeGreaterThan(0);

      const updated = upsertCategoryTemplate(templates, {
        category: "Safety Boots",
        default_sizes: parseCommaList("UK 7, UK 8, UK 9, UK 10"),
        default_colours: parseCommaList("Black, Brown"),
        default_pieces_per_carton: 10,
        extra_fields: ["Steel Toe", "Sole Material"],
      });
      expect(resolveSizesForCategory(updated, "Safety Boots", []).sizes).toEqual(["UK 7", "UK 8", "UK 9", "UK 10"]);
      expect(resolveCustomFieldsForCategory(updated, "Safety Boots", []).fields.map((f) => f.label)).toEqual([
        "Steel Toe",
        "Sole Material",
      ]);

      const removed = removeCategoryTemplate(updated, "Safety Boots");
      expect(removed.find((t) => t.category === "Safety Boots")).toBeUndefined();
    });
  });

  describe("4. Free AI Physical Bill Scanner & Photo Archive Helpers", () => {
    it("lists 5 free vision-capable AI providers with HTTPS launch links", () => {
      expect(FREE_VISION_AI_CHATS.length).toBeGreaterThanOrEqual(5);
      const ids = FREE_VISION_AI_CHATS.map((p) => p.id);
      expect(ids).toEqual(expect.arrayContaining(["chatgpt", "gemini", "aistudio", "deepseek", "claude"]));
      for (const p of FREE_VISION_AI_CHATS) {
        expect(p.url.startsWith("https://")).toBe(true);
      }
    });

    it("builds a structured prompt from tenant categories and parses fenced AI JSON cleanly", () => {
      const prompt = buildPurchaseBillAiPrompt({
        supplierName: "Agra Leather & Soles Co.",
        categoryTemplates: resolveCategoryTemplates({}, "footwear"),
        existingProducts: [{ id: "p-cs", name: "Comfort Slide Pro", code: "CS-101" }],
      });
      expect(prompt).toContain("Agra Leather & Soles Co.");
      expect(prompt).toContain("Comfort Slide Pro");
      expect(prompt).toContain("Men's Footwear");

      const aiReply = [
        "Here is the extracted JSON:",
        "```json",
        JSON.stringify({
          bill_no: "PUR-991",
          paid_amount: 1000,
          payment_mode: "upi",
          items: [
            {
              product_name: "Comfort Slide Pro",
              model_code: "CS-101",
              category: "Men's Footwear",
              colour: "Black",
              sizes: { "7": 10, "8": 10 },
              total_qty: 20,
              cost_price: 210,
              selling_price: 450,
              gst_rate: 12,
            },
            {
              product_name: "Monsoon Clog",
              model_code: "MC-205",
              category: "Women's Footwear",
              colour: "Peach",
              sizes: { "5": 12 },
              total_qty: 12,
              cost_price: 165,
              selling_price: 399,
              gst_rate: 5,
            },
          ],
          other_charges: [{ name: "Freight / Transport", qty: 1, rate: 450 }],
        }),
        "```",
      ].join("\n");

      const parsed = parsePurchaseBillAiResponse(aiReply, [
        { id: "p-cs", name: "Comfort Slide Pro", code: "CS-101" },
      ]);

      expect(parsed.ok).toBe(true);
      if (parsed.ok) {
        expect(parsed.data.bill_no).toBe("PUR-991");
        expect(parsed.data.paid_amount).toBe(1000);
        expect(parsed.data.items).toHaveLength(2);
        expect(parsed.data.items[0].matchedProductId).toBe("p-cs");
        expect(parsed.data.items[0].isNewProduct).toBe(false);
        expect(parsed.data.items[1].matchedProductId).toBeNull();
        expect(parsed.data.items[1].isNewProduct).toBe(true);
        expect(parsed.data.other_charges).toHaveLength(1);
        expect(parsed.data.other_charges[0].rate).toBe(450);
      }

      const invalid = parsePurchaseBillAiResponse("sorry I could not read the photo", []);
      expect(invalid.ok).toBe(false);
    });

    it("extracts [bill_img:<key>] cleanly from purchase_orders.notes without corrupting user notes", () => {
      const prevPublicUrl = process.env.S3_PUBLIC_URL;
      process.env.S3_PUBLIC_URL = "https://cdn.example.com";
      try {
        const withBoth = splitBillImageNote("Paid half cash [bill_img:tenants/t1/bills/abc.webp]");
        expect(withBoth.cleanNote).toBe("Paid half cash");
        expect(withBoth.billImageUrl).toBe("https://cdn.example.com/tenants/t1/bills/abc.webp");

        const onlyTag = splitBillImageNote("[bill_img:tenants/t1/bills/only.webp]");
        expect(onlyTag.cleanNote).toBeNull();
        expect(onlyTag.billImageUrl).toBe("https://cdn.example.com/tenants/t1/bills/only.webp");

        const plain = splitBillImageNote("Normal delivery note");
        expect(plain.cleanNote).toBe("Normal delivery note");
        expect(plain.billImageUrl).toBeNull();

        expect(splitBillImageNote(null)).toEqual({ cleanNote: null, billImageUrl: null });
      } finally {
        if (prevPublicUrl === undefined) delete process.env.S3_PUBLIC_URL;
        else process.env.S3_PUBLIC_URL = prevPublicUrl;
      }
    });
  });

  describe("5. Core ERP Helpers, Auth Crypto & Plain-English Page Guides", () => {
    it("hashes/verifies passwords, generates SKUs, and resolves ledger defaults", () => {
      const hash = hashPassword("ShopPass#2026");
      expect(verifyPassword("ShopPass#2026", hash)).toBe(true);
      expect(verifyPassword("WrongPass", hash)).toBe(false);

      const combos = generateVariantCombinations([
        { name: "Size", values: ["UK 7", "UK 8"] },
        { name: "Colour", values: ["Black"] },
      ]);
      expect(combos).toHaveLength(2);
      expect(buildVariantSku("RUN-10", { Size: "UK 7", Colour: "Black" })).toContain("RUN-10");

      const ledgerCfg = resolveLedgerConfig(null);
      expect(ledgerCfg.item_columns.length).toBeGreaterThanOrEqual(5);
      expect(ledgerCfg.header_fields.length).toBeGreaterThanOrEqual(3);
    });

    it("provides tailored plain-English How This Page Works guides for every major module", () => {
      const routes = [
        "/dashboard",
        "/dashboard/billing/new",
        "/dashboard/billing",
        "/dashboard/stock",
        "/dashboard/suppliers",
        "/dashboard/customers",
        "/dashboard/customers/ledger/supplier/123",
        "/dashboard/organisation",
        "/dashboard/valuation",
        "/dashboard/settings",
        "/dashboard/trash",
      ];
      for (const route of routes) {
        const guide = getPageGuide(route);
        expect(guide.title).not.toBe("How This Page Works");
        expect(guide.steps.length).toBeGreaterThanOrEqual(3);
      }
    });
  });
});
