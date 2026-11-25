import type {
  BillCategory,
  BillDesignStyle,
  BillFormat,
  BillTemplateConfig,
  BillTemplateRow,
  BusinessBillingProfile,
  SellerBankDetails,
  TenantRow,
} from "@/types/database";

export interface ResolvedSellerProfile {
  businessName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  signatoryName: string;
  bankDetails: SellerBankDetails;
  hasBankDetails: boolean;
}

/**
 * Resolves static seller details (shop name, address, phone, email, GSTIN, bank details)
 * from the Business Profile saved inside My Profile, falling back to branch/tenant info.
 */
export function resolveSellerProfile(
  tenant: Pick<TenantRow, "name" | "brand_config">,
  branch?: { name?: string | null; address?: string | null; phone?: string | null; gstin?: string | null } | null
): ResolvedSellerProfile {
  const bp: BusinessBillingProfile = tenant.brand_config?.business_profile ?? {};
  const bank: SellerBankDetails = {
    account_holder: bp.bank_details?.account_holder?.trim() || undefined,
    bank_name: bp.bank_details?.bank_name?.trim() || undefined,
    account_number: bp.bank_details?.account_number?.trim() || undefined,
    ifsc_code: bp.bank_details?.ifsc_code?.trim().toUpperCase() || undefined,
    branch_name: bp.bank_details?.branch_name?.trim() || undefined,
    upi_id: bp.bank_details?.upi_id?.trim() || undefined,
  };

  const businessName = bp.business_name?.trim() || tenant.name || "My Business";
  const address = bp.address?.trim() || tenant.brand_config?.address?.trim() || branch?.address?.trim() || null;
  const phone =
    bp.phone?.trim() ||
    tenant.brand_config?.phone?.trim() ||
    tenant.brand_config?.customer_care?.trim() ||
    branch?.phone?.trim() ||
    null;
  const email = bp.email?.trim() || tenant.brand_config?.email?.trim() || null;
  const gstin = bp.gstin?.trim().toUpperCase() || branch?.gstin?.trim().toUpperCase() || null;
  const signatoryName = bp.signatory_name?.trim() || businessName;
  const hasBankDetails = Boolean(
    bank.account_holder || bank.bank_name || bank.account_number || bank.ifsc_code
  );

  return {
    businessName,
    address,
    phone,
    email,
    gstin,
    signatoryName,
    bankDetails: bank,
    hasBankDetails,
  };
}

export interface BillTemplatePreset {
  id: string;
  billCategory: BillCategory;
  name: string;
  desc: string;
  format: BillFormat;
  design_style: BillDesignStyle;
  accent_color: string;
  show_hsn: boolean;
  show_gst_summary: boolean;
  show_bank_details: boolean;
  show_ship_to: boolean;
  show_upi_qr: boolean;
  header_subtitle: string;
  copy_label: string;
}

/** 5 Creative GST Bill Layouts */
export const GST_TEMPLATE_PRESETS: BillTemplatePreset[] = [
  {
    id: "gst-classic-grid",
    billCategory: "gst",
    name: "Classic Tax Grid",
    desc: "Clean bordered Indian GST invoice with Bill To, Ship To, HSN, Tax & Bank box",
    format: "a4",
    design_style: "gst_classic_grid",
    accent_color: "#1d528a",
    show_hsn: true,
    show_gst_summary: true,
    show_bank_details: true,
    show_ship_to: true,
    show_upi_qr: false,
    header_subtitle: "",
    copy_label: "ORIGINAL",
  },
  {
    id: "gst-executive-band",
    billCategory: "gst",
    name: "Modern Top Banner",
    desc: "Bold color banner header with rounded buyer cards & shaded totals box",
    format: "a4",
    design_style: "gst_executive_band",
    accent_color: "#0f4c81",
    show_hsn: true,
    show_gst_summary: true,
    show_bank_details: true,
    show_ship_to: true,
    show_upi_qr: true,
    header_subtitle: "GST Tax Invoice",
    copy_label: "ORIGINAL",
  },
  {
    id: "gst-sidebar-accent",
    billCategory: "gst",
    name: "Side Stripe Editorial",
    desc: "Stylish vertical color stripe on the left with open, airy typography",
    format: "a4",
    design_style: "gst_sidebar_accent",
    accent_color: "#0f766e",
    show_hsn: true,
    show_gst_summary: true,
    show_bank_details: true,
    show_ship_to: true,
    show_upi_qr: false,
    header_subtitle: "Official Tax Invoice",
    copy_label: "ORIGINAL",
  },
  {
    id: "gst-royal-frame",
    billCategory: "gst",
    name: "Showroom Double Frame",
    desc: "Traditional double-border letterhead style with centered business title",
    format: "a4",
    design_style: "gst_royal_frame",
    accent_color: "#7c2d12",
    show_hsn: true,
    show_gst_summary: true,
    show_bank_details: true,
    show_ship_to: true,
    show_upi_qr: false,
    header_subtitle: "Wholesale & Retail Suppliers",
    copy_label: "ORIGINAL FOR RECIPIENT",
  },
  {
    id: "gst-compact-split",
    billCategory: "gst",
    name: "Bulk Order Compact",
    desc: "High-capacity layout made to fit 15+ items neatly on a single page",
    format: "a4",
    design_style: "gst_compact_split",
    accent_color: "#1e293b",
    show_hsn: true,
    show_gst_summary: true,
    show_bank_details: true,
    show_ship_to: true,
    show_upi_qr: false,
    header_subtitle: "Tax Invoice",
    copy_label: "ORIGINAL",
  },
];

