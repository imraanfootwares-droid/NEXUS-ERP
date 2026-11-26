import React from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Database,
  History,
  Image as ImageIcon,
  Minus,
  ShieldCheck,
  Sliders,
  Trash2,
} from "lucide-react";
import {
  FEATURE_DEPENDENCIES,
  FEATURE_KEYS,
  FEATURE_META,
  TIER_DEFAULT_FEATURES,
  TIER_META,
  type FeatureKey,
  type TierKey,
} from "@/lib/constants/saas";

export const revalidate = 120;

const TIERS: TierKey[] = ["tier_1", "tier_2", "tier_3", "tier_4"];

const NEW_HIGHLIGHTS_BY_TIER: Record<
  TierKey,
  Array<{ title: string; detail: string; isNew?: boolean }>
> = {
  tier_1: [
    {
      title: "10 Creative Bill Designs (5 GST + 5 Normal)",
      detail: "Pick separate layouts for GST Tax Invoices and Normal Bills across A4, A5, 80mm & 58mm.",
      isNew: true,
    },
    {
      title: "My Profile, Bank & GST Setup",
      detail: "Save shop address, GST number, Bank Account/IFSC/UPI & Signatory once for every bill.",
      isNew: true,
    },
    {
      title: "Normal Bill / GST Bill Toggle + Ship-To",
      detail: "Switch bill mode in 1 tap and print separate Billing & Delivery addresses.",
      isNew: true,
    },
    {
      title: "1-Click Manual Full Data Download",
      detail: "Owners can download a complete copy of their business data anytime on demand.",
    },
  ],
  tier_2: [
    {
      title: "Searchable 1,000+ Customer Sidebar",
      detail: "Instant search by name, phone, or GSTIN with Wholesale / Retail / Has Due filters.",
      isNew: true,
    },
    {
      title: "Customer Statement PDF, Excel & CSV",
      detail: "Account statement PDF matches the dashboard with summary totals and bill details.",
      isNew: true,
    },
    {
      title: "Visual Stock Status & Reorder Alerts",
      detail: "Dashboard cards with product photos, brand, HSN, sizes, colours & prices.",
      isNew: true,
    },
    {
      title: "Product Options Studio + Live Preview",
      detail: "Create & edit Sizes, Colours & Extra Product Details with an interactive live preview.",
      isNew: true,
    },
  ],
  tier_3: [
    {
      title: "Edit Old Bills + History & 1-Click Revert",
      detail: "Fix finalized customer & supplier bills with Before → After history and auto stock/balance sync.",
      isNew: true,
    },
    {
      title: "15-Day Trash Bin & 1-Click Restore",
      detail: "Accidentally deleted a bill, purchase, or expense? Restore it in 1 click within 15 days (auto-clears after 15 days).",
      isNew: true,
    },
    {
      title: "Supplier Purchase Bills + Inline Add Product",
      detail: "Create new products right inside a Supplier Purchase Bill so Stock & Supplier Due update in one step.",
      isNew: true,
    },
    {
      title: "Automated Daily Cloud Backups & Multi-Shop",
      detail: "Nightly cloud backups (skips idle shops), branch-to-branch transfers & combined profit reports.",
    },
  ],
  tier_4: [
    {
      title: "Bulk Multi-Size & Multi-Colour Inquiry Cart",
      detail: "Buyers can pick multiple sizes & colours with +/- steppers or type quantities directly.",
      isNew: true,
    },
    {
      title: "Structured WhatsApp Inquiry Messages",
      detail: "Clean itemized WhatsApp orders grouped by product, model code, sizes, colours & totals.",
      isNew: true,
    },
    {
      title: "Live Photo Showcase Website (/s/your-shop)",
      detail: "Fast mobile-ready storefront with compressed WebP gallery and custom domain support.",
    },
    {
      title: "1-Click PDF Catalogue & Enquiries Inbox",
      detail: "Downloadable photo brochure for WhatsApp + built-in Enquiries inbox with status tracking.",
      isNew: true,
    },
  ],
};

