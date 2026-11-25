import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Database,
  Globe,
  History,
  Image as ImageIcon,
  Layers,
  Minus,
  ShieldCheck,
  Sliders,
  Sparkles,
  Zap,
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
      detail: "Pick separate templates for GST Tax Invoices and Normal Cash Memos across A4, A5, 80mm & 58mm.",
      isNew: true,
    },
    {
      title: "My Profile Static Seller & Bank Details",
      detail: "Configure shop address, GSTIN, Bank Account/IFSC/UPI & Authorised Signatory once for every bill.",
      isNew: true,
    },
    {
      title: "Normal Bill / GST Bill Toggle + Ship-To Consignee",
      detail: "Switch bill mode right beside Current Bill and print separate Billing & Delivery addresses.",
      isNew: true,
    },
    {
      title: "1-Click Manual Full Data Download",
      detail: "Owners can export full business data (Excel, zipped CSV or PDF) anytime on demand.",
    },
  ],
  tier_2: [
    {
      title: "Searchable 1,000+ Customer Right Sidebar",
      detail: "Instant search by name, phone, or GSTIN with Wholesale / Retail / Has Due quick filters.",
      isNew: true,
    },
    {
      title: "Customer Statement PDF, Excel & CSV Exports",
      detail: "Ledger PDF matches the dashboard statement with 4 KPI cards and itemized bill enclosures.",
      isNew: true,
    },
    {
      title: "Visual Stock Status & Reorder Alerts",
      detail: "Dashboard cards with product photos, brand, HSN, sizes, colours & retail/wholesale prices.",
      isNew: true,
    },
    {
      title: "Size × Colour Matrix & Bulk Excel Import",
      detail: "Multi-vertical variants, barcode labels, atomic stock deduction & broken-size alerts.",
    },
  ],
  tier_3: [
    {
      title: "Edit Old Bills + Version History & 1-Click Revert",
      detail: "Modify finalized customer & supplier bills with Before → After diffs and atomic stock/balance sync.",
      isNew: true,
    },
    {
      title: "Supplier Purchase Bills + Inline Create Product",
      detail: "Create new products right inside a Supplier Purchase Bill so Stock & Supplier Due update in one step.",
      isNew: true,
    },
    {
      title: "Automated Daily Cloud Backups (R2)",
      detail: "Nightly compressed R2 backups that automatically skip idle businesses to save cloud resources.",
    },
    {
      title: "Send Stock Between Branches & Profit Analytics",
      detail: "Dedicated Factory-to-Shop transfers with IGST Invoice / Challan & combined net margin reports.",
    },
  ],
  tier_4: [
    {
      title: "Bulk Multi-Size & Multi-Colour Inquiry Cart",
      detail: "Buyers can type 100s of pairs directly or pick multiple sizes & colours with +/- steppers per row.",
      isNew: true,
    },
    {
      title: "Structured WhatsApp Inquiry Messages",
      detail: "Clean itemized WhatsApp orders grouped by product, model code, sizes, colours & totals.",
      isNew: true,
    },
    {
      title: "Live R2 Photo Showcase Website (/s/your-shop)",
      detail: "2-minute edge-cached storefront with compressed WebP gallery and custom domain support.",
    },
    {
      title: "1-Click PDF Catalogue & Customer Enquiries Inbox",
      detail: "Downloadable photo brochure for WhatsApp + built-in Enquiries inbox with status tracking.",
      isNew: true,
    },
  ],
};

