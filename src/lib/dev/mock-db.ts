import type { PoolClient, QueryResult, QueryResultRow } from "pg";
import { resolveAccessBlock, resolveAllFeatures, resolveUserFeatures, resolveRolePermissions } from "@/lib/auth/access";
import { VERTICAL_PRESETS } from "@/lib/catalog/verticals";
import { PERMISSION_DEFINITIONS, type FeatureKey, type TenantRole, type TierKey } from "@/lib/constants/saas";
import type {
  BillTemplateRow,
  BranchRow,
  CustomFieldRow,
  CustomerRow,
  HsnCodeRow,
  ProfileRow,
  SessionContext,
  TenantRow,
  VariantAxisRow,
} from "@/types/database";
import type { DevPreviewRole } from "./preview";

const T_IMRAAN = "11111111-1111-4111-8111-111111111111";
const T_METRO = "22222222-2222-4222-8222-222222222222";
const B_DEL = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const B_CHN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const B_MET = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3";

const U_PLAT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb0";
const U_OWN = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const U_ADM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const U_WRK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3";
const U_MET = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb4";

interface MockProduct {
  id: string;
  tenant_id: string;
  model_code: string;
  name: string;
  category: string;
  brand: string;
  uom: string;
  hsn_code: string;
  gst_rate: number;
  description: string;
  custom_fields: Record<string, string | number | boolean | null>;
  is_published_web: boolean;
  is_new_arrival: boolean;
  primary_image_key: string | null;
  gallery_keys: string[];
  is_active: boolean;
  updated_at: string;
}

interface MockVariant {
  id: string;
  tenant_id: string;
  product_id: string;
  sku: string;
  barcode: string;
  attributes: Record<string, string>;
  cost_price: number;
  avg_cost: number;
  mrp: number;
  selling_price: number;
  wholesale_price: number;
  low_stock_threshold: number;
  is_active: boolean;
}

interface MockInvoice {
  id: string;
  tenant_id: string;
  branch_id: string;
  invoice_number: string | null;
  invoice_type: string;
  customer_id: string | null;
  customer_snapshot: { name: string; phone?: string | null; gstin?: string | null; state_code?: string | null };
  tax_mode: string;
  supply_type: string;
  subtotal: number;
  discount_amount: number;
  taxable_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  round_off: number;
  grand_total: number;
  paid_amount: number;
  due_amount: number;
  status: string;
  has_oversold: boolean;
  eway_bill_no?: string | null;
  notes?: string | null;
  created_at: string;
}

interface MockInvoiceItem {
  id: string;
  tenant_id: string;
  invoice_id: string;
  variant_id: string | null;
  product_name: string;
  sku: string | null;
  hsn_code: string | null;
  qty: number;
  unit_price: number;
  cost_price_snapshot: number;
  discount_amount: number;
  taxable_value: number;
  gst_rate: number;
  cgst: number;
  sgst: number;
  igst: number;
  line_total: number;
}

interface MockDbState {
  tenants: TenantRow[];
  branches: BranchRow[];
  profiles: ProfileRow[];
  userBranches?: Record<string, string[]>;
  enquiries?: Array<{ id: string; contact: string; business: string; interest: string | null; status: string; ip_hash: string | null; created_at: string }>;
  rolePerms: Array<{ tenant_id: string; role: TenantRole; permission_key: string; allowed: boolean }>;
  globalPerms: Array<{ permission_key: string; default_owner: boolean; default_branch_admin: boolean; default_worker: boolean }>;
  resets: Array<{ id: string; tenant_id: string; user_id: string; identifier_submitted: string; note: string | null; status: string; created_at: string }>;
  audits: Array<{ id: string; tenant_id: string | null; action: string; entity_type: string | null; created_at: string }>;
  hsn: HsnCodeRow[];
  uoms: Array<{ tenant_id: string; code: string; allow_decimal: boolean }>;
  axes: VariantAxisRow[];
  customFields: CustomFieldRow[];
  products: MockProduct[];
  variants: MockVariant[];
  branchStock: Array<{ tenant_id: string; branch_id: string; variant_id: string; quantity: number }>;
  stockLedger: Array<{ id: string; tenant_id: string; branch_id: string; variant_id: string; change_qty: number; balance_after: number; reason: string; notes: string | null; created_at: string }>;
  billTemplates: BillTemplateRow[];
  customers: CustomerRow[];
  invoices: MockInvoice[];
  invoiceItems: MockInvoiceItem[];
  expenses: Array<{ id: string; tenant_id: string; branch_id: string; category: string; amount: number; mode: string; expense_date: string; note: string | null }>;
  dayCloses: Array<{ id: string; tenant_id: string; branch_id: string; close_date: string; expected_cash: number; counted_cash: number; variance_cash: number; upi_total: number; card_total: number }>;
  suppliers: Array<{ id: string; tenant_id: string; name: string; phone: string | null; gstin: string | null; material_type: string | null; current_due: number }>;
  purchases: Array<{ id: string; tenant_id: string; branch_id: string; supplier_id: string; bill_number: string | null; purchase_type: string; total_amount: number; itc_cgst: number; itc_sgst: number; itc_igst: number; paid_amount: number; created_at: string }>;
  batches: Array<{ id: string; tenant_id: string; branch_id: string; batch_number: string; stage: string; karigar_unit_name: string | null; total_units: number; is_stocked: boolean; created_at: string }>;
  transfers: Array<{ id: string; tenant_id: string; doc_type: string; doc_number: string; from_branch_id: string; to_branch_id: string; status: string; transfer_value: number; igst_amount: number; transport_name: string | null; lr_number: string | null; vehicle_no: string | null; eway_bill_no: string | null; created_at: string }>;
  transferItems: Array<{ id: string; tenant_id: string; transfer_id: string; variant_id: string; qty_sent: number; qty_received: number; transfer_price: number; gst_rate: number; discrepancy_note: string | null }>;
  devices: Array<{ id: string; tenant_id: string; branch_id: string; device_no: number; label: string; last_seq: number; is_active: boolean }>;
  backups: Array<{ id: string; tenant_id: string; file_size_bytes: number; trigger_type: string; checksum_sha256: string; created_at: string }>;
}