const PREMIUM_ADMIN_ADDONS: Array<{
  key: FeatureKey;
  resourceImpact: "Light DB" | "Medium DB" | "Cloud / R2" | "Heavy PDF / R2";
  adminNote: string;
}> = [
  {
    key: "bill_edit_history",
    resourceImpact: "Medium DB",
    adminNote: "Unlock Edit Finalized Bills, Version History & 1-Click Revert for Tier 1/2 shops. Auto-trimmed to per-tenant caps.",
  },
  {
    key: "trash_bin",
    resourceImpact: "Light DB",
    adminNote: "Unlock the 15-Day Trash Bin & 1-Click Restore for selected Tier 1/2 shops. Auto-purges expired items after 15 days.",
  },
  {
    key: "daily_backups",
    resourceImpact: "Cloud / R2",
    adminNote: "Enable nightly automated cloud backups for selected Tier 1/2 shops. Skips unchanged businesses automatically.",
  },
  {
    key: "public_website_cms",
    resourceImpact: "Cloud / R2",
    adminNote: "Activate a live public storefront & product photo gallery as a paid add-on on any lower tier (default 200 photos).",
  },
  {
    key: "pdf_catalogue_export",
    resourceImpact: "Heavy PDF / R2",
    adminNote: "Enable WhatsApp PDF brochure downloads (edge-cached) for selected wholesalers.",
  },
  {
    key: "customer_enquiries",
    resourceImpact: "Light DB",
    adminNote: "Turn on the built-in Customer Enquiries Inbox alongside WhatsApp routing.",
  },
  {
    key: "supplier_and_production",
    resourceImpact: "Light DB",
    adminNote: "Give a Tier 2 retail/wholesale shop full Supplier Ledgers, Purchase Bills & inline Create Product.",
  },
  {
    key: "multi_branch_ledgers",
    resourceImpact: "Light DB",
    adminNote: "Enable separate stock ledgers per shop or godown (requires Size/Colour Stock Matrix).",
  },
  {
    key: "stock_transfers",
    resourceImpact: "Light DB",
    adminNote: "Unlock Send Stock branch transfers with IGST Invoice / Delivery Challan (requires Multi-Branch).",
  },
  {
    key: "owner_profit_analytics",
    resourceImpact: "Medium DB",
    adminNote: "Unlock combined Owner Profit & weighted-average cost analytics for a Tier 1/2 owner.",
  },
];

const SUPER_ADMIN_QUOTAS = [
  {
    label: "Max Product Photos",
    defaultVal: "200 photos",
    range: "10 – 10,000",
    desc: "Protects cloud photo storage; Super Admin can extend or shorten per customer.",
    icon: ImageIcon,
  },
  {
    label: "Max Edits Kept Per Bill",
    defaultVal: "50 versions",
    range: "5 – 500",
    desc: "Older revisions per bill are auto-trimmed on save to keep your database fast and lean.",
    icon: History,
  },
  {
    label: "Trash Bin Auto-Clear",
    defaultVal: "15 days",
    range: "Automatic",
    desc: "Deleted bills, purchases & expenses clear automatically after 15 days with zero manual work.",
    icon: Trash2,
  },
  {
    label: "Bill History Retention",
    defaultVal: "180 days",
    range: "7 – 3,650 days",
    desc: "Nightly housekeeping clears expired history snapshots past each shop's window.",
    icon: Database,
  },
  {
    label: "Staff Seats & Branches",
    defaultVal: "5–15 seats · 1–10 shops",
    range: "Custom per shop",
    desc: "Expand staff logins or branch slots individually without changing plan tiers.",
    icon: Sliders,
  },
  {
    label: "Per-Person Access & Pause",
    defaultVal: "Instant toggle",
    range: "Per user or shop",
    desc: "Adjust individual staff access or pause overdue accounts in 1 click.",
    icon: ShieldCheck,
  },
];

const NEW_KEYS = new Set<FeatureKey>([
  "bill_designer",
  "customer_crm",
  "bill_edit_history",
  "trash_bin",
  "supplier_and_production",
  "public_website_cms",
  "customer_enquiries",
]);

