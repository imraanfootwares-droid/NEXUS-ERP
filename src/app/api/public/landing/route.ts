import { NextResponse } from "next/server";
import {
  FEATURE_KEYS,
  FEATURE_META,
  TIER_DEFAULT_FEATURES,
  TIER_META,
  type TierKey,
} from "@/lib/constants/saas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIERS = Object.keys(TIER_META) as TierKey[];

/** Public data for the landing page: plans, what each includes, and where "Sign In" goes. */
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

  const features = FEATURE_KEYS.map((key) => ({
    key,
    label: FEATURE_META[key].label,
    category: FEATURE_META[key].category,
    description: FEATURE_META[key].description,
    tiers: Object.fromEntries(TIERS.map((tier) => [tier, TIER_DEFAULT_FEATURES[tier].includes(key)])),
  }));

  // Keep the landing page decoupled from active sessions in other tabs so users always see Login.
  const account = { signedIn: false, href: "/login" };

  return NextResponse.json({ plans, features, account }, { headers: { "Cache-Control": "no-store" } });
}
