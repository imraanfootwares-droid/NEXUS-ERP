import type { FeatureKey, PermissionKey, TenantRole, TenantStatus, TierKey } from "@/lib/constants/saas";

export type UiStyleKey = "style_1" | "style_2" | "style_3" | "style_4" | "style_5";
export type TaxMode = "inclusive" | "exclusive" | "none";
export type SupplyType = "intra_state" | "inter_state";
export type InvoiceType = "sale" | "return_credit_note" | "estimate_bill_of_supply";
export type InvoiceStatus = "draft" | "paid" | "partial" | "unpaid" | "cancelled";
export type PaymentMode = "cash" | "upi" | "card" | "bank_transfer";
export type BranchType = "factory" | "retail" | "warehouse";
export type VerticalKey = "footwear" | "apparel" | "electronics" | "fmcg" | "hardware" | "custom";
export type PriceDisplayMode = "retail" | "wholesale" | "hide";
export type EnquiryChannel = "inbox" | "whatsapp" | "both";
export type ProductionStage = "cutting" | "stitching" | "lasting" | "finishing" | "packed";

export interface PosUiConfig {
  layout: "grid" | "list";
  show_thumbs: boolean;
  show_hsn_col: boolean;
  quick_pay_modes: PaymentMode[];
}

export interface LedgerFieldDef {
  key: string;
  label: string;
  enabled: boolean;
  isCustom?: boolean;
}

export interface LedgerConfig {
  item_columns: LedgerFieldDef[];
  header_fields: LedgerFieldDef[];
}

export interface CategoryTemplate {
  category: string;
  default_sizes: string[];
  default_colours: string[];
  default_pieces_per_carton: number;
  extra_fields: string[];
}

export interface BrandConfig {
  logo_key?: string | null;
  logo_thumb_key?: string | null;
  logo_pdf_data_url?: string | null;
  primary_color?: string;
  ui_style?: UiStyleKey;
  tagline?: string;
  address?: string;
  phone?: string;
  email?: string;
  manufacturer_info?: string;
  customer_care?: string;
  pos_ui?: PosUiConfig;
  ledger_config?: LedgerConfig;
  category_templates?: CategoryTemplate[];
}

export interface TaxConfig {
  gst_enabled: boolean;
  default_tax_mode: "inclusive" | "exclusive";
  allow_estimate_mode: boolean;
  allow_negative_stock: boolean;
  hsn_digits: 4 | 6;
  costing: "weighted_avg";
  default_state_code: string;
}

export interface StorefrontConfig {
  price_display: PriceDisplayMode;
  whatsapp_number: string;
  hero_title: string;
  hero_subtitle: string;
  catalogue_price_display?: PriceDisplayMode;
  enquiry_channel?: EnquiryChannel;
  show_sizes?: boolean;
  show_brand?: boolean;
  show_description?: boolean;
  show_carton_info?: boolean;
}

export interface TenantEnquiryItem {
  name: string;
  sku?: string;
  model_code?: string;
  attrs?: string;
  qty: number;
  price?: number | null;
}

export interface TenantEnquiryRow {
  id: string;
  tenant_id: string;
  branch_id: string | null;
  customer_name: string;
  customer_contact: string;
  message: string | null;
  items: TenantEnquiryItem[];
  source: "catalogue" | "storefront" | "product";
  channel: EnquiryChannel;
  status: "new" | "contacted" | "closed";
  created_at: string;
}

export interface TenantRow {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  vertical_key: VerticalKey;
  tier: TierKey;
  status: TenantStatus;
  max_users: number;
  max_branches: number;
  max_storage_mb: number;
  storage_used_bytes: number;
  amc_renewal_date: string | null;
  feature_overrides: Partial<Record<FeatureKey, boolean>>;
  brand_config: BrandConfig;
  tax_config: TaxConfig;
  storefront_config: StorefrontConfig;
  stock_outdated_banner: boolean;
  access_blocked?: boolean;
  access_block_message?: string | null;
  access_block_amount?: number | string | null;
  access_block_contact?: string | null;
  access_blocked_at?: string | null;
  created_at: string;
}

