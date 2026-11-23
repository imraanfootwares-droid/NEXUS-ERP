import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Factory,
  Layers,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Store,
  Truck,
} from "lucide-react";
import { NexusLogo } from "@/components/brand/nexus-logo";
import { FEATURE_META, TIER_DEFAULT_FEATURES, TIER_META, type TierKey } from "@/lib/constants/saas";
import { VERTICAL_PRESETS } from "@/lib/catalog/verticals";

export default function LandingPage() {
  const tiers: TierKey[] = ["tier_1", "tier_2", "tier_3", "tier_4"];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Dark-Slate Hero */}
      <header className="bg-[#0B1120] text-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex items-center justify-between py-4 border-b border-slate-800/80">
            <NexusLogo variant="light" size="md" />
            <div className="flex items-center gap-2 sm:gap-4">
              <a
                href="#pricing"
                className="hidden sm:inline-block text-sm text-slate-300 hover:text-white transition-colors"
              >
                Pricing
              </a>
              <Link
                href="/s/imraan-footwear"
                className="hidden sm:inline-block text-sm text-slate-300 hover:text-white transition-colors"
              >
                Live Demo Storefront
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-sky-400 transition-colors min-h-[44px] sm:min-h-[38px]"
              >
                Sign In
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </nav>

          <div className="py-12 sm:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300">
                <ShieldCheck className="h-3.5 w-3.5" />
                2025–2026 Indian GST Ready • Offline-First PWA
              </div>
              <h1 className="font-display text-3xl sm:text-5xl font-bold tracking-tight leading-tight">
                One ERP for{" "}
                <span className="text-sky-400">Factory, Retail Branches, GST Billing</span> &amp; Live Storefronts.
              </h1>
              <p className="text-slate-300 text-base sm:text-lg max-w-xl">
                Built for Footwear, Apparel, Electronics, FMCG &amp; Hardware businesses. Connect your
                factory floor, wholesale dealers, retail counters, and WhatsApp catalogue on Phone &amp; PC —
                even when internet drops.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-sm font-bold text-slate-950 hover:bg-sky-400 transition-colors min-h-[48px]"
                >
                  Open ERP Portal
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <a
                  href="https://wa.me/919876543210?text=Hi%20I%20want%20to%20book%20a%20Nexus%20ERP%20demo"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-900/70 px-6 py-3 text-sm font-semibold text-white hover:bg-slate-800 transition-colors min-h-[48px]"
                >
                  <MessageCircle className="h-4 w-4 text-emerald-400" />
                  Book Demo on WhatsApp
                </a>
              </div>
            </div>

            {/* Crisp Light Style 4 ERP Preview Card */}
            <div className="lg:col-span-6">
              <div className="rounded-2xl border border-slate-700/80 bg-white text-slate-900 shadow-2xl overflow-hidden">
                <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                    <span className="ml-2 text-xs font-semibold text-slate-600">
                      Style 4 ERP • Imraan Footwear (DEL + CHN)
                    </span>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                    LIVE SYNC
                  </span>
                </div>
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="rounded-xl border border-slate-200 p-3 border-l-4 border-l-sky-600">
                      <p className="text-[10px] font-semibold uppercase text-slate-500">Today Sales</p>
                      <p className="font-display text-base sm:text-lg font-bold text-slate-900 mt-0.5">₹1,42,800</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3 border-l-4 border-l-emerald-600">
                      <p className="text-[10px] font-semibold uppercase text-slate-500">Net Profit</p>
                      <p className="font-display text-base sm:text-lg font-bold text-emerald-700 mt-0.5">₹38,450</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 p-3 border-l-4 border-l-amber-500">
                      <p className="text-[10px] font-semibold uppercase text-slate-500">In-Transit</p>
                      <p className="font-display text-base sm:text-lg font-bold text-slate-900 mt-0.5">240 Pairs</p>
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-700 mb-2">
                      <span>Size × Colour Matrix (IMR-101 Derby)</span>
                      <span className="text-sky-600 whitespace-nowrap">HSN 6403 • 5% GST</span>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5 text-center text-[11px]">
                      {["UK 6", "UK 7", "UK 8", "UK 9", "UK 10"].map((sz, i) => (
                        <div key={sz} className="rounded-lg bg-white border border-slate-200 py-1.5">
                          <div className="text-slate-400">{sz}</div>
                          <div className="font-bold text-slate-900">{[14, 28, 36, 22, 11][i]}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Multi-Vertical Strip */}
      <section className="border-b border-slate-200 bg-slate-50 py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-500 mb-5">
            Dynamic Multi-Vertical Engine — Pre-Configured Presets &amp; Custom Fields
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.values(VERTICAL_PRESETS).map((v) => (
              <div
                key={v.key}
                className="rounded-xl border border-slate-200 bg-white p-3.5 text-center shadow-2xs"
              >
                <p className="text-xs font-bold text-slate-900">{v.name.split(" (")[0]}</p>
                <p className="text-[11px] text-slate-500 mt-1">UOM: {v.defaultUom}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role Workflow */}
      <section className="py-14 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            Built for Owners, Branch Managers &amp; Counter Staff
          </h2>
          <p className="text-slate-600 text-sm sm:text-base mt-2">
            Every permission is customizable in a live Role × Permission Matrix, with offline-first phone billing.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { icon: <Factory className="h-5 w-5 text-sky-600" />, title: "Factory & Production", desc: "Log cutting-to-packed batches, Karigar output & raw-material suppliers." },
            { icon: <Truck className="h-5 w-5 text-sky-600" />, title: "GSTIN Transfers", desc: "Auto IGST Branch Transfer Invoice or Delivery Challan with size-run fill." },
            { icon: <Smartphone className="h-5 w-5 text-sky-600" />, title: "Offline Phone POS", desc: "Scan barcodes, split Cash/UPI/Card & print 80mm thermal or A4 bills offline." },
            { icon: <Store className="h-5 w-5 text-sky-600" />, title: "Storefront & PDF", desc: "Share compressed WebP shoe galleries & 1-click PDF catalogues on WhatsApp." },
          ].map((item) => (
            <div key={item.title} className="rounded-2xl border border-slate-200 p-5 bg-white">
              <div className="h-10 w-10 rounded-xl bg-sky-50 flex items-center justify-center mb-3">
                {item.icon}
              </div>
              <h3 className="font-semibold text-slate-900">{item.title}</h3>
              <p className="text-sm text-slate-600 mt-1">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Tier 1-4 Pricing Matrix */}
      <section id="pricing" className="py-14 bg-slate-50 border-t border-slate-200">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              All 18 Capabilities Across Tiers 1–4
            </h2>
            <p className="text-slate-600 text-sm sm:text-base mt-2">
              Start at any tier and unlock individual features or upgrade anytime.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {tiers.map((tk) => {
              const meta = TIER_META[tk];
              const feats = TIER_DEFAULT_FEATURES[tk];
              const highlight = tk === "tier_4";
              return (
                <div
                  key={tk}
                  className={`rounded-2xl border p-5 flex flex-col justify-between bg-white ${
                    highlight ? "border-sky-600 ring-2 ring-sky-600/20 shadow-lg" : "border-slate-200"
                  }`}
                >
                  <div>
                    <h3 className="font-display font-bold text-base text-slate-900">{meta.name}</h3>
                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="font-display text-2xl font-bold text-slate-900">
                        ₹{meta.priceInr.toLocaleString("en-IN")}
                      </span>
                      <span className="text-xs line-through text-slate-400">
                        ₹{meta.marketPriceInr.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{meta.summary}</p>
                    <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-xs text-slate-700">
                      {feats.map((fk) => (
                        <li key={fk} className="flex items-start gap-2">
                          <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{FEATURE_META[fk].label}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <a
                    href={`https://wa.me/919876543210?text=${encodeURIComponent(`Hi, I am interested in Nexus ERP ${meta.name}`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className={`mt-5 inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-bold min-h-[44px] transition-colors ${
                      highlight
                        ? "bg-sky-600 text-white hover:bg-sky-700"
                        : "bg-slate-900 text-white hover:bg-slate-800"
                    }`}
                  >
                    Enquire for {tk.replace("_", " ").toUpperCase()}
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="bg-[#0B1120] text-slate-400 py-8 text-xs">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <NexusLogo variant="light" size="sm" />
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/login" className="hover:text-white flex items-center gap-1">
              <Layers className="h-3.5 w-3.5" /> Staff Login
            </Link>
            <Link href="/platform" className="hover:text-white flex items-center gap-1">
              <BarChart3 className="h-3.5 w-3.5" /> Application Owner
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