/** 5 Creative Normal Bill Layouts (Non-GST) */
export const NORMAL_TEMPLATE_PRESETS: BillTemplatePreset[] = [
  {
    id: "normal-clean",
    billCategory: "normal",
    name: "Clean Shop Bill",
    desc: "Simple, clear everyday bill with top color line and easy-to-read totals",
    format: "a4",
    design_style: "normal_clean",
    accent_color: "#0284c7",
    show_hsn: false,
    show_gst_summary: false,
    show_bank_details: true,
    show_ship_to: false,
    show_upi_qr: true,
    header_subtitle: "Cash / Credit Bill",
    copy_label: "CUSTOMER COPY",
  },
  {
    id: "normal-banner",
    billCategory: "normal",
    name: "Bold Color Header",
    desc: "Eye-catching color top bar with soft striped item rows and shaded total",
    format: "a4",
    design_style: "normal_banner",
    accent_color: "#0f766e",
    show_hsn: false,
    show_gst_summary: false,
    show_bank_details: true,
    show_ship_to: false,
    show_upi_qr: true,
    header_subtitle: "Shop Receipt",
    copy_label: "ORIGINAL",
  },
  {
    id: "normal-boutique",
    billCategory: "normal",
    name: "Minimal Showroom",
    desc: "Clean black-and-white boutique bill with centered shop name & light lines",
    format: "a4",
    design_style: "normal_boutique",
    accent_color: "#171717",
    show_hsn: false,
    show_gst_summary: false,
    show_bank_details: false,
    show_ship_to: false,
    show_upi_qr: false,
    header_subtitle: "Retail Showroom",
    copy_label: "RECEIPT",
  },
  {
    id: "normal-cash-memo",
    billCategory: "normal",
    name: "Classic Bill Book",
    desc: "Familiar Indian bordered cash memo pad style with signature box",
    format: "a4",
    design_style: "normal_cash_memo",
    accent_color: "#1e3a8a",
    show_hsn: false,
    show_gst_summary: false,
    show_bank_details: true,
    show_ship_to: false,
    show_upi_qr: false,
    header_subtitle: "Cash / Credit Memo",
    copy_label: "ORIGINAL",
  },
  {
    id: "normal-counter",
    billCategory: "normal",
    name: "Express Counter Card",
    desc: "High-contrast dark header with big bold Total & Paid status badge",
    format: "a4",
    design_style: "normal_counter",
    accent_color: "#171717",
    show_hsn: false,
    show_gst_summary: false,
    show_bank_details: true,
    show_ship_to: false,
    show_upi_qr: true,
    header_subtitle: "Quick Counter Bill",
    copy_label: "PAID RECEIPT",
  },
];

export const ALL_BILL_PRESETS: BillTemplatePreset[] = [
  ...NORMAL_TEMPLATE_PRESETS,
  ...GST_TEMPLATE_PRESETS,
];

/** Infers whether a saved BillTemplateRow belongs to "gst" or "normal" */
export function inferTemplateCategory(tpl: Pick<BillTemplateRow, "config">): BillCategory {
  if (tpl.config?.bill_category === "gst" || tpl.config?.bill_category === "normal") {
    return tpl.config.bill_category;
  }
  const style = tpl.config?.design_style ?? "";
  if (style.startsWith("gst_")) return "gst";
  if (style.startsWith("normal_")) return "normal";
  return tpl.config?.show_gst_summary === false ? "normal" : "gst";
}

/** Picks the best matching template for a given invoice (GST vs Normal) */
export function selectTemplateForBill(
  templates: BillTemplateRow[],
  isGstBill: boolean
): BillTemplateRow | null {
  const target: BillCategory = isGstBill ? "gst" : "normal";
  const categoryMatches = templates.filter((t) => inferTemplateCategory(t) === target);
  if (categoryMatches.length > 0) {
    return categoryMatches.find((t) => t.is_default) ?? categoryMatches[0];
  }
  return templates.find((t) => t.is_default) ?? templates[0] ?? null;
}

export function buildDefaultConfigForCategory(
  category: BillCategory,
  seller: ResolvedSellerProfile,
  primaryColor?: string
): BillTemplateConfig {
  const preset = category === "gst" ? GST_TEMPLATE_PRESETS[0] : NORMAL_TEMPLATE_PRESETS[0];
  return {
    bill_category: category,
    header_title: seller.businessName.toUpperCase(),
    header_subtitle: preset.header_subtitle,
    footer_note: "THANKS FOR YOUR BUSINESS",
    terms: "",
    accent_color: category === "gst" ? preset.accent_color : primaryColor || preset.accent_color,
    design_style: preset.design_style,
    show_logo: true,
    show_hsn: preset.show_hsn,
    show_gst_summary: preset.show_gst_summary,
    show_discount: true,
    show_custom_fields: false,
    show_upi_qr: preset.show_upi_qr,
    show_bank_details: preset.show_bank_details,
    show_ship_to: preset.show_ship_to,
    copy_label: preset.copy_label,
    upi_id: seller.bankDetails.upi_id,
  };
}