export interface ProfileRow {
  id: string;
  tenant_id: string | null;
  is_platform_admin: boolean;
  role: TenantRole;
  full_name: string;
  email: string | null;
  username: string | null;
  phone: string | null;
  session_version: number;
  must_change_password: boolean;
  is_active: boolean;
  /** Personal access tier. Null follows the business plan. */
  tier_override?: TierKey | null;
  access_blocked?: boolean;
  access_block_message?: string | null;
  access_block_amount?: number | string | null;
  access_block_contact?: string | null;
  access_blocked_at?: string | null;
  created_at: string;
}

export interface BranchRow {
  id: string;
  tenant_id: string;
  name: string;
  code: string;
  type: BranchType;
  gstin: string | null;
  state_code: string;
  address: string | null;
  phone: string | null;
  is_default: boolean;
  is_read_only: boolean;
  created_at: string;
}

export interface ImpersonationState {
  tenantId: string;
  adminId: string;
  mode: "read" | "write";
  expiresAt: number;
}

/** Why a business or person is paused, shown on their payment screen. */
export interface AccessBlock {
  scope: "business" | "user";
  message: string | null;
  amountDue: number | null;
  contact: string | null;
  blockedAt: string | null;
}

export interface SessionContext {
  user: ProfileRow;
  tenant: TenantRow | null;
  branches: BranchRow[];
  assignedBranchIds: string[];
  permissions: Record<PermissionKey, boolean>;
  enabledFeatures: Record<FeatureKey, boolean>;
  impersonation: ImpersonationState | null;
  /** Set while a payment block applies. Support sessions are never blocked. */
  accessBlock?: AccessBlock | null;
}

export interface HsnCodeRow {
  id: string;
  tenant_id: string | null;
  code: string;
  description: string;
  category: string;
  rate_rule_type: "flat" | "price_threshold";
  threshold_amount: number | null;
  rate_below_threshold: number | null;
  rate_above_threshold: number | null;
  default_gst_rate: number;
}

export interface RatioPreset {
  name: string;
  ratios: Record<string, number>;
}

export interface VariantAxisRow {
  id: string;
  tenant_id: string;
  name: string;
  preset_values: string[];
  ratio_presets: RatioPreset[];
  sort_order: number;
}

export interface CustomFieldRow {
  id: string;
  tenant_id: string;
  field_key: string;
  label: string;
  field_type: "text" | "number" | "select" | "boolean" | "date";
  options: string[];
  is_required: boolean;
  show_on_bill: boolean;
  show_on_website: boolean;
  show_in_catalogue: boolean;
  sort_order: number;
}

export interface ProductRow {
  id: string;
  tenant_id: string;
  model_code: string;
  name: string;
  category: string | null;
  brand: string | null;
  uom: string;
  hsn_code: string | null;
  gst_rate: number;
  description: string | null;
  custom_fields: Record<string, string | number | boolean | null>;
  is_published_web: boolean;
  is_new_arrival: boolean;
  primary_image_key: string | null;
  gallery_keys: string[];
  is_active: boolean;
  updated_at: string;
}

export interface ProductVariantRow {
  id: string;
  tenant_id: string;
  product_id: string;
  sku: string;
  barcode: string | null;
  attributes: Record<string, string>;
  cost_price: number;
  avg_cost: number;
  mrp: number;
  selling_price: number;
  wholesale_price: number;
  low_stock_threshold: number;
  is_active: boolean;
  updated_at: string;
}

export interface CustomerRow {
  id: string;
  tenant_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  state_code: string | null;
  address: string | null;
  customer_type: "retail" | "wholesale";
  default_discount_pct: number;
  credit_limit: number;
  credit_days: number;
  current_due: number;
  credit_balance: number;
  is_active: boolean;
  updated_at: string;
}

export type BillFormat = "a4" | "a5" | "thermal_80mm" | "thermal_58mm";
export type BillDesignStyle = "classic" | "modern" | "minimal" | "bordered" | "bold" | "gst_full";

export interface BillTemplateConfig {
  header_title: string;
  header_subtitle: string;
  footer_note: string;
  terms: string;
  accent_color: string;
  design_style?: BillDesignStyle;
  show_logo: boolean;
  show_hsn: boolean;
  show_gst_summary: boolean;
  show_discount: boolean;
  show_custom_fields: boolean;
  show_upi_qr: boolean;
  upi_id?: string;
  bank_details?: string;
}

export interface BillTemplateRow {
  id: string;
  tenant_id: string;
  name: string;
  format: BillFormat;
  is_default: boolean;
  config: BillTemplateConfig;
}