const PREMIUM_ADMIN_ADDONS: Array<{
  key: FeatureKey;
  resourceImpact: "Light DB" | "Medium DB" | "Cloud / R2" | "Heavy PDF / R2";
  tone: string;
  adminNote: string;
}> = [
  {
    key: "bill_edit_history",
    resourceImpact: "Medium DB",
    tone: "bg-sky-50 text-sky-700 border-sky-200",
    adminNote: "Unlock Edit Finalized Bills, Version History & 1-Click Revert for Tier 1/2 shops. Auto-trimmed to per-tenant caps.",
  },
  {
    key: "daily_backups",
    resourceImpact: "Cloud / R2",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
    adminNote: "Enable nightly automated R2 snapshots for selected Tier 1/2 tenants. Skips unchanged businesses automatically.",
  },
  {
    key: "public_website_cms",
    resourceImpact: "Cloud / R2",
    tone: "bg-rose-50 text-rose-700 border-rose-200",
    adminNote: "Activate a live public storefront & R2 WebP product gallery as a paid add-on on any lower tier (default 200 photos).",
  },
  {
    key: "pdf_catalogue_export",
    resourceImpact: "Heavy PDF / R2",
    tone: "bg-rose-50 text-rose-700 border-rose-200",
    adminNote: "Enable server-rendered WhatsApp PDF brochure downloads (2-min CDN cached) for selected wholesalers.",
  },
  {
    key: "customer_enquiries",
    resourceImpact: "Light DB",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    adminNote: "Turn on the built-in Customer Enquiries Inbox alongside WhatsApp routing.",
  },
  {
    key: "supplier_and_production",
    resourceImpact: "Light DB",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    adminNote: "Give a Tier 2 retail/wholesale shop full Supplier Ledgers, Purchase Bills & inline Create Product.",
  },
  {
    key: "multi_branch_ledgers",
    resourceImpact: "Light DB",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    adminNote: "Enable separate stock ledgers per shop or godown (requires Size/Colour Stock Matrix).",
  },
  {
    key: "stock_transfers",
    resourceImpact: "Light DB",
    tone: "bg-emerald-50 text-emerald-700 border-emerald-200",
    adminNote: "Unlock Send Stock branch transfers with IGST Invoice / Delivery Challan (requires Multi-Branch).",
  },
  {
    key: "owner_profit_analytics",
    resourceImpact: "Medium DB",
    tone: "bg-sky-50 text-sky-700 border-sky-200",
    adminNote: "Unlock combined Owner Profit & weighted-average COGS analytics for a Tier 1/2 owner.",
  },
];

const SUPER_ADMIN_QUOTAS = [
  {
    label: "Max Product Photos (R2 Cap)",
    defaultVal: "200 photos",
    range: "10 – 10,000",
    desc: "Protects Cloudflare R2 storage; Super Admin can extend or shorten per workspace.",
    icon: ImageIcon,
  },
  {
    label: "Max Edits Kept Per Bill",
    defaultVal: "50 versions",
    range: "5 – 500",
    desc: "Older revisions per bill are auto-trimmed on save to keep Neon Postgres lean.",
    icon: History,
  },
  {
    label: "Bill History Retention",
    defaultVal: "180 days",
    range: "7 – 3,650 days",
    desc: "Nightly housekeeping sweeps expired revision snapshots past each tenant's window.",
    icon: Database,
  },
  {
    label: "Max R2 Storage Quota",
    defaultVal: "250 MB",
    range: "50 MB+",
    desc: "Hard byte-level storage cap checked before issuing any presigned R2 upload URL.",
    icon: Layers,
  },
  {
    label: "Staff Seats & Branches",
    defaultVal: "5–15 seats · 1–10 branches",
    range: "Custom per tenant",
    desc: "Expand staff logins or branch slots individually without switching plan tiers.",
    icon: Sliders,
  },
  {
    label: "Per-Person Access & Payment Lock",
    defaultVal: "Instant toggle",
    range: "Per user or business",
    desc: "Demote individual staff to a lower tier or pause unpaid workspaces with 1 click.",
    icon: ShieldCheck,
  },
];

const NEW_KEYS = new Set<FeatureKey>([
  "bill_designer",
  "customer_crm",
  "bill_edit_history",
  "supplier_and_production",
  "public_website_cms",
  "customer_enquiries",
]);