export default function FeaturesAndPlansPage() {
  const categories = Array.from(new Set(FEATURE_KEYS.map((k) => FEATURE_META[k].category)));

  return (
    <div className="min-h-screen bg-white text-[#0B0F19]">
      {/* Luminous Sky-Blue Aurora Hero matching public/landing.html */}
      <div
        className="relative overflow-hidden pb-16 pt-6"
        style={{
          background:
            "radial-gradient(ellipse 68% 54% at 15% 18%, rgba(169, 203, 255, 0.72) 0%, rgba(212, 229, 255, 0.25) 55%, transparent 80%), radial-gradient(ellipse 60% 58% at 88% 12%, rgba(162, 199, 255, 0.78) 0%, rgba(214, 231, 255, 0.28) 50%, transparent 78%), linear-gradient(180deg, #DBE8FF 0%, #E3EEFF 46%, #EAF2FF 74%, #FFFFFF 100%)",
        }}
      >
        <div className="mx-auto max-w-[1120px] px-5 sm:px-6">
          {/* Exact Floating Glass Navbar from landing.html */}
          <header className="flex items-center justify-between gap-4 rounded-2xl border border-white/90 bg-white/95 px-4 py-2.5 shadow-[0_10px_34px_rgba(30,82,180,0.08)] backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-[19px] font-semibold tracking-[-0.03em] text-[#0B0F19]">
                Nexus ERP
              </Link>
              <span className="hidden rounded-lg border border-[#2475FF]/10 bg-[#EEF4FF] px-2.5 py-1 text-[11px] font-medium text-[#34425B] sm:inline-flex">
                {FEATURE_KEYS.length} Modules · 4 Tiers
              </span>
            </div>

            <nav className="hidden items-center gap-7 text-[13.5px] font-medium text-[#1E2432] md:flex">
              <Link href="/" className="transition-colors hover:text-[#2475FF]">
                Home
              </Link>
              <a href="#tiers" className="transition-colors hover:text-[#2475FF]">
                Plans
              </a>
              <a href="#admin-addons" className="transition-colors hover:text-[#2475FF]">
                Admin Add-Ons
              </a>
              <a href="#matrix" className="transition-colors hover:text-[#2475FF]">
                Full Matrix
              </a>
            </nav>

            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="inline-flex items-center gap-1 rounded-xl border border-[#E8EEF7] bg-[#F4F7FD] px-3 py-2 text-xs font-medium text-[#1E2432] transition-colors hover:bg-[#EAF1FF] md:hidden"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Home
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white shadow-[0_8px_20px_rgba(16,19,26,0.18)] transition-transform hover:-translate-y-0.5"
                style={{ background: "linear-gradient(180deg, #252B37 0%, #10131A 100%)" }}
              >
                Login
              </Link>
            </div>
          </header>

          {/* Hero Copy */}
          <section className="mx-auto max-w-3xl pt-12 text-center sm:pt-16">
            <span className="inline-flex items-center rounded-lg border border-[#2475FF]/10 bg-[#EEF4FF] px-3.5 py-1.5 text-xs font-medium text-[#34425B]">
              Plans, Modules &amp; Super Admin Controls
            </span>
            <h1 className="mt-4 text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-[#0B0F19] sm:text-[48px]">
              Every Feature by Plan &amp; Platform Admin Add-Ons
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-sm leading-relaxed text-[#5F6B7E] sm:text-[15.5px]">
              Start simple with billing and GST, then grow into stock, 15-day Trash Bin, bill edit history,
              multi-branch transfers, and your live WhatsApp storefront. Platform Super Admin can unlock any module
              individually without changing tiers.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <a
                href="#tiers"
                className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(36,117,255,0.28)] transition-transform hover:-translate-y-0.5"
                style={{ background: "linear-gradient(135deg, #2173FF 0%, #5C9DFF 58%, #8EB9FF 100%)" }}
              >
                Explore All 4 Plans
              </a>
              <a
                href="#admin-addons"
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8EEF7] bg-white px-5 py-2.5 text-xs font-semibold text-[#1E2432] shadow-xs transition-colors hover:bg-[#F4F7FD]"
              >
                Super Admin Add-Ons
              </a>
              <a
                href="#matrix"
                className="inline-flex items-center gap-2 rounded-xl border border-[#E8EEF7] bg-white px-5 py-2.5 text-xs font-semibold text-[#1E2432] shadow-xs transition-colors hover:bg-[#F4F7FD]"
              >
                Compare All {FEATURE_KEYS.length} Modules
              </a>
            </div>
          </section>
        </div>
      </div>

      <main className="mx-auto max-w-[1120px] space-y-20 px-5 py-12 sm:px-6 sm:py-16">
        {/* Section 1: 4 Plan Cards */}
        <section id="tiers" className="scroll-mt-24 space-y-8">
          <div className="text-center">
            <span className="inline-flex items-center rounded-lg border border-[#2475FF]/10 bg-[#EEF4FF] px-3.5 py-1.5 text-xs font-medium text-[#34425B]">
              4 Clean Plans
            </span>
            <h2 className="mt-3 text-[28px] font-medium tracking-[-0.03em] text-[#0B0F19] sm:text-[38px]">
              What&apos;s Included in Each Tier
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[#5F6B7E]">
              Every tier includes everything from lower tiers, plus new capabilities built for growing shops.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
            {TIERS.map((tier) => {
              const meta = TIER_META[tier];
              const isFeatured = tier === "tier_3";
              const highlights = NEW_HIGHLIGHTS_BY_TIER[tier];
              const moduleCount = TIER_DEFAULT_FEATURES[tier].length;
              return (
                <div
                  key={tier}
                  className={`flex flex-col rounded-[20px] border p-5 transition-shadow ${
                    isFeatured
                      ? "border-[#2475FF] bg-white shadow-[0_22px_48px_-24px_rgba(36,117,255,0.38)] ring-1 ring-[#2475FF]/20"
                      : "border-[#E8EEF7] bg-[#F7F9FE]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${
                        isFeatured
                          ? "bg-[#2475FF] text-white"
                          : "bg-[#EEF4FF] text-[#34425B]"
                      }`}
                    >
                      {tier.replace("_", " ")}
                    </span>
                    <span className="text-[11px] font-medium text-[#5F6B7E]">{moduleCount} modules</span>
                  </div>

                  <h3 className="mt-3 text-[16px] font-semibold tracking-[-0.02em] text-[#0B0F19]">
                    {meta.name.replace(/^Tier \d — /, "")}
                  </h3>

                  <div className="mt-2.5 flex items-baseline gap-2 tabular-nums">
                    <span className="text-[26px] font-semibold tracking-[-0.03em] text-[#0B0F19]">
                      ₹{meta.priceInr.toLocaleString("en-IN")}
                    </span>
                    <span className="text-xs text-[#8A94A6] line-through">
                      ₹{meta.marketPriceInr.toLocaleString("en-IN")}
                    </span>
                  </div>
                  <p className="mt-1 text-[11.5px] font-medium text-[#5F6B7E]">
                    Up to {meta.maxUsers} staff · {meta.maxBranches} {meta.maxBranches === 1 ? "branch" : "branches"}
                  </p>
                  <p className="mt-2.5 text-xs leading-relaxed text-[#5F6B7E]">{meta.summary}</p>

                  <div className="my-4 h-px bg-[#E8EEF7]" />

                  <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#2475FF]">
                    Key Highlights
                  </p>
                  <ul className="mt-3 flex-1 space-y-3">
                    {highlights.map((h) => (
                      <li key={h.title} className="flex items-start gap-2.5">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#2475FF] text-white">
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold leading-snug text-[#0B0F19]">
                            {h.title}
                            {h.isNew && (
                              <span className="ml-1.5 inline-flex rounded-full bg-[#DCFCE7] px-1.5 py-0.5 text-[9.5px] font-bold text-[#15803D]">
                                NEW
                              </span>
                            )}
                          </p>
                          <p className="mt-0.5 text-[11px] leading-snug text-[#5F6B7E]">{h.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Platform Super Admin Controls (Exact .px-admin-box dark-grad theme from landing.html) */}
        <section
          id="admin-addons"
          className="scroll-mt-24 rounded-[24px] p-6 text-white shadow-[0_26px_54px_-24px_rgba(11,15,25,0.48)] sm:p-9"
          style={{ background: "linear-gradient(180deg, #252B37 0%, #10131A 100%)" }}
        >
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-6">
            <div className="max-w-2xl space-y-2.5">
              <span className="inline-flex items-center rounded-full border border-[#5A9BFF]/35 bg-[#2475FF]/20 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#B5D2FF]">
                Platform Super Admin Controls
              </span>
              <h2 className="text-[24px] font-semibold tracking-[-0.03em] text-white sm:text-[32px]">
                Premium Features Unlockable Per Customer
              </h2>
              <p className="text-xs leading-relaxed text-white/75 sm:text-sm">
                From the Platform Admin Mix &amp; Match Studio, you can turn any Tier 3 or Tier 4 module ON for a
                Tier 1 or Tier 2 customer (or pause heavy modules on trial accounts) — keeping your cloud usage
                lean and free-tier friendly.
              </p>
            </div>
            <Link
              href="/login?portal=super"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-semibold text-[#0B0F19] transition-transform hover:-translate-y-0.5"
            >
              Open Platform Admin →
            </Link>
          </div>

          {/* Add-On Grid */}
          <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {PREMIUM_ADMIN_ADDONS.map((addon) => {
              const meta = FEATURE_META[addon.key];
              const deps = FEATURE_DEPENDENCIES[addon.key] ?? [];
              return (
                <div
                  key={addon.key}
                  className="flex flex-col justify-between rounded-[16px] border border-white/10 bg-white/[0.06] p-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <span className="rounded-md bg-[#2475FF]/25 px-2 py-0.5 text-[10px] font-semibold text-[#B5D2FF]">
                        Default: {meta.minTier.replace("_", " ").toUpperCase()}+
                      </span>
                      <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[10px] font-medium text-white/85">
                        {addon.resourceImpact}
                      </span>
                    </div>
                    <h3 className="mt-2.5 text-[14px] font-semibold text-white">
                      {meta.label}
                      {NEW_KEYS.has(addon.key) && (
                        <span className="ml-1.5 rounded-full bg-[#DCFCE7] px-1.5 py-0.5 text-[9.5px] font-bold text-[#15803D]">
                          NEW
                        </span>
                      )}
                    </h3>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-white/70">{addon.adminNote}</p>
                  </div>
                  {deps.length > 0 && (
                    <p className="mt-3 border-t border-white/10 pt-2 text-[10.5px] text-white/55">
                      Requires: {deps.map((d) => FEATURE_META[d].label).join(" + ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Per-Customer Quotas & Guardrails */}
          <div className="mt-8 border-t border-white/10 pt-6">
            <h3 className="text-sm font-semibold text-white">Per-Customer Quotas &amp; Free-Tier Guardrails</h3>
            <p className="mt-1 text-xs text-white/65">
              Configurable individually per business so your server, database, and cloud storage never get overloaded.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SUPER_ADMIN_QUOTAS.map((q) => {
                const Icon = q.icon;
                return (
                  <div key={q.label} className="rounded-[14px] border border-white/10 bg-white/[0.04] p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white">
                        <Icon className="h-3.5 w-3.5 text-[#5A9BFF]" />
                        {q.label}
                      </span>
                      <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-semibold text-[#B5D2FF]">
                        {q.defaultVal}
                      </span>
                    </div>
                    <p className="mt-1.5 text-[11px] leading-relaxed text-white/65">{q.desc}</p>
                    <p className="mt-1.5 text-[10px] text-white/45">Range: {q.range}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 3: Complete 21-Module Comparison Matrix (Exact .px-table theme from landing.html) */}
        <section id="matrix" className="scroll-mt-24 space-y-6">
          <div className="text-center">
            <span className="inline-flex items-center rounded-lg border border-[#2475FF]/10 bg-[#EEF4FF] px-3.5 py-1.5 text-xs font-medium text-[#34425B]">
              Full Comparison
            </span>
            <h2 className="mt-3 text-[28px] font-medium tracking-[-0.03em] text-[#0B0F19] sm:text-[38px]">
              Compare All {FEATURE_KEYS.length} Modules
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-[#5F6B7E]">
              Every module included per plan — with <strong className="text-[#0B0F19]">Admin Add-On</strong> badges
              for modules Super Admin can enable individually on lower tiers.
            </p>
          </div>

          <div className="overflow-x-auto rounded-[20px] border border-[#E8EEF7] bg-white shadow-[0_14px_38px_-22px_rgba(30,82,180,0.12)]">
            <table className="w-full min-w-[780px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#E8EEF7] bg-[#F7F9FE]">
                  <th className="w-[36%] px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#5F6B7E]">
                    Module &amp; Description
                  </th>
                  {TIERS.map((t) => (
                    <th
                      key={t}
                      className={`px-3 py-4 text-center ${
                        t === "tier_3" ? "bg-[#2475FF]/[0.06]" : ""
                      }`}
                    >
                      <span className="block text-[14px] font-semibold text-[#0B0F19]">
                        {t.replace("_", " ").replace(/^t/, "T")}
                      </span>
                      <span className="block text-[11px] font-normal text-[#5F6B7E]">
                        {TIER_META[t].name.replace(/^Tier \d — /, "")}
                      </span>
                      <span className="mt-1 block text-xs font-semibold tabular-nums text-[#2475FF]">
                        ₹{TIER_META[t].priceInr.toLocaleString("en-IN")}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#2475FF]/[0.08]">
                {categories.map((cat) => {
                  const catKeys = FEATURE_KEYS.filter((k) => FEATURE_META[k].category === cat);
                  return (
                    <React.Fragment key={`cat-${cat}`}>
                      <tr className="bg-[#F4F7FD]">
                        <td
                          colSpan={5}
                          className="px-5 py-2.5 text-[13px] font-semibold text-[#0B0F19]"
                        >
                          {cat}
                        </td>
                      </tr>
                      {catKeys.map((key) => {
                        const meta = FEATURE_META[key];
                        const isNew = NEW_KEYS.has(key);
                        const isAdminAddon = meta.minTier === "tier_3" || meta.minTier === "tier_4";
                        return (
                          <tr key={key} className="transition-colors hover:bg-[#F1F6FF]">
                            <td className="px-5 py-3.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-[13px] font-medium text-[#1E2432]">{meta.label}</span>
                                {isNew && (
                                  <span className="rounded-full bg-[#DCFCE7] px-2 py-0.5 text-[9.5px] font-bold text-[#15803D]">
                                    NEW
                                  </span>
                                )}
                                {isAdminAddon && (
                                  <span className="rounded-full border border-[#D97706]/25 bg-[#FEF3C7] px-2 py-0.5 text-[9.5px] font-bold text-[#B45309]">
                                    Admin Add-On
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 text-[11.5px] text-[#5F6B7E]">{meta.description}</p>
                            </td>
                            {TIERS.map((t) => {
                              const included = TIER_DEFAULT_FEATURES[t].includes(key);
                              return (
                                <td
                                  key={t}
                                  className={`px-3 py-3.5 text-center ${
                                    t === "tier_3" ? "bg-[#2475FF]/[0.04]" : ""
                                  }`}
                                >
                                  {included ? (
                                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#2475FF] text-white">
                                      <Check className="h-3 w-3" strokeWidth={3} />
                                    </span>
                                  ) : (
                                    <span
                                      title={isAdminAddon ? "Can be unlocked by Super Admin" : undefined}
                                      className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#F1F3F8] text-[#A4ADBC]"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Clean Footer matching landing.html */}
      <footer className="border-t border-[#E8EEF7] bg-[#F7F9FE] py-8">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center justify-between gap-4 px-5 text-xs text-[#5F6B7E] sm:px-6">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-[#0B0F19]">Nexus ERP</span>
            <span>·</span>
            <span>Multi-Branch Billing, Stock &amp; Storefront Platform</span>
          </div>
          <div className="flex items-center gap-5 font-medium text-[#1E2432]">
            <Link href="/" className="hover:text-[#2475FF]">Home</Link>
            <Link href="/login" className="hover:text-[#2475FF]">Business Login</Link>
            <Link href="/login?portal=super" className="hover:text-[#2475FF]">Platform Admin</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