declare global {
  var __nexusMockDbState: MockDbState | undefined;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

function makeShoeSvg(bg: string, accent: string, code: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="320" viewBox="0 0 320 320"><rect width="320" height="320" rx="28" fill="${bg}"/><path d="M52 204c24-2 52-24 72-52 10 14 26 22 44 22 18 0 34-8 54 6 18 12 42 14 48 24 4 8-2 18-16 18H64c-14 0-20-8-12-18z" fill="${accent}"/><rect x="52" y="222" width="218" height="14" rx="7" fill="#0f172a" opacity="0.22"/><text x="160" y="72" text-anchor="middle" font-family="sans-serif" font-size="22" font-weight="700" fill="${accent}">${code}</text><text x="160" y="276" text-anchor="middle" font-family="sans-serif" font-size="16" font-weight="600" fill="#475569">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function createInitialMockState(): MockDbState {
  const footwear = VERTICAL_PRESETS.footwear;
  const nowIso = new Date().toISOString();

  const tenants: TenantRow[] = [
    {
      id: T_IMRAAN,
      name: "Imraan Footwear",
      slug: "imraan-footwear",
      custom_domain: "imraanfootwear.in",
      vertical_key: "footwear",
      tier: "tier_4",
      status: "active",
      max_users: 10,
      max_branches: 5,
      max_storage_mb: 500,
      storage_used_bytes: 18_400_000,
      amc_renewal_date: "2027-11-22",
      feature_overrides: {},
      brand_config: {
        ui_style: "style_4",
        primary_color: "#0284c7",
        tagline: "Crafted in New Delhi • Retailed in Chennai",
        manufacturer_info: "Imraan Footwear Mfg, Karol Bagh, New Delhi - 110005",
        customer_care: "+91 98400 11223 | care@imraanfootwear.in",
        pos_ui: { layout: "grid", show_thumbs: true, show_hsn_col: true, quick_pay_modes: ["cash", "upi", "card"] },
      },
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
        catalogue_price_display: "retail",
        whatsapp_number: "919840011223",
        hero_title: "Imraan Footwear — New Arrivals 2026",
        hero_subtitle: "Handcrafted leather formals, cushioned sports runners & wholesale cartons direct from our Delhi factory.",
      },
      stock_outdated_banner: false,
      created_at: isoDaysAgo(45),
    },
    {
      id: T_METRO,
      name: "Metro Sports Mart",
      slug: "metro-sports-mart",
      custom_domain: null,
      vertical_key: "footwear",
      tier: "tier_2",
      status: "active",
      max_users: 5,
      max_branches: 1,
      max_storage_mb: 250,
      storage_used_bytes: 4_200_000,
      amc_renewal_date: "2027-08-15",
      feature_overrides: { public_website_cms: true, pdf_catalogue_export: true },
      brand_config: { ui_style: "style_1", primary_color: "#0f172a" },
      tax_config: {
        gst_enabled: true,
        default_tax_mode: "inclusive",
        allow_estimate_mode: false,
        allow_negative_stock: false,
        hsn_digits: 4,
        costing: "weighted_avg",
        default_state_code: "27",
      },
      storefront_config: {
        price_display: "retail",
        whatsapp_number: "919820011223",
        hero_title: "Metro Sports",
        hero_subtitle: "Performance Running & Gym Footwear",
      },
      stock_outdated_banner: false,
      created_at: isoDaysAgo(20),
    },
  ];

  const branches: BranchRow[] = [
    {
      id: B_CHN,
      tenant_id: T_IMRAAN,
      name: "Chennai Retail Shop",
      code: "CHN",
      type: "retail",
      gstin: "33AABCI1234F1Z2",
      state_code: "33",
      address: "42 Pondy Bazaar, T. Nagar, Chennai - 600017",
      phone: "9840011223",
      is_default: true,
      is_read_only: false,
      created_at: isoDaysAgo(45),
    },
    {
      id: B_DEL,
      tenant_id: T_IMRAAN,
      name: "New Delhi Factory",
      code: "DEL",
      type: "factory",
      gstin: "07AABCI1234F1Z5",
      state_code: "07",
      address: "Plot 18, Udyog Nagar Industrial Area, New Delhi - 110041",
      phone: "9811044556",
      is_default: false,
      is_read_only: false,
      created_at: isoDaysAgo(45),
    },
    {
      id: B_MET,
      tenant_id: T_METRO,
      name: "Mumbai Flagship",
      code: "MUM",
      type: "retail",
      gstin: "27AABCM9988K1Z1",
      state_code: "27",
      address: "Linking Road, Bandra, Mumbai",
      phone: "9820011223",
      is_default: true,
      is_read_only: false,
      created_at: isoDaysAgo(20),
    },
  ];

  const profiles: ProfileRow[] = [
    {
      id: U_PLAT,
      tenant_id: null,
      is_platform_admin: true,
      role: "owner",
      full_name: "Mohammad Hassan",
      email: "owner@nexuserp.in",
      username: "superadmin",
      phone: "9876543210",
      session_version: 1,
      must_change_password: false,
      is_active: true,
      created_at: isoDaysAgo(60),
    },
    {
      id: U_OWN,
      tenant_id: T_IMRAAN,
      is_platform_admin: false,
      role: "owner",
      full_name: "Imraan Ahmed",
      email: "imraan@imraanfootwear.in",
      username: "imraan",
      phone: "9840011223",
      session_version: 1,
      must_change_password: false,
      is_active: true,
      created_at: isoDaysAgo(45),
    },
    {
      id: U_ADM,
      tenant_id: T_IMRAAN,
      is_platform_admin: false,
      role: "branch_admin",
      full_name: "Rizwan (Chennai Manager)",
      email: "rizwan@imraanfootwear.in",
      username: "chn_admin",
      phone: "9840077889",
      session_version: 1,
      must_change_password: false,
      is_active: true,
      created_at: isoDaysAgo(40),
    },
    {
      id: U_WRK,
      tenant_id: T_IMRAAN,
      is_platform_admin: false,
      role: "worker",
      full_name: "Arjun (Counter Staff)",
      email: null,
      username: "chn_staff",
      phone: "9840033445",
      session_version: 1,
      must_change_password: false,
      is_active: true,
      created_at: isoDaysAgo(35),
    },
    {
      id: U_MET,
      tenant_id: T_METRO,
      is_platform_admin: false,
      role: "owner",
      full_name: "Vikram Shah",
      email: "vikram@metrosports.in",
      username: "vikram",
      phone: "9820011223",
      session_version: 1,
      must_change_password: false,
      is_active: true,
      created_at: isoDaysAgo(20),
    },
  ];

  const rolePerms: MockDbState["rolePerms"] = [];
  for (const tid of [T_IMRAAN, T_METRO]) {
    for (const p of PERMISSION_DEFINITIONS) {
      for (const role of ["owner", "branch_admin", "worker"] as const) {
        rolePerms.push({ tenant_id: tid, role, permission_key: p.key, allowed: p[role] });
      }
    }
  }

  const globalPerms = PERMISSION_DEFINITIONS.map((p) => ({
    permission_key: p.key,
    default_owner: p.owner,
    default_branch_admin: p.branch_admin,
    default_worker: p.worker,
  }));

  const hsn: HsnCodeRow[] = [
    { id: "hsn-1", tenant_id: null, code: "6403", description: "Footwear with outer soles of rubber/plastics/leather & leather uppers", category: "Footwear", rate_rule_type: "price_threshold", threshold_amount: 2500, rate_below_threshold: 5, rate_above_threshold: 18, default_gst_rate: 5 },
    { id: "hsn-2", tenant_id: null, code: "6404", description: "Sports & canvas footwear with textile uppers", category: "Footwear", rate_rule_type: "price_threshold", threshold_amount: 2500, rate_below_threshold: 5, rate_above_threshold: 18, default_gst_rate: 5 },
    { id: "hsn-3", tenant_id: null, code: "6402", description: "Rubber / PVC / EVA sandals & chappals", category: "Footwear", rate_rule_type: "price_threshold", threshold_amount: 2500, rate_below_threshold: 5, rate_above_threshold: 18, default_gst_rate: 5 },
    { id: "hsn-4", tenant_id: null, code: "4202", description: "Leather belts, wallets & accessories", category: "Accessories", rate_rule_type: "flat", threshold_amount: null, rate_below_threshold: null, rate_above_threshold: null, default_gst_rate: 18 },
  ];

  const axes: VariantAxisRow[] = footwear.defaultAxes.map((ax, i) => ({
    id: `axis-${i + 1}`,
    tenant_id: T_IMRAAN,
    name: ax.name,
    preset_values: ax.preset_values,
    ratio_presets: ax.ratio_presets,
    sort_order: i,
  }));

  const customFields: CustomFieldRow[] = footwear.defaultCustomFields.map((cf, i) => ({
    id: `cf-${i + 1}`,
    tenant_id: T_IMRAAN,
    field_key: cf.field_key,
    label: cf.label,
    field_type: cf.field_type,
    options: cf.options,
    is_required: false,
    show_on_bill: cf.show_on_bill,
    show_on_website: cf.show_on_website,
    show_in_catalogue: cf.show_in_catalogue,
    sort_order: i,
  }));

  const P1 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc1";
  const P2 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc2";
  const P3 = "cccccccc-cccc-4ccc-8ccc-ccccccccccc3";

  const img1 = makeShoeSvg("#f1f5f9", "#0f172a", "IMR-101", "OXFORD DERBY");
  const img2 = makeShoeSvg("#e0f2fe", "#0284c7", "IMR-204", "AEROKNIT RUNNER");
  const img3 = makeShoeSvg("#fef3c7", "#92400e", "IMR-309", "ROYAL LOAFER");

  const products: MockProduct[] = [
    {
      id: P1,
      tenant_id: T_IMRAAN,
      model_code: "IMR-101",
      name: "Oxford Classic Leather Derby",
      category: "Formal",
      brand: "Imraan Signature",
      uom: "Pair",
      hsn_code: "6403",
      gst_rate: 5,
      description: "Full-grain calf leather formal derby with TPR anti-slip sole and memory foam insole.",
      custom_fields: { upper_material: "Full-Grain Leather", sole_type: "TPR", gender: "Men" },
      is_published_web: true,
      is_new_arrival: true,
      primary_image_key: img1,
      gallery_keys: [img1],
      is_active: true,
      updated_at: isoDaysAgo(1),
    },
    {
      id: P2,
      tenant_id: T_IMRAAN,
      model_code: "IMR-204",
      name: "AeroKnit Pro Runner",
      category: "Sports",
      brand: "Imraan Active",
      uom: "Pair",
      hsn_code: "6404",
      gst_rate: 5,
      description: "Breathable engineered mesh running shoe with ultra-light Phylon EVA midsole.",
      custom_fields: { upper_material: "Mesh Knit", sole_type: "Phylon EVA", gender: "Men" },
      is_published_web: true,
      is_new_arrival: true,
      primary_image_key: img2,
      gallery_keys: [img2],
      is_active: true,
      updated_at: isoDaysAgo(2),
    },
    {
      id: P3,
      tenant_id: T_IMRAAN,
      model_code: "IMR-309",
      name: "Royal Handstitched Loafer",
      category: "Casual",
      brand: "Imraan Signature",
      uom: "Pair",
      hsn_code: "6403",
      gst_rate: 18,
      description: "Premium hand-burnished leather moccasin loafer (> ₹2,500 slab: 18% GST).",
      custom_fields: { upper_material: "Genuine Leather", sole_type: "Leather + Rubber", gender: "Men" },
      is_published_web: true,
      is_new_arrival: false,
      primary_image_key: img3,
      gallery_keys: [img3],
      is_active: true,
      updated_at: isoDaysAgo(4),
    },
  ];

  const variants: MockVariant[] = [
    // IMR-101 Black UK 6-10
    { id: "v-101-6b", tenant_id: T_IMRAAN, product_id: P1, sku: "IMR-101-UK6-BLACK", barcode: "8901010061", attributes: { Size: "UK 6", Colour: "Black" }, cost_price: 920, avg_cost: 920, mrp: 2499, selling_price: 2199, wholesale_price: 1450, low_stock_threshold: 5, is_active: true },
    { id: "v-101-7b", tenant_id: T_IMRAAN, product_id: P1, sku: "IMR-101-UK7-BLACK", barcode: "8901010071", attributes: { Size: "UK 7", Colour: "Black" }, cost_price: 920, avg_cost: 920, mrp: 2499, selling_price: 2199, wholesale_price: 1450, low_stock_threshold: 5, is_active: true },
    { id: "v-101-8b", tenant_id: T_IMRAAN, product_id: P1, sku: "IMR-101-UK8-BLACK", barcode: "8901010081", attributes: { Size: "UK 8", Colour: "Black" }, cost_price: 920, avg_cost: 920, mrp: 2499, selling_price: 2199, wholesale_price: 1450, low_stock_threshold: 5, is_active: true },
    { id: "v-101-9b", tenant_id: T_IMRAAN, product_id: P1, sku: "IMR-101-UK9-BLACK", barcode: "8901010091", attributes: { Size: "UK 9", Colour: "Black" }, cost_price: 920, avg_cost: 920, mrp: 2499, selling_price: 2199, wholesale_price: 1450, low_stock_threshold: 5, is_active: true },
    { id: "v-101-10b", tenant_id: T_IMRAAN, product_id: P1, sku: "IMR-101-UK10-BLACK", barcode: "8901010101", attributes: { Size: "UK 10", Colour: "Black" }, cost_price: 920, avg_cost: 920, mrp: 2499, selling_price: 2199, wholesale_price: 1450, low_stock_threshold: 5, is_active: true },
    // IMR-101 Tan UK 7-9
    { id: "v-101-7t", tenant_id: T_IMRAAN, product_id: P1, sku: "IMR-101-UK7-TAN", barcode: "8901010072", attributes: { Size: "UK 7", Colour: "Tan" }, cost_price: 940, avg_cost: 940, mrp: 2499, selling_price: 2199, wholesale_price: 1480, low_stock_threshold: 5, is_active: true },
    { id: "v-101-8t", tenant_id: T_IMRAAN, product_id: P1, sku: "IMR-101-UK8-TAN", barcode: "8901010082", attributes: { Size: "UK 8", Colour: "Tan" }, cost_price: 940, avg_cost: 940, mrp: 2499, selling_price: 2199, wholesale_price: 1480, low_stock_threshold: 5, is_active: true },
    { id: "v-101-9t", tenant_id: T_IMRAAN, product_id: P1, sku: "IMR-101-UK9-TAN", barcode: "8901010092", attributes: { Size: "UK 9", Colour: "Tan" }, cost_price: 940, avg_cost: 940, mrp: 2499, selling_price: 2199, wholesale_price: 1480, low_stock_threshold: 5, is_active: true },
    // IMR-204 Navy UK 7-10
    { id: "v-204-7n", tenant_id: T_IMRAAN, product_id: P2, sku: "IMR-204-UK7-NAVY", barcode: "8902040071", attributes: { Size: "UK 7", Colour: "Navy" }, cost_price: 680, avg_cost: 680, mrp: 1999, selling_price: 1699, wholesale_price: 1100, low_stock_threshold: 6, is_active: true },
    { id: "v-204-8n", tenant_id: T_IMRAAN, product_id: P2, sku: "IMR-204-UK8-NAVY", barcode: "8902040081", attributes: { Size: "UK 8", Colour: "Navy" }, cost_price: 680, avg_cost: 680, mrp: 1999, selling_price: 1699, wholesale_price: 1100, low_stock_threshold: 6, is_active: true },
    { id: "v-204-9n", tenant_id: T_IMRAAN, product_id: P2, sku: "IMR-204-UK9-NAVY", barcode: "8902040091", attributes: { Size: "UK 9", Colour: "Navy" }, cost_price: 680, avg_cost: 680, mrp: 1999, selling_price: 1699, wholesale_price: 1100, low_stock_threshold: 6, is_active: true },
    // IMR-309 Brown UK 8-9 (> ₹2500 -> 18% GST)
    { id: "v-309-8b", tenant_id: T_IMRAAN, product_id: P3, sku: "IMR-309-UK8-BROWN", barcode: "8903090081", attributes: { Size: "UK 8", Colour: "Brown" }, cost_price: 1450, avg_cost: 1450, mrp: 3499, selling_price: 3199, wholesale_price: 2200, low_stock_threshold: 4, is_active: true },
    { id: "v-309-9b", tenant_id: T_IMRAAN, product_id: P3, sku: "IMR-309-UK9-BROWN", barcode: "8903090091", attributes: { Size: "UK 9", Colour: "Brown" }, cost_price: 1450, avg_cost: 1450, mrp: 3499, selling_price: 3199, wholesale_price: 2200, low_stock_threshold: 4, is_active: true },
  ];

  const branchStock: MockDbState["branchStock"] = [
    // Chennai Retail Shop (includes 0 on UK 10 -> triggers Broken Size Run alert!)
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-101-6b", quantity: 8 },
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-101-7b", quantity: 14 },
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-101-8b", quantity: 22 },
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-101-9b", quantity: 3 }, // low stock
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-101-10b", quantity: 0 }, // broken size
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-101-7t", quantity: 9 },
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-101-8t", quantity: 12 },
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-101-9t", quantity: 7 },
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-204-7n", quantity: 15 },
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-204-8n", quantity: 18 },
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-204-9n", quantity: 4 },
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-309-8b", quantity: 10 },
    { tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-309-9b", quantity: 6 },
    // New Delhi Factory (bulk production inventory)
    { tenant_id: T_IMRAAN, branch_id: B_DEL, variant_id: "v-101-6b", quantity: 60 },
    { tenant_id: T_IMRAAN, branch_id: B_DEL, variant_id: "v-101-7b", quantity: 120 },
    { tenant_id: T_IMRAAN, branch_id: B_DEL, variant_id: "v-101-8b", quantity: 150 },
    { tenant_id: T_IMRAAN, branch_id: B_DEL, variant_id: "v-101-9b", quantity: 95 },
    { tenant_id: T_IMRAAN, branch_id: B_DEL, variant_id: "v-101-10b", quantity: 48 },
    { tenant_id: T_IMRAAN, branch_id: B_DEL, variant_id: "v-204-7n", quantity: 80 },
    { tenant_id: T_IMRAAN, branch_id: B_DEL, variant_id: "v-204-8n", quantity: 110 },
    { tenant_id: T_IMRAAN, branch_id: B_DEL, variant_id: "v-309-8b", quantity: 40 },
  ];

  const customers: CustomerRow[] = [
    {
      id: "cust-1",
      tenant_id: T_IMRAAN,
      name: "South India Footwear Distributors",
      phone: "9840199001",
      email: "orders@sifd.in",
      gstin: "33AABCS8821K1Z4",
      state_code: "33",
      address: "Periamet Leather Market, Chennai",
      customer_type: "wholesale",
      default_discount_pct: 5,
      credit_limit: 250000,
      credit_days: 30,
      current_due: 48500,
      credit_balance: 3200,
      is_active: true,
      updated_at: isoDaysAgo(1),
    },
    {
      id: "cust-2",
      tenant_id: T_IMRAAN,
      name: "Karthik Subramanian",
      phone: "9840055441",
      email: null,
      gstin: null,
      state_code: "33",
      address: "Anna Nagar, Chennai",
      customer_type: "retail",
      default_discount_pct: 0,
      credit_limit: 0,
      credit_days: 0,
      current_due: 0,
      credit_balance: 500,
      is_active: true,
      updated_at: isoDaysAgo(0),
    },
    {
      id: "cust-3",
      tenant_id: T_IMRAAN,
      name: "Deccan Retail Shoes (Bengaluru)",
      phone: "9900122334",
      email: "buying@deccanshoes.in",
      gstin: "29AABCD4411M1Z8",
      state_code: "29",
      address: "Commercial Street, Bengaluru",
      customer_type: "wholesale",
      default_discount_pct: 8,
      credit_limit: 500000,
      credit_days: 45,
      current_due: 72000,
      credit_balance: 0,
      is_active: true,
      updated_at: isoDaysAgo(1),
    },
  ];

  const invoices: MockInvoice[] = [
    {
      id: "inv-1",
      tenant_id: T_IMRAAN,
      branch_id: B_CHN,
      invoice_number: "CHN/26-27/0042",
      invoice_type: "sale",
      customer_id: "cust-2",
      customer_snapshot: { name: "Karthik Subramanian", phone: "9840055441", state_code: "33" },
      tax_mode: "inclusive",
      supply_type: "intra_state",
      subtotal: 4398,
      discount_amount: 0,
      taxable_amount: 4188.57,
      cgst_amount: 104.71,
      sgst_amount: 104.72,
      igst_amount: 0,
      round_off: 0,
      grand_total: 4398,
      paid_amount: 4398,
      due_amount: 0,
      status: "paid",
      has_oversold: false,
      created_at: nowIso,
    },
    {
      id: "inv-2",
      tenant_id: T_IMRAAN,
      branch_id: B_DEL,
      invoice_number: "DEL/26-27/0109",
      invoice_type: "sale",
      customer_id: "cust-3",
      customer_snapshot: { name: "Deccan Retail Shoes (Bengaluru)", phone: "9900122334", gstin: "29AABCD4411M1Z8", state_code: "29" },
      tax_mode: "exclusive",
      supply_type: "inter_state",
      subtotal: 87000,
      discount_amount: 2000,
      taxable_amount: 85000,
      cgst_amount: 0,
      sgst_amount: 0,
      igst_amount: 4250,
      round_off: 0,
      grand_total: 89250,
      paid_amount: 17250,
      due_amount: 72000,
      status: "partial",
      has_oversold: false,
      eway_bill_no: "371009884512",
      created_at: isoDaysAgo(1),
    },
    {
      id: "inv-3",
      tenant_id: T_IMRAAN,
      branch_id: B_CHN,
      invoice_number: "CHN1/26-27/0007",
      invoice_type: "sale",
      customer_id: null,
      customer_snapshot: { name: "Walk-In Customer", phone: "9840911220", state_code: "33" },
      tax_mode: "inclusive",
      supply_type: "intra_state",
      subtotal: 3199,
      discount_amount: 0,
      taxable_amount: 2711.02,
      cgst_amount: 243.99,
      sgst_amount: 243.99,
      igst_amount: 0,
      round_off: 0,
      grand_total: 3199,
      paid_amount: 3199,
      due_amount: 0,
      status: "paid",
      has_oversold: true,
      notes: "Offline synced bill",
      created_at: isoDaysAgo(2),
    },
    {
      id: "inv-4",
      tenant_id: T_IMRAAN,
      branch_id: B_CHN,
      invoice_number: null,
      invoice_type: "sale",
      customer_id: "cust-1",
      customer_snapshot: { name: "South India Footwear Distributors", phone: "9840199001", gstin: "33AABCS8821K1Z4", state_code: "33" },
      tax_mode: "exclusive",
      supply_type: "intra_state",
      subtotal: 14500,
      discount_amount: 0,
      taxable_amount: 14500,
      cgst_amount: 362.5,
      sgst_amount: 362.5,
      igst_amount: 0,
      round_off: 0,
      grand_total: 15225,
      paid_amount: 0,
      due_amount: 15225,
      status: "draft",
      has_oversold: false,
      created_at: isoDaysAgo(3),
    },
  ];

  const invoiceItems: MockInvoiceItem[] = [
    { id: "ii-1", tenant_id: T_IMRAAN, invoice_id: "inv-1", variant_id: "v-101-8b", product_name: "Oxford Classic Leather Derby (UK 8 / Black)", sku: "IMR-101-UK8-BLACK", hsn_code: "6403", qty: 2, unit_price: 2199, cost_price_snapshot: 920, discount_amount: 0, taxable_value: 4188.57, gst_rate: 5, cgst: 104.71, sgst: 104.72, igst: 0, line_total: 4398 },
    { id: "ii-2", tenant_id: T_IMRAAN, invoice_id: "inv-2", variant_id: "v-101-8b", product_name: "Oxford Classic Leather Derby (UK 8 / Black)", sku: "IMR-101-UK8-BLACK", hsn_code: "6403", qty: 60, unit_price: 1450, cost_price_snapshot: 920, discount_amount: 2000, taxable_value: 85000, gst_rate: 5, cgst: 0, sgst: 0, igst: 4250, line_total: 89250 },
    { id: "ii-3", tenant_id: T_IMRAAN, invoice_id: "inv-3", variant_id: "v-309-8b", product_name: "Royal Handstitched Loafer (UK 8 / Brown)", sku: "IMR-309-UK8-BROWN", hsn_code: "6403", qty: 1, unit_price: 3199, cost_price_snapshot: 1450, discount_amount: 0, taxable_value: 2711.02, gst_rate: 18, cgst: 243.99, sgst: 243.99, igst: 0, line_total: 3199 },
    { id: "ii-4", tenant_id: T_IMRAAN, invoice_id: "inv-4", variant_id: "v-101-7b", product_name: "Oxford Classic Leather Derby (UK 7 / Black)", sku: "IMR-101-UK7-BLACK", hsn_code: "6403", qty: 10, unit_price: 1450, cost_price_snapshot: 920, discount_amount: 0, taxable_value: 14500, gst_rate: 5, cgst: 362.5, sgst: 362.5, igst: 0, line_total: 15225 },
  ];

  return {
    tenants,
    branches,
    profiles,
    rolePerms,
    globalPerms,
    resets: [
      {
        id: "rst-1",
        tenant_id: T_IMRAAN,
        user_id: U_WRK,
        identifier_submitted: "chn_staff",
        note: "Forgot PIN on Chennai counter phone",
        status: "pending",
        created_at: isoDaysAgo(0),
      },
    ],
    audits: [
      { id: "aud-1", tenant_id: T_IMRAAN, action: "platform.tenant_provisioned", entity_type: "tenant", created_at: isoDaysAgo(2) },
      { id: "aud-2", tenant_id: T_METRO, action: "platform.feature_override (public_website_cms)", entity_type: "tenant", created_at: isoDaysAgo(1) },
      { id: "aud-3", tenant_id: T_IMRAAN, action: "backup.daily_snapshot_uploaded", entity_type: "backup", created_at: isoDaysAgo(0) },
    ],
    hsn,
    uoms: [
      { tenant_id: T_IMRAAN, code: "Pair", allow_decimal: false },
      { tenant_id: T_IMRAAN, code: "Box", allow_decimal: false },
      { tenant_id: T_IMRAAN, code: "Carton", allow_decimal: false },
    ],
    axes,
    customFields,
    products,
    variants,
    branchStock,
    stockLedger: [
      { id: "sl-1", tenant_id: T_IMRAAN, branch_id: B_DEL, variant_id: "v-101-8b", change_qty: 120, balance_after: 150, reason: "production", notes: "DELP/26-27/0014", created_at: isoDaysAgo(2) },
      { id: "sl-2", tenant_id: T_IMRAAN, branch_id: B_DEL, variant_id: "v-101-8b", change_qty: -24, balance_after: 126, reason: "transfer_out", notes: "DELT/26-27/0008", created_at: isoDaysAgo(1) },
      { id: "sl-3", tenant_id: T_IMRAAN, branch_id: B_CHN, variant_id: "v-101-8b", change_qty: -2, balance_after: 22, reason: "sale", notes: "CHN/26-27/0042", created_at: nowIso },
    ],
    billTemplates: [
      {
        id: "tpl-a4",
        tenant_id: T_IMRAAN,
        name: "Standard A4 GST Invoice",
        format: "a4",
        is_default: true,
        config: {
          header_title: "IMRAAN FOOTWEAR",
          header_subtitle: "GST Tax Invoice • New Delhi & Chennai",
          footer_note: "Thank you for shopping with Imraan Footwear!",
          terms: "7-day size exchange with original box & invoice.",
          accent_color: "#0284c7",
          show_logo: true,
          show_hsn: true,
          show_gst_summary: true,
          show_discount: true,
          show_custom_fields: false,
          show_upi_qr: true,
        },
      },
      {
        id: "tpl-80mm",
        tenant_id: T_IMRAAN,
        name: "Chennai Counter 80mm Thermal",
        format: "thermal_80mm",
        is_default: false,
        config: {
          header_title: "IMRAAN FOOTWEAR — CHENNAI",
          header_subtitle: "T. Nagar Retail Counter",
          footer_note: "Visit again!",
          terms: "7-day size exchange.",
          accent_color: "#0f172a",
          show_logo: false,
          show_hsn: true,
          show_gst_summary: true,
          show_discount: true,
          show_custom_fields: false,
          show_upi_qr: true,
        },
      },
    ],
    customers,
    invoices,
    invoiceItems,
    expenses: [
      { id: "exp-1", tenant_id: T_IMRAAN, branch_id: B_CHN, category: "Shop Electricity & AC", amount: 6400, mode: "upi", expense_date: nowIso.slice(0, 10), note: "TANGEDCO monthly bill" },
      { id: "exp-2", tenant_id: T_IMRAAN, branch_id: B_DEL, category: "Karigar Tea & Packing Tape", amount: 1850, mode: "cash", expense_date: isoDaysAgo(1).slice(0, 10), note: "Carton strapping rolls" },
    ],
    dayCloses: [
      { id: "dc-1", tenant_id: T_IMRAAN, branch_id: B_CHN, close_date: isoDaysAgo(1).slice(0, 10), expected_cash: 18450, counted_cash: 18450, variance_cash: 0, upi_total: 24200, card_total: 9800 },
    ],
    suppliers: [
      { id: "sup-1", tenant_id: T_IMRAAN, name: "Agra Tannery & Calf Leather Co.", phone: "9837011223", gstin: "09AABCA7712H1Z3", material_type: "Full-Grain Leather", current_due: 64000 },
      { id: "sup-2", tenant_id: T_IMRAAN, name: "Bahadurgarh TPR & EVA Soles", phone: "9812055667", gstin: "06AABCB4419R1Z1", material_type: "Moulded Soles & Insoles", current_due: 28500 },
    ],
    purchases: [
      { id: "po-1", tenant_id: T_IMRAAN, branch_id: B_DEL, supplier_id: "sup-1", bill_number: "ATC/26-27/441", purchase_type: "raw_material", total_amount: 114000, itc_cgst: 0, itc_sgst: 0, itc_igst: 11400, paid_amount: 50000, created_at: isoDaysAgo(3) },
    ],
    batches: [
      { id: "bat-1", tenant_id: T_IMRAAN, branch_id: B_DEL, batch_number: "DELP/26-27/0014", stage: "packed", karigar_unit_name: "Unit A — Salim Karigar", total_units: 120, is_stocked: true, created_at: isoDaysAgo(2) },
      { id: "bat-2", tenant_id: T_IMRAAN, branch_id: B_DEL, batch_number: "DELP/26-27/0015", stage: "stitching", karigar_unit_name: "Unit B — Farhan Line", total_units: 80, is_stocked: false, created_at: isoDaysAgo(0) },
    ],
    transfers: [
      { id: "tr-1", tenant_id: T_IMRAAN, doc_type: "branch_transfer_invoice", doc_number: "DELT/26-27/0008", from_branch_id: B_DEL, to_branch_id: B_CHN, status: "dispatched", transfer_value: 44160, igst_amount: 2208, transport_name: "VRL Logistics", lr_number: "VRL-882410", vehicle_no: "DL01GB4821", eway_bill_no: null, created_at: isoDaysAgo(1) },
      { id: "tr-2", tenant_id: T_IMRAAN, doc_type: "branch_transfer_invoice", doc_number: "DELT/26-27/0007", from_branch_id: B_DEL, to_branch_id: B_CHN, status: "received", transfer_value: 56400, igst_amount: 2820, transport_name: "SafeExpress", lr_number: "SE-51209", vehicle_no: "HR55K9021", eway_bill_no: "371009112233", created_at: isoDaysAgo(6) },
    ],
    transferItems: [
      { id: "ti-1", tenant_id: T_IMRAAN, transfer_id: "tr-1", variant_id: "v-101-8b", qty_sent: 24, qty_received: 0, transfer_price: 920, gst_rate: 5, discrepancy_note: null },
      { id: "ti-2", tenant_id: T_IMRAAN, transfer_id: "tr-1", variant_id: "v-101-9b", qty_sent: 24, qty_received: 0, transfer_price: 920, gst_rate: 5, discrepancy_note: null },
      { id: "ti-3", tenant_id: T_IMRAAN, transfer_id: "tr-2", variant_id: "v-204-8n", qty_sent: 60, qty_received: 60, transfer_price: 940, gst_rate: 5, discrepancy_note: null },
    ],
    devices: [
      { id: "dev-1", tenant_id: T_IMRAAN, branch_id: B_CHN, device_no: 1, label: "CHN Counter 1 (iPad POS)", last_seq: 7, is_active: true },
      { id: "dev-2", tenant_id: T_IMRAAN, branch_id: B_DEL, device_no: 1, label: "DEL Dispatch Desk", last_seq: 3, is_active: true },
    ],
    backups: [
      { id: "bk-1", tenant_id: T_IMRAAN, file_size_bytes: 248_900, trigger_type: "cron", checksum_sha256: "a8f39e14c0b27f91e04422a1b3c4d5e6", created_at: isoDaysAgo(0) },
      { id: "bk-2", tenant_id: T_IMRAAN, file_size_bytes: 241_120, trigger_type: "manual", checksum_sha256: "7b21cd90a1f45e82d39011f2e3a4b5c6", created_at: isoDaysAgo(1) },
    ],
  };
}

export function getMockState(): MockDbState {
  if (!globalThis.__nexusMockDbState) {
    globalThis.__nexusMockDbState = createInitialMockState();
  }
  return globalThis.__nexusMockDbState;
}

export function getMockSessionContext(role: DevPreviewRole): SessionContext {
  const s = getMockState();
  if (role === "platform_admin") {
    const user = s.profiles.find((p) => p.id === U_PLAT)!;
    return {
      user,
      tenant: null,
      branches: [],
      assignedBranchIds: [],
      permissions: resolveRolePermissions("owner", []),
      enabledFeatures: resolveAllFeatures(null),
      impersonation: null,
    };
  }

  const tenant = s.tenants.find((t) => t.id === T_IMRAAN)!;
  const branches = s.branches.filter((b) => b.tenant_id === tenant.id);
  const userId = role === "owner" ? U_OWN : role === "branch_admin" ? U_ADM : U_WRK;
  const user = s.profiles.find((p) => p.id === userId)!;
  const permRows = s.rolePerms
    .filter((r) => r.tenant_id === tenant.id && r.role === role)
    .map((r) => ({ permission_key: r.permission_key, allowed: r.allowed }));

  return {
    user,
    tenant,
    branches,
    assignedBranchIds: role === "owner" ? branches.map((b) => b.id) : s.userBranches?.[userId] ?? [B_CHN],
    permissions: resolveRolePermissions(role, permRows),
    enabledFeatures: resolveUserFeatures(tenant, user.tier_override),
    impersonation: null,
    accessBlock: resolveAccessBlock(tenant, user),
  };
}

function okResult<T extends QueryResultRow>(rows: unknown[]): QueryResult<T> {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    fields: [],
    rows: rows as T[],
  };
}

export async function mockQuery<T extends QueryResultRow = QueryResultRow>(
  rawSql: string,
  params: unknown[] = []
): Promise<QueryResult<T>> {
  const sql = rawSql.replace(/\s+/g, " ").trim();
  const s = getMockState();

  // Transaction / GUC control no-ops
  if (/^(BEGIN|COMMIT|ROLLBACK|SELECT set_config)/i.test(sql)) {
    return okResult([]);
  }

  if (sql.includes("pg_database_size")) {
    return okResult([{ size_bytes: String(14 * 1024 * 1024) }]);
  }

  // Public storefront resolvers
  if (sql.includes("resolve_tenant_slug") || sql.includes("resolve_tenant_host")) {
    const key = String(params[0] ?? "").toLowerCase();
    const t = s.tenants.find((x) => x.slug.toLowerCase() === key || x.custom_domain?.toLowerCase() === key) ?? s.tenants[0];
    return okResult(
      t
        ? [
            {
              id: t.id,
              name: t.name,
              slug: t.slug,
              status: t.status,
              brand_config: t.brand_config,
              storefront_config: t.storefront_config,
              website_enabled: true,
              catalogue_enabled: true,
            },
          ]
        : []
    );
  }

  if (sql.includes("storefront_products")) {
    const tid = String(params[0] ?? T_IMRAAN);
    const filterProdId = params[1] && sql.includes("product_id = $2") ? String(params[1]) : null;
    const rows = s.products
      .filter((p) => p.tenant_id === tid && p.is_active && p.is_published_web && (!filterProdId || p.id === filterProdId))
      .map((p) => ({
        product_id: p.id,
        model_code: p.model_code,
        name: p.name,
        category: p.category,
        brand: p.brand,
        uom: p.uom,
        description: p.description,
        custom_fields: p.custom_fields,
        is_new_arrival: p.is_new_arrival,
        primary_image_key: p.primary_image_key,
        gallery_keys: p.gallery_keys,
        variants: s.variants
          .filter((v) => v.product_id === p.id && v.is_active)
          .map((v) => ({
            id: v.id,
            sku: v.sku,
            attributes: v.attributes,
            mrp: v.mrp,
            display_price: v.selling_price,
            in_stock: s.branchStock.filter((bs) => bs.variant_id === v.id).reduce((a, b) => a + b.quantity, 0) > 0,
          })),
      }));
    return okResult(rows);
  }

  if (sql.includes("access_block_tenant")) {
    return okResult(s.tenants.filter((x) => x.id === params[0]).map((x) => ({ id: x.id })));
  }

  if (sql.includes("access_block_profile")) {
    return okResult(s.profiles.filter((x) => x.id === params[0]));
  }

  if (sql.includes("access_block_update")) {
    const row = sql.includes("public.tenants")
      ? s.tenants.find((x) => x.id === params[0])
      : s.profiles.find((x) => x.id === params[0]);
    if (row) {
      const blocked = Boolean(params[1]);
      row.access_blocked = blocked;
      row.access_block_message = (params[2] as string | null) ?? null;
      row.access_block_amount = (params[3] as number | null) ?? null;
      row.access_block_contact = (params[4] as string | null) ?? null;
      row.access_blocked_at = blocked ? row.access_blocked_at ?? new Date().toISOString() : null;
    }
    return okResult([]);
  }

  if (sql.includes("access_block_audit")) {
    s.audits.unshift({
      id: `aud-${Date.now()}`,
      tenant_id: String(params[0]),
      action: String(params[2]),
      entity_type: String(params[3]),
      entity_id: String(params[4]),
      metadata: JSON.parse(String(params[5])),
      created_at: new Date().toISOString(),
    } as (typeof s.audits)[number]);
    return okResult([]);
  }

  if (sql.includes("pg_advisory_xact_lock")) return okResult([]);

  if (sql.includes("walk_in_customer_match")) {
    const digits = (v: string | null) => (v ?? "").replace(/\D/g, "").slice(-10);
    const hit = s.customers.find(
      (c) =>
        c.tenant_id === params[0] &&
        ((params[1] && c.gstin?.toUpperCase() === params[1]) || (params[2] && digits(c.phone) === params[2]))
    );
    return okResult(hit ? [{ id: hit.id }] : []);
  }

  if (sql.includes("walk_in_customer_update")) {
    const c = s.customers.find((x) => x.id === params[0]);
    if (c) {
      c.is_active = true;
      c.phone = c.phone || (params[2] as string | null);
      c.gstin = c.gstin || (params[3] as string | null);
      c.state_code = c.state_code || (params[4] as string | null);
    }
    return okResult([]);
  }

  if (sql.includes("walk_in_customer_insert")) {
    const id = `cust-dev-${Date.now()}`;
    s.customers.unshift({
      id,
      tenant_id: String(params[0]),
      name: String(params[1]),
      phone: (params[2] as string | null) ?? null,
      email: null,
      gstin: (params[3] as string | null) ?? null,
      state_code: (params[4] as string | null) ?? null,
      address: null,
      customer_type: "retail",
      default_discount_pct: 0,
      credit_limit: 0,
      credit_days: 0,
      current_due: 0,
      credit_balance: 0,
      is_active: true,
      updated_at: new Date().toISOString(),
    });
    return okResult([{ id }]);
  }

  if (sql.includes("public.landing_enquiries")) {
    s.enquiries ??= [];
    if (sql.includes("COUNT(*)")) return okResult([{ cnt: s.enquiries.filter((e) => e.ip_hash === params[0]).length }]);
    if (sql.includes("LOWER(contact)")) {
      return okResult(
        s.enquiries.filter(
          (e) => e.contact.toLowerCase() === String(params[0]).toLowerCase() && e.business.toLowerCase() === String(params[1]).toLowerCase()
        )
      );
    }
    if (sql.startsWith("INSERT")) {
      s.enquiries.unshift({
        id: `enq-${Date.now()}`,
        contact: String(params[0]),
        business: String(params[1]),
        interest: (params[2] as string | null) ?? null,
        status: "new",
        ip_hash: String(params[3]),
        created_at: new Date().toISOString(),
      });
      return okResult([]);
    }
    if (sql.startsWith("UPDATE")) {
      const row = s.enquiries.find((e) => e.id === params[1]);
      if (row) row.status = String(params[0]);
      return okResult([]);
    }
    return okResult(s.enquiries);
  }

  const inScope = (branchId: string) => !Array.isArray(params[1]) || (params[1] as string[]).includes(branchId);

  if (sql.includes("DELETE FROM public.user_branch_assignments")) {
    s.userBranches = { ...s.userBranches, [String(params[0])]: [] };
    return okResult([]);
  }

  if (sql.includes("INSERT INTO public.user_branch_assignments") && sql.includes("RETURNING branch_id")) {
    const ids = (params[2] as string[]).filter((id) => s.branches.some((b) => b.id === id && b.tenant_id === params[1]));
    s.userBranches = { ...s.userBranches, [String(params[0])]: ids };
    return okResult(ids.map((branch_id) => ({ branch_id })));
  }

  if (sql.includes("SELECT user_id, branch_id FROM public.user_branch_assignments")) {
    return okResult(
      s.profiles
        .filter((x) => !x.is_platform_admin && x.role !== "owner")
        .flatMap((x) => (s.userBranches?.[x.id] ?? [B_CHN]).map((branch_id) => ({ user_id: x.id, branch_id })))
    );
  }

  if (sql.includes("person_tier_lookup")) {
    const person = s.profiles.find((x) => x.id === params[0]);
    if (!person) return okResult([]);
    const tenant = s.tenants.find((x) => x.id === person.tenant_id);
    return okResult([{ ...person, tier_override: person.tier_override ?? null, plan_tier: tenant?.tier ?? null }]);
  }

  if (sql.includes("UPDATE public.profiles SET tier_override")) {
    const person = s.profiles.find((x) => x.id === params[1]);
    if (person) person.tier_override = (params[0] as TierKey | null) ?? null;
    return okResult([]);
  }

  if (sql.includes("trend_buckets")) {
    const tid = sql.includes("tenant_id = $1") ? String(params[0]) : null;
    const buckets = new Map<string, { grain: string; bucket: string; total: number; due: number; bills: number }>();
    const add = (grain: string, bucket: string, total: number, due: number) => {
      const key = `${grain}:${bucket}`;
      const cur = buckets.get(key) ?? { grain, bucket, total: 0, due: 0, bills: 0 };
      cur.total += total;
      cur.due += due;
      cur.bills += 1;
      buckets.set(key, cur);
    };
    for (const inv of s.invoices) {
      if ((tid && inv.tenant_id !== tid) || !inScope(inv.branch_id) || inv.invoice_type !== "sale" || ["draft", "cancelled"].includes(inv.status)) continue;
      const ist = new Date(new Date(inv.created_at).getTime() + 5.5 * 60 * 60 * 1000);
      const day = ist.toISOString().slice(0, 10);
      const monday = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - ((ist.getUTCDay() + 6) % 7)));
      add("day", day, inv.grand_total, inv.due_amount);
      add("week", monday.toISOString().slice(0, 10), inv.grand_total, inv.due_amount);
      add("month", `${day.slice(0, 7)}-01`, inv.grand_total, inv.due_amount);
    }
    return okResult([...buckets.values()].map((b) => ({ ...b, total: String(b.total), due: String(b.due), bills: String(b.bills) })));
  }

  if (sql.includes("recent_invoices")) {
    return okResult(
      s.invoices
        .filter((i) => i.tenant_id === params[0] && inScope(i.branch_id) && i.invoice_type === "sale" && i.status !== "draft")
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
        .slice(0, 8)
        .map((i) => ({
          id: i.id,
          invoice_number: i.invoice_number,
          customer_name: i.customer_snapshot?.name ?? null,
          branch_name: s.branches.find((b) => b.id === i.branch_id)?.name ?? "",
          grand_total: String(i.grand_total),
          due_amount: String(i.due_amount),
          status: i.status,
          created_at: i.created_at,
        }))
    );
  }

  // Dashboard Overview aggregates
  if (sql.includes("AS today_sales")) {
    const tid = String(params[0]);
    const valid = s.invoices.filter((i) => i.tenant_id === tid && inScope(i.branch_id) && i.invoice_type === "sale" && !["draft", "cancelled"].includes(i.status));
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySales = valid.filter((i) => i.created_at.slice(0, 10) === todayStr).reduce((a, i) => a + i.grand_total, 0);
    const monthSales = valid.reduce((a, i) => a + i.grand_total, 0);
    const totalDues = valid.reduce((a, i) => a + i.due_amount, 0);
    return okResult([{ today_sales: String(todaySales), month_sales: String(monthSales), total_dues: String(totalDues) }]);
  }

  if (sql.includes("AS revenue") && sql.includes("AS cogs")) {
    const tid = String(params[0]);
    return okResult(
      s.branches
        .filter((b) => b.tenant_id === tid && inScope(b.id))
        .map((b) => {
          const invIds = new Set(s.invoices.filter((i) => i.branch_id === b.id && !["draft", "cancelled"].includes(i.status)).map((i) => i.id));
          const items = s.invoiceItems.filter((ii) => invIds.has(ii.invoice_id));
          return {
            name: b.name,
            revenue: items.reduce((a, it) => a + it.line_total, 0),
            cogs: items.reduce((a, it) => a + it.qty * it.cost_price_snapshot, 0),
          };
        })
    );
  }

  if (sql.includes("TO_CHAR((i.created_at")) {
    return okResult([
      { day: "18 Nov", sales: 28400, profit: 11200 },
      { day: "19 Nov", sales: 34900, profit: 14100 },
      { day: "20 Nov", sales: 22100, profit: 8900 },
      { day: "21 Nov", sales: 41600, profit: 16800 },
      { day: "22 Nov", sales: 92449, profit: 34200 },
      { day: "23 Nov", sales: 18900, profit: 7800 },
    ]);
  }

  if (sql.includes("AS stock_val")) {
    const tid = String(params[0]);
    let qty = 0;
    let val = 0;
    for (const bs of s.branchStock.filter((x) => x.tenant_id === tid && inScope(x.branch_id))) {
      const v = s.variants.find((x) => x.id === bs.variant_id);
      qty += bs.quantity;
      val += bs.quantity * (v?.avg_cost ?? 0);
    }
    return okResult([{ total_qty: String(qty), stock_val: String(val) }]);
  }

  if (sql.includes("FROM public.stock_transfers WHERE tenant_id = $1 AND status = 'dispatched'")) {
    const cnt = s.transfers.filter((t) => t.tenant_id === params[0] && t.status === "dispatched" && (inScope(t.from_branch_id) || inScope(t.to_branch_id))).length;
    return okResult([{ cnt: String(cnt) }]);
  }

  if (sql.includes("has_oversold = true")) {
    const cnt = s.invoices.filter((i) => i.tenant_id === params[0] && inScope(i.branch_id) && i.has_oversold && i.status !== "cancelled").length;
    return okResult([{ cnt: String(cnt) }]);
  }

  if (sql.includes("bs.quantity <= pv.low_stock_threshold")) {
    const cnt = s.branchStock.filter((bs) => {
      const v = s.variants.find((x) => x.id === bs.variant_id);
      return bs.tenant_id === params[0] && inScope(bs.branch_id) && v && bs.quantity <= v.low_stock_threshold;
    }).length;
    return okResult([{ cnt: String(cnt) }]);
  }

  // Platform queries
  if (sql.includes("FROM public.tenants t") && sql.includes("AS user_count")) {
    return okResult(
      s.tenants.map((t) => ({
        ...t,
        storage_used_bytes: String(t.storage_used_bytes),
        user_count: String(s.profiles.filter((p) => p.tenant_id === t.id).length),
        branch_count: String(s.branches.filter((b) => b.tenant_id === t.id).length),
      }))
    );
  }

  if (sql.includes("AS last_backup FROM public.tenants")) {
    return okResult(
      s.tenants.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        custom_domain: t.custom_domain,
        storage_used_bytes: String(t.storage_used_bytes),
        last_backup: s.backups.find((b) => b.tenant_id === t.id)?.created_at ?? null,
      }))
    );
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.tenants WHERE id = $1")) {
    const t = s.tenants.find((x) => x.id === params[0]);
    return okResult(t ? [t] : []);
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.tenants")) {
    return okResult(s.tenants.map((t) => ({ ...t, storage_used_bytes: String(t.storage_used_bytes) })));
  }

  if (sql.includes("FROM public.pending_uploads")) {
    return okResult([{ cnt: "0" }]);
  }

  if (sql.includes("FROM public.password_reset_requests")) {
    const tid = sql.includes("r.tenant_id = $1") ? String(params[0]) : null;
    return okResult(
      s.resets
        .filter((r) => r.status === "pending" && (!tid || r.tenant_id === tid))
        .map((r) => {
          const p = s.profiles.find((u) => u.id === r.user_id);
          const t = s.tenants.find((x) => x.id === r.tenant_id);
          return { ...r, tenant_name: t?.name ?? "Platform", full_name: p?.full_name ?? null, role: p?.role ?? null };
        })
    );
  }

  if (sql.includes("FROM public.audit_logs")) {
    return okResult(s.audits);
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.profiles")) {
    if (sql.includes("is_platform_admin = false")) {
      return okResult(s.profiles.filter((p) => !p.is_platform_admin));
    }
    if (sql.includes("tenant_id = $1")) {
      return okResult(s.profiles.filter((p) => p.tenant_id === params[0]));
    }
    return okResult(s.profiles);
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.permission_definitions")) {
    return okResult(s.globalPerms);
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.tenant_role_permissions")) {
    if (sql.includes("tenant_id = $1")) {
      return okResult(s.rolePerms.filter((r) => r.tenant_id === params[0]));
    }
    return okResult(s.rolePerms);
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.hsn_codes")) {
    return okResult(s.hsn);
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.uoms")) {
    return okResult(s.uoms.filter((u) => u.tenant_id === params[0]));
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.variant_axis_definitions")) {
    return okResult(s.axes.filter((a) => a.tenant_id === params[0]));
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.custom_field_definitions")) {
    return okResult(s.customFields.filter((f) => f.tenant_id === params[0]));
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.bill_templates")) {
    return okResult(s.billTemplates.filter((b) => b.tenant_id === params[0]));
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.devices")) {
    return okResult(s.devices.filter((d) => d.tenant_id === params[0] || d.branch_id === params[0]));
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.branches")) {
    if (sql.includes("WHERE id = $1")) {
      const b = s.branches.find((x) => x.id === params[0]);
      return okResult(b ? [b] : []);
    }
    if (sql.includes("tenant_id = $1")) {
      return okResult(s.branches.filter((b) => b.tenant_id === params[0]));
    }
    return okResult(s.branches);
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.profile_branches")) {
    return okResult(
      s.profiles
        .filter((p) => !p.is_platform_admin)
        .map((p) => ({
          profile_id: p.id,
          branch_id: p.role === "worker" ? B_CHN : B_DEL,
        }))
    );
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.tenant_backups")) {
    return okResult(s.backups.filter((b) => b.tenant_id === params[0]).map((b) => ({ ...b, file_size_bytes: String(b.file_size_bytes) })));
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.customers")) {
    return okResult(
      s.customers
        .filter((c) => c.tenant_id === params[0] && c.is_active)
        .map((c) => ({
          ...c,
          total_spent: String(
            s.invoices
              .filter((i) => i.customer_id === c.id && !["draft", "cancelled"].includes(i.status))
              .reduce((a, i) => a + i.grand_total, 0)
          ),
          oldest_due_days: c.current_due > 0 ? 18 : 0,
        }))
    );
  }

  // POS variants query
  if (sql.includes("AS stock_qty") && sql.includes("FROM public.product_variants")) {
    const tid = String(params[0]);
    const bid = String(params[1]);
    return okResult(
      s.variants
        .filter((v) => v.tenant_id === tid && v.is_active)
        .map((v) => {
          const p = s.products.find((x) => x.id === v.product_id)!;
          const bs = s.branchStock.find((x) => x.variant_id === v.id && x.branch_id === bid);
          return {
            variant_id: v.id,
            product_id: p.id,
            product_name: p.name,
            model_code: p.model_code,
            primary_image_key: p.primary_image_key,
            sku: v.sku,
            barcode: v.barcode,
            hsn_code: p.hsn_code,
            gst_rate: p.gst_rate,
            attributes: v.attributes,
            selling_price: v.selling_price,
            wholesale_price: v.wholesale_price,
            mrp: v.mrp,
            stock_qty: bs?.quantity ?? 0,
          };
        })
    );
  }

  // Stock hub variants across branches
  if (sql.includes("LEFT JOIN public.branch_stock bs") && sql.includes("FROM public.product_variants")) {
    const tid = String(params[0]);
    const rows: unknown[] = [];
    for (const v of s.variants.filter((x) => x.tenant_id === tid)) {
      const p = s.products.find((x) => x.id === v.product_id);
      if (!p) continue;
      const stocks = s.branchStock.filter((x) => x.variant_id === v.id && inScope(x.branch_id));
      const fallback = Array.isArray(params[1]) ? ((params[1] as string[])[0] ?? B_CHN) : B_CHN;
      const list = stocks.length > 0 ? stocks : [{ tenant_id: tid, branch_id: fallback, variant_id: v.id, quantity: 0 }];
      for (const bs of list) {
        const b = s.branches.find((x) => x.id === bs.branch_id);
        rows.push({
          variant_id: v.id,
          product_id: p.id,
          model_code: p.model_code,
          product_name: p.name,
          category: p.category,
          brand: p.brand,
          hsn_code: p.hsn_code,
          gst_rate: String(p.gst_rate),
          is_active: p.is_active,
          primary_image_key: p.primary_image_key,
          uom: p.uom,
          sku: v.sku,
          barcode: v.barcode,
          attributes: v.attributes,
          cost_price: String(v.cost_price),
          mrp: String(v.mrp),
          selling_price: String(v.selling_price),
          wholesale_price: String(v.wholesale_price),
          low_stock_threshold: String(v.low_stock_threshold),
          branch_id: b?.id ?? null,
          branch_name: b?.name ?? null,
          quantity: String(bs.quantity),
        });
      }
    }
    return okResult(rows);
  }

  // Operations variants query
  if (sql.includes("pv.avg_cost::text") && sql.includes("FROM public.product_variants")) {
    const tid = String(params[0]);
    return okResult(
      s.variants
        .filter((v) => v.tenant_id === tid && v.is_active)
        .map((v) => {
          const p = s.products.find((x) => x.id === v.product_id)!;
          return {
            id: v.id,
            sku: v.sku,
            model_code: p.model_code,
            product_name: p.name,
            attributes: v.attributes,
            avg_cost: String(v.avg_cost),
            gst_rate: String(p.gst_rate),
            selling_price: String(v.selling_price),
          };
        })
    );
  }

  if (sql.includes("FROM public.product_variants") && sql.includes("selling_price::text")) {
    const tid = String(params[0]);
    return okResult(
      s.variants
        .filter((v) => v.tenant_id === tid && v.is_active)
        .map((v) => {
          const p = s.products.find((x) => x.id === v.product_id)!;
          return { id: v.id, sku: v.sku, product_name: p.name, attributes: v.attributes, selling_price: String(v.selling_price) };
        })
    );
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.branch_stock")) {
    const tid = String(params[0]);
    const bid = params[1] ? String(params[1]) : null;
    if (sql.includes("AS stock_value")) {
      return okResult(
        s.branchStock
          .filter((bs) => bs.tenant_id === tid && bs.quantity !== 0)
          .map((bs) => {
            const b = s.branches.find((x) => x.id === bs.branch_id);
            const v = s.variants.find((x) => x.id === bs.variant_id);
            const p = s.products.find((x) => x.id === v?.product_id);
            return {
              branch: b?.name ?? "",
              model_code: p?.model_code ?? "",
              product: p?.name ?? "",
              sku: v?.sku ?? "",
              attributes: JSON.stringify(v?.attributes ?? {}),
              quantity: bs.quantity,
              avg_cost: v?.avg_cost ?? 0,
              stock_value: bs.quantity * (v?.avg_cost ?? 0),
            };
          })
      );
    }
    return okResult(
      s.branchStock
        .filter((bs) => bs.tenant_id === tid && (!bid || bs.branch_id === bid))
        .map((bs) => ({ variant_id: bs.variant_id, quantity: bs.quantity, updated_at: new Date().toISOString() }))
    );
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.products")) {
    const tid = String(params[0]);
    if (sql.includes("MIN(pv.selling_price)")) {
      return okResult(
        s.products
          .filter((p) => p.tenant_id === tid && p.is_active)
          .map((p) => {
            const pv = s.variants.filter((v) => v.product_id === p.id);
            return {
              id: p.id,
              name: p.name,
              model_code: p.model_code,
              category: p.category,
              primary_image_key: p.primary_image_key,
              selling_price: String(pv[0]?.selling_price ?? 0),
              wholesale_price: String(pv[0]?.wholesale_price ?? 0),
            };
          })
      );
    }
    return okResult(s.products.filter((p) => p.tenant_id === tid && p.is_active));
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.stock_ledger")) {
    return okResult(
      s.stockLedger
        .filter((l) => l.tenant_id === params[0])
        .map((l) => ({
          ...l,
          change_qty: String(l.change_qty),
          balance_after: String(l.balance_after),
          branch_name: s.branches.find((b) => b.id === l.branch_id)?.name ?? "",
          sku: s.variants.find((v) => v.id === l.variant_id)?.sku ?? "",
        }))
    );
  }

  // Invoices queries
  if (sql.startsWith("SELECT") && sql.includes("FROM public.invoices")) {
    if (sql.includes("WHERE i.id = $1") || sql.includes("WHERE id = $1")) {
      const inv = s.invoices.find((i) => i.id === params[0]);
      if (!inv) return okResult([]);
      const b = s.branches.find((x) => x.id === inv.branch_id);
      return okResult([{ ...inv, branch_name: b?.name ?? "", branch_address: b?.address ?? "", branch_gstin: b?.gstin ?? "" }]);
    }
    if (sql.includes("customer_id = $2")) {
      return okResult(
        s.invoices
          .filter((i) => i.tenant_id === params[0] && i.customer_id === params[1])
          .map((i) => ({ ...i, grand_total: String(i.grand_total), paid_amount: String(i.paid_amount), due_amount: String(i.due_amount) }))
      );
    }
    const tid = String(params[0]);
    return okResult(
      s.invoices
        .filter((i) => i.tenant_id === tid && inScope(i.branch_id))
        .map((i) => {
          const b = s.branches.find((x) => x.id === i.branch_id);
          return {
            ...i,
            branch_name: b?.name ?? "",
            customer_name: i.customer_snapshot?.name || "Walk-In",
            customer_gstin: i.customer_snapshot?.gstin ?? null,
            invoice_date: i.created_at.slice(0, 10),
            grand_total: String(i.grand_total),
            paid_amount: String(i.paid_amount),
            due_amount: String(i.due_amount),
          };
        })
    );
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.invoice_items")) {
    if (sql.includes("GROUP BY 1, 2")) {
      return okResult([
        { hsn_code: "6403", gst_rate: 5, total_qty: 62, taxable_value: 89188.57, cgst: 104.71, sgst: 104.72, igst: 4250, total_value: 93648 },
        { hsn_code: "6403", gst_rate: 18, total_qty: 1, taxable_value: 2711.02, cgst: 243.99, sgst: 243.99, igst: 0, total_value: 3199 },
      ]);
    }
    const invId = String(params[0]);
    return okResult(
      s.invoiceItems
        .filter((it) => it.invoice_id === invId)
        .map((it) => ({
          ...it,
          qty: String(it.qty),
          unit_price: String(it.unit_price),
          taxable_value: String(it.taxable_value),
          gst_rate: String(it.gst_rate),
          cgst: String(it.cgst),
          sgst: String(it.sgst),
          igst: String(it.igst),
          line_total: String(it.line_total),
        }))
    );
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.expenses")) {
    return okResult(s.expenses.filter((e) => e.tenant_id === params[0]).map((e) => ({ ...e, amount: String(e.amount) })));
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.day_closes")) {
    return okResult(
      s.dayCloses
        .filter((d) => d.tenant_id === params[0])
        .map((d) => ({
          ...d,
          expected_cash: String(d.expected_cash),
          counted_cash: String(d.counted_cash),
          variance_cash: String(d.variance_cash),
          upi_total: String(d.upi_total),
          card_total: String(d.card_total),
        }))
    );
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.suppliers")) {
    return okResult(s.suppliers.filter((x) => x.tenant_id === params[0]).map((x) => ({ ...x, current_due: String(x.current_due) })));
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.purchase_orders")) {
    return okResult(
      s.purchases
        .filter((po) => po.tenant_id === params[0])
        .map((po) => {
          const sup = s.suppliers.find((x) => x.id === po.supplier_id);
          return { ...po, supplier_name: sup?.name ?? "", supplier_gstin: sup?.gstin ?? null, bill_date: po.created_at.slice(0, 10) };
        })
    );
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.production_batches")) {
    return okResult(s.batches.filter((b) => b.tenant_id === params[0]).map((b) => ({ ...b, total_units: String(b.total_units) })));
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.stock_transfers")) {
    if (sql.includes("WHERE st.id = $1")) {
      const tr = s.transfers.find((t) => t.id === params[0]);
      if (!tr) return okResult([]);
      const fb = s.branches.find((b) => b.id === tr.from_branch_id);
      const tb = s.branches.find((b) => b.id === tr.to_branch_id);
      return okResult([
        {
          ...tr,
          from_name: fb?.name ?? "",
          from_addr: fb?.address ?? "",
          from_gstin: fb?.gstin ?? "",
          to_name: tb?.name ?? "",
          to_addr: tb?.address ?? "",
          to_gstin: tb?.gstin ?? "",
        },
      ]);
    }
    return okResult(
      s.transfers
        .filter((t) => t.tenant_id === params[0])
        .map((t) => ({
          ...t,
          from_name: s.branches.find((b) => b.id === t.from_branch_id)?.name ?? "",
          to_name: s.branches.find((b) => b.id === t.to_branch_id)?.name ?? "",
          transfer_value: String(t.transfer_value),
          igst_amount: String(t.igst_amount),
        }))
    );
  }

  if (sql.startsWith("SELECT") && sql.includes("FROM public.stock_transfer_items")) {
    return okResult(
      s.transferItems
        .filter((ti) => ti.transfer_id === params[0])
        .map((ti) => {
          const v = s.variants.find((x) => x.id === ti.variant_id);
          const p = s.products.find((x) => x.id === v?.product_id);
          return {
            ...ti,
            sku: v?.sku ?? "",
            product_name: p?.name ?? "",
            qty_sent: String(ti.qty_sent),
            qty_received: String(ti.qty_received),
          };
        })
    );
  }

  // Interactive mutations in Dev Preview Mode (in-memory)
  if (sql.includes("UPDATE public.tenants SET brand_config")) {
    const t = s.tenants.find((x) => x.id === params[1] || x.id === params[2]);
    if (t) t.brand_config = JSON.parse(String(params[0]));
    return okResult([]);
  }

  if (sql.includes("UPDATE public.tenants SET tier =")) {
    const t = s.tenants.find((x) => x.id === params[2]);
    if (t) t.tier = params[0] as TierKey;
    return okResult([]);
  }

  if (sql.includes("UPDATE public.tenants SET feature_overrides =")) {
    const t = s.tenants.find((x) => x.id === params[3]);
    if (t) t.feature_overrides = JSON.parse(String(params[0])) as Partial<Record<FeatureKey, boolean>>;
    return okResult([]);
  }

  if (sql.includes("INSERT INTO public.tenant_role_permissions")) {
    const [tid, role, pk, allowed] = params as [string, TenantRole, string, boolean];
    const existing = s.rolePerms.find((r) => r.tenant_id === tid && r.role === role && r.permission_key === pk);
    if (existing) existing.allowed = allowed;
    else s.rolePerms.push({ tenant_id: tid, role, permission_key: pk, allowed });
    return okResult([]);
  }

  if (sql.includes("SELECT public.create_invoice_atomic")) {
    const payload = JSON.parse(String(params[1] ?? "{}"));
    const id = `inv-dev-${Date.now()}`;
    const b = s.branches.find((x) => x.id === payload.branch_id) ?? s.branches[0];
    s.invoices.unshift({
      id,
      tenant_id: String(params[0]),
      branch_id: b.id,
      invoice_number: payload.is_draft ? null : `${b.code}/26-27/${String(s.invoices.length + 50).padStart(4, "0")}`,
      invoice_type: payload.invoice_type || "sale",
      customer_id: payload.customer_id || null,
      customer_snapshot: payload.customer_snapshot || { name: "Walk-In Customer" },
      tax_mode: payload.tax_mode || "inclusive",
      supply_type: payload.supply_type || "intra_state",
      subtotal: Number(payload.subtotal || 0),
      discount_amount: Number(payload.discount_amount || 0),
      taxable_amount: Number(payload.taxable_amount || 0),
      cgst_amount: Number(payload.cgst_amount || 0),
      sgst_amount: Number(payload.sgst_amount || 0),
      igst_amount: Number(payload.igst_amount || 0),
      round_off: Number(payload.round_off || 0),
      grand_total: Number(payload.grand_total || 0),
      paid_amount: Number(payload.paid_amount || 0),
      due_amount: Math.max(0, Number(payload.grand_total || 0) - Number(payload.paid_amount || 0)),
      status: payload.is_draft ? "draft" : "paid",
      has_oversold: false,
      created_at: new Date().toISOString(),
    });
    for (const it of payload.items ?? []) {
      s.invoiceItems.push({
        id: `ii-${Date.now()}-${Math.random()}`,
        tenant_id: String(params[0]),
        invoice_id: id,
        variant_id: it.variant_id ?? null,
        product_name: it.product_name,
        sku: it.sku ?? null,
        hsn_code: it.hsn_code ?? null,
        qty: Number(it.qty || 1),
        unit_price: Number(it.unit_price || 0),
        cost_price_snapshot: 900,
        discount_amount: Number(it.discount_amount || 0),
        taxable_value: Number(it.taxable_value || 0),
        gst_rate: Number(it.gst_rate || 5),
        cgst: Number(it.cgst || 0),
        sgst: Number(it.sgst || 0),
        igst: Number(it.igst || 0),
        line_total: Number(it.line_total || 0),
      });
    }
    return okResult([{ id }]);
  }

  if (sql.includes("SELECT public.advance_production_batch_stage_atomic")) {
    const b = s.batches.find((x) => x.id === params[1]);
    if (b) {
      b.stage = String(params[2]);
      if (b.stage === "packed") b.is_stocked = true;
    }
    return okResult([]);
  }

  if (sql.includes("SELECT public.receive_stock_transfer_atomic")) {
    const tr = s.transfers.find((x) => x.id === params[1]);
    if (tr) tr.status = "received";
    return okResult([]);
  }

  if (sql.includes("UPDATE public.products SET primary_image_key")) {
    const [key, prodId] = params as [string, string];
    const p = s.products.find((x) => x.id === prodId);
    if (p) {
      p.primary_image_key = key;
      if (!p.gallery_keys.includes(key)) p.gallery_keys = [key, ...p.gallery_keys];
    }
    return okResult([]);
  }

  if (sql.includes("UPDATE public.products SET gallery_keys = array_remove")) {
    const [key, prodId] = params as [string, string];
    const p = s.products.find((x) => x.id === prodId);
    if (p) {
      p.gallery_keys = p.gallery_keys.filter((k) => k !== key);
      if (p.primary_image_key === key) p.primary_image_key = p.gallery_keys[0] ?? null;
    }
    return okResult([]);
  }

  if (sql.includes("INSERT INTO public.products")) {
    const id = `prod-${Date.now()}`;
    const [tid, modelCode, name, category, brand, uom, hsnCode, gstRate] = params as [
      string,
      string,
      string,
      string | null,
      string | null,
      string | null,
      string | null,
      number | null
    ];
    s.products.unshift({
      id,
      tenant_id: tid,
      model_code: modelCode,
      name,
      category: category || "Footwear",
      brand: brand || "Imraan",
      uom: uom || "Pair",
      hsn_code: hsnCode || "6403",
      gst_rate: Number(gstRate ?? 5),
      description: "",
      custom_fields: {},
      is_published_web: true,
      is_new_arrival: true,
      primary_image_key: null,
      gallery_keys: [],
      is_active: true,
      updated_at: new Date().toISOString(),
    });
    return okResult([{ id }]);
  }

  if (sql.includes("INSERT INTO public.product_variants")) {
    const id = `var-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const [tid, productId, sku, attrsJson, cost, mrp, sell, whole, thresh] = params as [
      string,
      string,
      string,
      string,
      number,
      number,
      number,
      number,
      number
    ];
    let attrs: Record<string, string> = {};
    try {
      attrs = typeof attrsJson === "string" ? JSON.parse(attrsJson) : {};
    } catch {
      attrs = {};
    }
    s.variants.push({
      id,
      tenant_id: tid,
      product_id: productId,
      sku,
      barcode: sku,
      attributes: attrs,
      cost_price: Number(cost ?? 0),
      avg_cost: Number(cost ?? 0),
      mrp: Number(mrp ?? 0),
      selling_price: Number(sell ?? 0),
      wholesale_price: Number(whole ?? 0),
      low_stock_threshold: Number(thresh ?? 5),
      is_active: true,
    });
    s.branchStock.push({ tenant_id: tid, branch_id: B_CHN, variant_id: id, quantity: 0 });
    return okResult([{ id }]);
  }

  if (sql.includes("UPDATE public.products SET model_code =")) {
    const [code, name, cat, brand, uom, hsn, gst, pid] = params as [string, string, string | null, string | null, string, string | null, number, string];
    const p = s.products.find((x) => x.id === pid);
    if (p) {
      p.model_code = code;
      p.name = name;
      p.category = cat || p.category;
      p.brand = brand || p.brand;
      p.uom = uom;
      p.hsn_code = hsn || p.hsn_code;
      p.gst_rate = Number(gst);
    }
    return okResult([]);
  }

  if (sql.includes("UPDATE public.product_variants SET mrp =")) {
    const [mrp, sell, whole, cost, pid] = params as [number | null, number | null, number | null, number | null, string];
    for (const v of s.variants.filter((x) => x.product_id === pid)) {
      if (mrp != null) v.mrp = Number(mrp);
      if (sell != null) v.selling_price = Number(sell);
      if (whole != null) v.wholesale_price = Number(whole);
      if (cost != null) v.cost_price = Number(cost);
    }
    return okResult([]);
  }

  if (sql.includes("UPDATE public.products SET is_active = false")) {
    const p = s.products.find((x) => x.id === params[0]);
    if (p) {
      p.is_active = false;
      p.is_published_web = false;
    }
    for (const v of s.variants.filter((x) => x.product_id === params[0])) v.is_active = false;
    return okResult([]);
  }

  if (sql.includes("UPDATE public.products SET is_active = true")) {
    const p = s.products.find((x) => x.id === params[0]);
    if (p) p.is_active = true;
    for (const v of s.variants.filter((x) => x.product_id === params[0])) v.is_active = true;
    return okResult([]);
  }

  if (sql.includes("UPDATE public.customers SET name =")) {
    const [name, phone, email, gstin, sc, addr, ctype, disc, clim, cdays, cid] = params as [string, string | null, string | null, string | null, string | null, string | null, "retail" | "wholesale", number, number, number, string];
    const c = s.customers.find((x) => x.id === cid);
    if (c) {
      c.name = name;
      c.phone = phone;
      c.email = email;
      c.gstin = gstin;
      c.state_code = sc;
      c.address = addr;
      c.customer_type = ctype;
      c.default_discount_pct = Number(disc);
      c.credit_limit = Number(clim);
      c.credit_days = Number(cdays);
    }
    return okResult([]);
  }

  if (sql.includes("UPDATE public.customers SET is_active = false")) {
    const c = s.customers.find((x) => x.id === params[0]);
    if (c) c.is_active = false;
    return okResult([]);
  }

  if (sql.includes("UPDATE public.suppliers SET name =")) {
    const [name, phone, gstin, mat, sid] = params as [string, string | null, string | null, string | null, string];
    const sup = s.suppliers.find((x) => x.id === sid);
    if (sup) {
      sup.name = name;
      sup.phone = phone;
      sup.gstin = gstin;
      sup.material_type = mat;
    }
    return okResult([]);
  }

  if (sql.includes("DELETE FROM public.suppliers")) {
    s.suppliers = s.suppliers.filter((x) => x.id !== params[0]);
    return okResult([]);
  }

  if (sql.includes("DELETE FROM public.invoices") && sql.includes("status = 'draft'")) {
    s.invoices = s.invoices.filter((x) => !(x.id === params[0] && x.status === "draft"));
    return okResult([]);
  }

  if (sql.includes("DELETE FROM public.bill_templates")) {
    s.billTemplates = s.billTemplates.filter((x) => !(x.id === params[0] && !x.is_default));
    return okResult([]);
  }

  if (sql.includes("UPDATE public.expenses SET category =")) {
    const [cat, amt, mode, note, eid] = params as [string, number, string, string | null, string];
    const e = s.expenses.find((x) => x.id === eid);
    if (e) {
      e.category = cat;
      e.amount = Number(amt);
      e.mode = mode;
      e.note = note;
    }
    return okResult([]);
  }

  if (sql.includes("DELETE FROM public.expenses")) {
    s.expenses = s.expenses.filter((x) => x.id !== params[0]);
    return okResult([]);
  }

  if (sql.includes("UPDATE public.branches SET name =")) {
    const [name, code, type, gstin, sc, bid] = params as [string, string, "factory" | "retail" | "warehouse", string | null, string, string];
    const b = s.branches.find((x) => x.id === bid);
    if (b) {
      b.name = name;
      b.code = code;
      b.type = type;
      b.gstin = gstin;
      b.state_code = sc;
    }
    return okResult([]);
  }

  if (sql.includes("DELETE FROM public.branches")) {
    s.branches = s.branches.filter((x) => !(x.id === params[0] && !x.is_default));
    return okResult([]);
  }

  if (sql.includes("UPDATE public.profiles SET full_name =")) {
    const [fn, email, role, uid] = params as [string, string | null, TenantRole, string];
    const u = s.profiles.find((x) => x.id === uid);
    if (u && u.role !== "owner") {
      u.full_name = fn;
      u.email = email;
      u.role = role;
    }
    return okResult([]);
  }

  if (sql.includes("UPDATE public.profiles SET is_active =")) {
    const [act, uid] = params as [boolean, string];
    const u = s.profiles.find((x) => x.id === uid);
    if (u && u.role !== "owner") u.is_active = act;
    return okResult([]);
  }

  if (sql.includes("DELETE FROM public.variant_axis_definitions")) {
    s.axes = s.axes.filter((x) => x.id !== params[0]);
    return okResult([]);
  }

  if (sql.includes("DELETE FROM public.custom_field_definitions")) {
    s.customFields = s.customFields.filter((x) => x.id !== params[0]);
    return okResult([]);
  }

  if (sql.includes("INSERT INTO public.devices")) {
    const id = `dev-${Date.now()}`;
    s.devices.push({ id, tenant_id: String(params[0]), branch_id: String(params[1]), device_no: Number(params[2] ?? 2), label: String(params[3] ?? "POS"), last_seq: 0, is_active: true });
    return okResult([{ id, device_no: Number(params[2] ?? 2), last_seq: 0 }]);
  }

  if (sql.includes("RETURNING id")) {
    return okResult([{ id: `mock-${Date.now()}` }]);
  }

  return okResult([]);
}

export function createMockClient(): PoolClient {
  return {
    query: (sql: string, params?: unknown[]) => mockQuery(sql, params),
    release: () => undefined,
  } as unknown as PoolClient;
}