export default function FeaturesAndPlansPage() {
  const categories = Array.from(new Set(FEATURE_KEYS.map((k) => FEATURE_META[k].category)));

  return (
    <div className="min-h-screen bg-[#f8fafc] text-[#0b0f19]">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-base font-bold tracking-tight text-slate-900">
              Nexus ERP
            </Link>
            <span className="hidden rounded-full bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold text-sky-700 sm:inline-flex">
              20 Modules · 4 Tiers + Admin Add-Ons
            </span>
          </div>
          <nav className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Home
            </Link>
            <Link
              href="/#pricing"
              className="hidden rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 sm:inline-flex"
            >
              Pricing
            </Link>
            <Link
              href="/s/imraan-footwear"
              className="hidden rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 md:inline-flex"
            >
              Demo Storefront
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1 rounded-lg bg-[#171717] px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-[#2a2a2a]"
            >
              Sign In
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6 sm:py-14">
        {/* Hero */}
        <section className="mx-auto max-w-3xl text-center space-y-4">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-800">
            <Sparkles className="h-3.5 w-3.5" /> Complete Feature Breakdown &amp; Platform Admin Guide
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-5xl">
            Every Feature Per Plan — Plus Premium Admin Add-Ons
          </h1>
          <p className="text-sm leading-relaxed text-slate-600 sm:text-base">
            See all new capabilities included in <strong>Tiers 1–4</strong>, and which premium modules &amp; storage caps your{" "}
            <strong>Platform Super Admin</strong> can enable or adjust individually per customer.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
            <a
              href="#per-plan"
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              See Features Per Plan
            </a>
            <a
              href="#admin-addons"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <Sliders className="h-3.5 w-3.5" /> Platform Admin Add-Ons
            </a>
            <a
              href="#full-matrix"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              Full 20-Module Matrix
            </a>
          </div>
        </section>

        {/* Section 1: What's Included & What's New Per Plan */}
        <section id="per-plan" className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-sky-700">4 Clean Plans</p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                New &amp; Core Features by Tier
              </h2>
            </div>
            <p className="text-xs text-slate-500">
              Each higher tier includes everything from the tiers below it.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            {TIERS.map((tk, idx) => {
              const meta = TIER_META[tk];
              const isFeatured = tk === "tier_3";
              const moduleCount = TIER_DEFAULT_FEATURES[tk].length;
              const highlights = NEW_HIGHLIGHTS_BY_TIER[tk];
              const [tierLabel, tierSubtitle] = meta.name.split("—").map((s) => s.trim());

              return (
                <div
                  key={tk}
                  className={`flex flex-col rounded-2xl border p-5 transition-shadow ${
                    isFeatured
                      ? "border-sky-500 bg-white shadow-lg ring-2 ring-sky-500/15"
                      : "border-slate-200 bg-white shadow-xs"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                        isFeatured ? "bg-sky-600 text-white" : "bg-slate-100 text-slate-700"
                      }`}
                    >
                      {tierLabel}
                    </span>
                    <span className="font-mono text-[11px] font-semibold text-slate-500">
                      {moduleCount} modules
                    </span>
                  </div>

                  <h3 className="mt-3 text-base font-bold text-slate-950">{tierSubtitle}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600">{meta.summary}</p>

                  <div className="mt-4 flex items-baseline gap-2 border-y border-slate-100 py-3">
                    <span className="font-mono text-2xl font-bold text-slate-950">
                      ₹{meta.priceInr.toLocaleString("en-IN")}
                    </span>
                    <span className="font-mono text-xs text-slate-400 line-through">
                      ₹{meta.marketPriceInr.toLocaleString("en-IN")}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <span className="block font-mono font-bold text-slate-900">{meta.maxUsers}</span>
                      <span className="text-slate-500">Staff logins</span>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
                      <span className="block font-mono font-bold text-slate-900">{meta.maxBranches}</span>
                      <span className="text-slate-500">{meta.maxBranches === 1 ? "Branch" : "Branches"}</span>
                    </div>
                  </div>

                  <p className="mt-4 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                    {idx === 0 ? "Key Highlights" : `Added in ${tierLabel}`}
                  </p>
                  <ul className="mt-2.5 flex-1 space-y-2.5">
                    {highlights.map((h) => (
                      <li key={h.title} className="flex items-start gap-2 text-xs">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                          <Check className="h-2.5 w-2.5" />
                        </span>
                        <div>
                          <span className="font-semibold text-slate-900">{h.title}</span>
                          {h.isNew && (
                            <span className="ml-1.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-emerald-800">
                              NEW
                            </span>
                          )}
                          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{h.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 2: Premium Features Unlockable via Platform Super Admin */}
        <section
          id="admin-addons"
          className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 text-white shadow-xl sm:p-8 space-y-6"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl space-y-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/35 bg-amber-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                <Sliders className="h-3.5 w-3.5" /> Platform Super Admin Mix &amp; Match
              </span>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Premium Features You Can Enable Individually Per Customer
              </h2>
              <p className="text-xs leading-relaxed text-slate-300 sm:text-sm">
                From <strong>Platform Console → Workspaces → Mix &amp; Match Feature Studio</strong>, Super Admin can force-enable any Tier 3 or Tier 4 module on a Tier 1 or Tier 2 customer (or disable heavy modules on trial accounts) using{" "}
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] text-sky-300">feature_overrides</code>.
              </p>
            </div>
            <Link
              href="/login?portal=super"
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-slate-950 hover:bg-slate-100"
            >
              Open Platform Admin <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
            {PREMIUM_ADMIN_ADDONS.map((addon) => {
              const meta = FEATURE_META[addon.key];
              const reqs = FEATURE_DEPENDENCIES[addon.key] ?? [];
              return (
                <div
                  key={addon.key}
                  className="flex flex-col justify-between rounded-2xl border border-white/10 bg-white/[0.05] p-4 space-y-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-1.5">
                      <span className="rounded-md bg-white/10 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-sky-300">
                        Default: {meta.minTier.replace("tier_", "Tier ")}+
                      </span>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${addon.tone}`}>
                        {addon.resourceImpact}
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                      {meta.label}
                      {NEW_KEYS.has(addon.key) && (
                        <span className="rounded-full bg-emerald-400/20 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-emerald-300">
                          NEW
                        </span>
                      )}
                    </h3>
                    <p className="text-xs leading-relaxed text-slate-300">{addon.adminNote}</p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-1 border-t border-white/10 pt-2.5 text-[10.5px] text-slate-400">
                    <span className="font-mono">{addon.key}</span>
                    {reqs.length > 0 ? (
                      <span className="text-amber-300">
                        Auto-enables: {reqs.map((r) => FEATURE_META[r].label.split(" ")[0]).join(", ")}
                      </span>
                    ) : (
                      <span className="text-emerald-300">Standalone add-on</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 3: Configurable Storage & Free-Tier Guardrails */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">
                Free-Tier &amp; Cloud Cost Protection
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-950">
                Per-Tenant Quotas Editable by Platform Super Admin
              </h2>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              <Zap className="h-3.5 w-3.5" /> Neon Sleep + Idle Backup Skip + 2-Min Storefront Cache Active
            </span>
          </div>

          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {SUPER_ADMIN_QUOTAS.map((q) => {
              const Icon = q.icon;
              return (
                <div key={q.label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-xs space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-800">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-mono text-[11px] font-bold text-slate-800">
                      {q.defaultVal}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-950">{q.label}</h3>
                  <p className="text-xs leading-relaxed text-slate-600">{q.desc}</p>
                  <p className="font-mono text-[10.5px] text-slate-400">Admin range: {q.range}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Section 4: Full 20-Module Comparison Table */}
        <section id="full-matrix" className="space-y-4">
          <div className="text-center space-y-1">
            <h2 className="text-2xl font-bold tracking-tight text-slate-950">
              Complete 20-Module Plan Matrix
            </h2>
            <p className="text-xs text-slate-600 sm:text-sm">
              Live directly from the ERP feature registry — every module below can also be overridden per customer by Platform Super Admin.
            </p>
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full min-w-[780px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                  <th className="w-[38%] px-4 py-3.5 font-bold">Module &amp; Capability</th>
                  {TIERS.map((tk) => (
                    <th
                      key={tk}
                      className={`px-3 py-3.5 text-center font-bold ${
                        tk === "tier_3" ? "bg-sky-50/70 text-sky-900" : ""
                      }`}
                    >
                      <div className="text-xs uppercase">{tk.replace("tier_", "Tier ")}</div>
                      <div className="font-mono text-[11px] font-semibold text-slate-500">
                        ₹{TIER_META[tk].priceInr.toLocaleString("en-IN")}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-3.5 text-center font-bold text-amber-800">
                    Platform Admin
                  </th>
                </tr>
              </thead>
              {categories.map((cat) => {
                const catFeatures = FEATURE_KEYS.filter((k) => FEATURE_META[k].category === cat);
                return (
                  <tbody key={cat}>
                    <tr className="border-y border-slate-200 bg-slate-100/80">
                      <td colSpan={6} className="px-4 py-2 font-mono text-[11px] font-bold uppercase tracking-wider text-slate-600">
                        {cat}
                      </td>
                    </tr>
                    {catFeatures.map((fk) => {
                      const meta = FEATURE_META[fk];
                      const isPremiumAddon = meta.minTier === "tier_3" || meta.minTier === "tier_4";
                      return (
                        <tr key={fk} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="font-semibold text-slate-900">{meta.label}</span>
                              {NEW_KEYS.has(fk) && (
                                <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-emerald-800">
                                  NEW
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-[11px] text-slate-500">{meta.description}</p>
                          </td>
                          {TIERS.map((tk) => {
                            const included = TIER_DEFAULT_FEATURES[tk].includes(fk);
                            return (
                              <td
                                key={tk}
                                className={`px-3 py-3 text-center ${tk === "tier_3" ? "bg-sky-50/35" : ""}`}
                              >
                                {included ? (
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-600 text-white">
                                    <Check className="h-3 w-3" />
                                  </span>
                                ) : (
                                  <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                                    <Minus className="h-3 w-3" />
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center">
                            {isPremiumAddon ? (
                              <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                                Add-On Toggle
                              </span>
                            ) : (
                              <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                                Overrideable
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                );
              })}
            </table>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-slate-950">Ready to test or configure a workspace?</h3>
            <p className="text-xs text-slate-600">
              Sign in to the ERP Portal, manage customer add-ons in Platform Admin, or preview the live storefront.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/s/imraan-footwear"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
            >
              <Globe className="h-3.5 w-3.5" /> Live Demo Storefront
            </Link>
            <Link
              href="/login?portal=super"
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-900 hover:bg-amber-100"
            >
              <Sliders className="h-3.5 w-3.5" /> Platform Admin
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#171717] px-4 py-2 text-xs font-semibold text-white hover:bg-[#2a2a2a]"
            >
              Open ERP Portal <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
