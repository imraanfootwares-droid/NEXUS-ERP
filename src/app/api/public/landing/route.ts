import { NextResponse } from "next/server";
import {
  FEATURE_DEPENDENCIES,
  FEATURE_KEYS,
  FEATURE_META,
  TIER_DEFAULT_FEATURES,
  TIER_META,
  type FeatureKey,
  type TierKey,
} from "@/lib/constants/saas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIERS = Object.keys(TIER_META) as TierKey[];

const NEW_FEATURE_KEYS = new Set<FeatureKey>([
  "bill_designer",
  "category_size_presets",
  "visual_product_builder",
  "customer_crm",
  "bill_edit_history",
  "trash_bin",
  "supplier_and_production",
  "ai_bill_scanner",
  "bill_photo_archive",
  "public_website_cms",
  "customer_enquiries",
]);

/** Public data for the landing page: plans, all 25 modules, premium admin add-ons, and auth link. */
export async function GET() {
  const plans = TIERS.map((key) => ({
    key,
    name: TIER_META[key].name,
    summary: TIER_META[key].summary,
    priceInr: TIER_META[key].priceInr,
    marketPriceInr: TIER_META[key].marketPriceInr,
    maxUsers: TIER_META[key].maxUsers,
    maxBranches: TIER_META[key].maxBranches,
  }));

  const features = FEATURE_KEYS.map((key) => {
    const meta = FEATURE_META[key];
    const isPremiumAddon = meta.minTier === "tier_3" || meta.minTier === "tier_4";
    return {
      key,
      label: meta.label,
      category: meta.category,
      minTier: meta.minTier,
      description: meta.description,
      isNew: NEW_FEATURE_KEYS.has(key),
      premiumAddon: isPremiumAddon,
      requires: FEATURE_DEPENDENCIES[key] ?? [],
      tiers: Object.fromEntries(TIERS.map((tier) => [tier, TIER_DEFAULT_FEATURES[tier].includes(key)])),
    };
  });

  // Keep the landing page decoupled from active sessions in other tabs so users always see Login.
  const account = { signedIn: false, href: "/login" };

  return NextResponse.json(
    { plans, features, account },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } }
  );
}
