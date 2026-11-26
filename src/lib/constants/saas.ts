export type TierKey = "tier_1" | "tier_2" | "tier_3" | "tier_4";
export type TenantRole = "owner" | "branch_admin" | "worker";
export type TenantStatus = "active" | "suspended";

export const FEATURE_KEYS = [
  // Tier 1 (7)
  "mobile_pc_access",
  "rbac_logins",
  "bill_designer",
  "gst_billing_pdf",
  "discounts_returns_payments",
  "analytics_basic",
  "data_exports_gst",
  // Tier 2 (4)
  "customer_crm",
  "dynamic_stock_matrix",
  "bulk_excel_import",
  "auto_stock_and_alerts",
  // Tier 3 (7)
  "daily_backups",
  "bill_edit_history",
  "trash_bin",
  "multi_branch_ledgers",
  "supplier_and_production",
  "stock_transfers",
  "owner_profit_analytics",
  // Tier 4 (3)
  "public_website_cms",
  "pdf_catalogue_export",
  "customer_enquiries",
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const TIER_DEFAULT_FEATURES: Record<TierKey, FeatureKey[]> = {
  tier_1: [
    "mobile_pc_access",
    "rbac_logins",
    "bill_designer",
    "gst_billing_pdf",
    "discounts_returns_payments",
    "analytics_basic",
    "data_exports_gst",
  ],
  tier_2: [
    "mobile_pc_access",
    "rbac_logins",
    "bill_designer",
    "gst_billing_pdf",
    "discounts_returns_payments",
    "analytics_basic",
    "data_exports_gst",
    "customer_crm",
    "dynamic_stock_matrix",
    "bulk_excel_import",
    "auto_stock_and_alerts",
  ],
  tier_3: [
    "mobile_pc_access",
    "rbac_logins",
    "bill_designer",
    "gst_billing_pdf",
    "discounts_returns_payments",
    "analytics_basic",
    "data_exports_gst",
    "customer_crm",
    "dynamic_stock_matrix",
    "bulk_excel_import",
    "auto_stock_and_alerts",
    "daily_backups",
    "bill_edit_history",
    "trash_bin",
    "multi_branch_ledgers",
    "supplier_and_production",
    "stock_transfers",
    "owner_profit_analytics",
  ],
  tier_4: [...FEATURE_KEYS],
};

export const FEATURE_DEPENDENCIES: Partial<Record<FeatureKey, FeatureKey[]>> = {
  bill_designer: ["gst_billing_pdf"],
  discounts_returns_payments: ["gst_billing_pdf"],
  data_exports_gst: ["gst_billing_pdf"],
  bill_edit_history: ["gst_billing_pdf"],
  bulk_excel_import: ["dynamic_stock_matrix"],
  auto_stock_and_alerts: ["dynamic_stock_matrix"],
  multi_branch_ledgers: ["dynamic_stock_matrix"],
  stock_transfers: ["dynamic_stock_matrix", "multi_branch_ledgers"],
};

export const FEATURE_META: Record<
  FeatureKey,
  { label: string; minTier: TierKey; category: string; description: string }
> = {
  mobile_pc_access: {
    label: "Mobile & PC Access",
    minTier: "tier_1",
    category: "Core",
    description: "Responsive PWA & offline-first remote control anywhere",
  },
  rbac_logins: {
    label: "Owner, Admin & Worker Logins",
    minTier: "tier_1",
    category: "Core",
    description: "Role-based logins, password management & permission matrix",
  },
  bill_designer: {
    label: "Custom Bill Design & Print",
    minTier: "tier_1",
    category: "Billing",
    description: "A4 / 80mm / 58mm print studio & billing screen customizer",
  },
  gst_billing_pdf: {
    label: "GST Bills & PDF Download",
    minTier: "tier_1",
    category: "Billing",
    description: "Local & outstation GST billing, estimates & PDF download",
  },
  discounts_returns_payments: {
    label: "Discounts, Returns & Split Pay",
    minTier: "tier_1",
    category: "Billing",
    description: "Line/bill discounts, credit notes, size exchanges & Cash/UPI/Card",
  },
  analytics_basic: {
    label: "Sales & Cashflow Dashboards",
    minTier: "tier_1",
    category: "Analytics",
    description: "Daily sales, payment split & Day-End cash reconciliation",
  },
  data_exports_gst: {
    label: "Excel / CSV / PDF GST Reports",
    minTier: "tier_1",
    category: "Reports",
    description: "Sales & Purchase registers, GSTR-1, HSN & e-Way/IRP JSON",
  },
  daily_backups: {
    label: "Automated Daily Cloud Backups",
    minTier: "tier_3",
    category: "Core",
    description: "Automated daily compressed snapshots to R2 (Tier 1 & 2 include 1-click manual export)",
  },
  bill_edit_history: {
    label: "Edit Bills, History & 1-Click Revert",
    minTier: "tier_3",
    category: "Billing",
    description: "Edit finalized bills & purchases, inspect Before→After diffs & revert to any version",
  },
  trash_bin: {
    label: "15-Day Trash Bin & Restore",
    minTier: "tier_3",
    category: "Billing",
    description: "Safely recover accidentally deleted bills, purchase bills & expenses within 15 days (auto-clears after 15 days)",
  },
  customer_crm: {
    label: "Customer & Wholesale CRM",
    minTier: "tier_2",
    category: "CRM",
    description: "Retail & dealer ledgers, aging buckets, credit limits & history",
  },
  dynamic_stock_matrix: {
    label: "Size, Colour & Attribute Matrix",
    minTier: "tier_2",
    category: "Inventory",
    description: "Multi-vertical product variants, 2D matrix & Legal Metrology labels",
  },
  bulk_excel_import: {
    label: "Bulk Stock & Price Import",
    minTier: "tier_2",
    category: "Inventory",
    description: "Dynamic Excel/CSV template, validation & atomic commit",
  },
  auto_stock_and_alerts: {
    label: "Auto Stock Minus & Alerts",
    minTier: "tier_2",
    category: "Inventory",
    description: "Atomic stock deduction, low-stock & broken-size alerts",
  },
  multi_branch_ledgers: {
    label: "Separate Branch Stock Ledgers",
    minTier: "tier_3",
    category: "Multi-Branch",
    description: "Independent stock & immutable ledgers per branch",
  },
  supplier_and_production: {
    label: "Suppliers, Purchases & Factory",
    minTier: "tier_3",
    category: "Operations",
    description: "Suppliers, material/goods purchases, dues & production batches",
  },
  stock_transfers: {
    label: "Factory-to-Shop Transfers",
    minTier: "tier_3",
    category: "Multi-Branch",
    description: "Size-run dispatch, GSTIN-aware Tax Invoice/Challan & receive",
  },
  owner_profit_analytics: {
    label: "Combined Owner Profit Analytics",
    minTier: "tier_3",
    category: "Analytics",
    description: "Cross-branch revenue, weighted-avg COGS, expenses & net margin",
  },
  public_website_cms: {
    label: "Live Website & Photo Showcase",
    minTier: "tier_4",
    category: "Storefront",
    description: "WebP R2 gallery, New Arrivals storefront & WhatsApp Inquiry Cart",
  },
  pdf_catalogue_export: {
    label: "1-Click PDF Catalogue Export",
    minTier: "tier_4",
    category: "Storefront",
    description: "WhatsApp-ready PDF brochure with configurable price display",
  },
  customer_enquiries: {
    label: "Customer Enquiries Inbox",
    minTier: "tier_4",
    category: "Storefront",
    description: "Public catalogue & storefront enquiry inbox with WhatsApp routing",
  },
};

export const PERMISSION_DEFINITIONS = [
  { key: "billing.view", feature: "gst_billing_pdf", module: "Billing", label: "View Invoices", owner: true, branch_admin: true, worker: true },
  { key: "billing.create", feature: "gst_billing_pdf", module: "Billing", label: "Create Bills & POS", owner: true, branch_admin: true, worker: true },
  { key: "billing.edit", feature: "gst_billing_pdf", module: "Billing", label: "Edit Drafts & Estimates", owner: true, branch_admin: true, worker: false },
  { key: "billing.history", feature: "bill_edit_history", module: "Billing", label: "Edit Finalized Bills, History & Revert", owner: true, branch_admin: true, worker: false },
  { key: "billing.apply_discount", feature: "discounts_returns_payments", module: "Billing", label: "Apply Discounts", owner: true, branch_admin: true, worker: false },
  { key: "billing.cancel", feature: "discounts_returns_payments", module: "Billing", label: "Cancel / Void Bills & Day-End Close", owner: true, branch_admin: true, worker: false },
  { key: "billing.process_return", feature: "discounts_returns_payments", module: "Billing", label: "Returns & Size Exchanges", owner: true, branch_admin: true, worker: false },
  { key: "billing.create_estimate", feature: "gst_billing_pdf", module: "Billing", label: "Create Non-GST Estimates", owner: true, branch_admin: true, worker: true },
  { key: "bill_designer.manage", feature: "bill_designer", module: "Billing", label: "Customize Bill & Print Layout", owner: true, branch_admin: false, worker: false },
  { key: "analytics.view_sales", feature: "analytics_basic", module: "Analytics", label: "View Sales & Cashflow", owner: true, branch_admin: true, worker: false },
  { key: "analytics.view_profit", feature: "owner_profit_analytics", module: "Analytics", label: "View Cost & Profit Margins", owner: true, branch_admin: false, worker: false },
  { key: "reports.export_gst", feature: "data_exports_gst", module: "Reports", label: "Export GST & Sales Reports", owner: true, branch_admin: true, worker: false },
  { key: "backups.manage", feature: "daily_backups", module: "Settings", label: "Trigger & Download Backups", owner: true, branch_admin: false, worker: false },
  { key: "trash.manage", feature: "trash_bin", module: "Settings", label: "View & Restore 15-Day Trash Bin", owner: true, branch_admin: true, worker: false },
  { key: "customers.view", feature: "customer_crm", module: "Customers", label: "View Customer CRM & Dues", owner: true, branch_admin: true, worker: true },
  { key: "customers.manage", feature: "customer_crm", module: "Customers", label: "Add/Edit Customers & Collect Dues", owner: true, branch_admin: true, worker: true },
  { key: "stock.view", feature: "dynamic_stock_matrix", module: "Inventory", label: "View Stock Matrix & Alerts", owner: true, branch_admin: true, worker: true },
  { key: "stock.manage", feature: "dynamic_stock_matrix", module: "Inventory", label: "Create Products, Variants & Labels", owner: true, branch_admin: true, worker: false },
  { key: "stock.record_incoming", feature: "auto_stock_and_alerts", module: "Inventory", label: "Record Incoming / Stock Count", owner: true, branch_admin: true, worker: true },
  { key: "stock.bulk_import", feature: "bulk_excel_import", module: "Inventory", label: "Bulk Excel/CSV Import", owner: true, branch_admin: true, worker: false },
  { key: "stock.view_ledger", feature: "multi_branch_ledgers", module: "Multi-Branch", label: "View Branch Stock Ledgers", owner: true, branch_admin: true, worker: false },
  { key: "suppliers.manage", feature: "supplier_and_production", module: "Operations", label: "Suppliers, Purchases & Dues", owner: true, branch_admin: true, worker: false },
  { key: "production.record", feature: "supplier_and_production", module: "Operations", label: "Record Production Batches", owner: true, branch_admin: true, worker: false },
  { key: "transfers.dispatch", feature: "stock_transfers", module: "Multi-Branch", label: "Dispatch Branch Transfers", owner: true, branch_admin: true, worker: false },
  { key: "transfers.receive", feature: "stock_transfers", module: "Multi-Branch", label: "Receive Branch Transfers", owner: true, branch_admin: true, worker: true },
  { key: "website.manage", feature: "public_website_cms", module: "Storefront", label: "Manage Website & Photos", owner: true, branch_admin: false, worker: false },
  { key: "catalogue.export", feature: "pdf_catalogue_export", module: "Storefront", label: "Export PDF Catalogue", owner: true, branch_admin: true, worker: false },
  { key: "enquiries.view", feature: "customer_enquiries", module: "Storefront", label: "View Customer Enquiries Inbox", owner: true, branch_admin: true, worker: true },
  { key: "enquiries.manage", feature: "customer_enquiries", module: "Storefront", label: "Manage Enquiries & WhatsApp Routing", owner: true, branch_admin: true, worker: false },
  { key: "settings.catalog_schema", feature: "dynamic_stock_matrix", module: "Settings", label: "Edit Variant Axes & Custom Fields", owner: true, branch_admin: false, worker: false },
  { key: "settings.tax_and_hsn", feature: "gst_billing_pdf", module: "Settings", label: "Edit Tax Mode & HSN Codes", owner: true, branch_admin: false, worker: false },
  { key: "settings.staff_and_roles", feature: "rbac_logins", module: "Settings", label: "Manage Role Permissions", owner: true, branch_admin: false, worker: false },
  { key: "staff.create", feature: "rbac_logins", module: "Settings", label: "Add & Manage Staff Accounts", owner: true, branch_admin: false, worker: false },
  { key: "staff.reset_password", feature: "rbac_logins", module: "Settings", label: "Reset Staff Passwords", owner: true, branch_admin: false, worker: false },
] as const satisfies ReadonlyArray<{
  key: string;
  feature: FeatureKey;
  module: string;
  label: string;
  owner: boolean;
  branch_admin: boolean;
  worker: boolean;
}>;

export type PermissionKey = (typeof PERMISSION_DEFINITIONS)[number]["key"];

export const PERMISSION_PARENT_MAP: Record<PermissionKey, FeatureKey> = Object.fromEntries(
  PERMISSION_DEFINITIONS.map((p) => [p.key, p.feature])
) as Record<PermissionKey, FeatureKey>;

export const TIER_META: Record<
  TierKey,
  { name: string; marketPriceInr: number; priceInr: number; maxUsers: number; maxBranches: number; summary: string }
> = {
  tier_1: {
    name: "Tier 1 — Simple Billing & GST",
    marketPriceInr: 85000,
    priceInr: 50000,
    maxUsers: 5,
    maxBranches: 1,
    summary: "Mobile/PC billing, 10 bill designs, GST bills, sales charts, GST exports & 1-click manual data download.",
  },
  tier_2: {
    name: "Tier 2 — Billing + Stock",
    marketPriceInr: 175000,
    priceInr: 100000,
    maxUsers: 5,
    maxBranches: 1,
    summary: "Everything in Tier 1 plus customer CRM & ledger, size/colour stock matrix, Excel import & reorder alerts.",
  },
  tier_3: {
    name: "Tier 3 — Multi-Branch System",
    marketPriceInr: 295000,
    priceInr: 150000,
    maxUsers: 10,
    maxBranches: 5,
    summary: "Everything in Tier 2 plus Edit Old Bills & 1-Click Revert, 15-Day Trash Bin, automated daily cloud backups, suppliers, transfers & profit analytics.",
  },
  tier_4: {
    name: "Tier 4 — Complete + Website & PDF",
    marketPriceInr: 385000,
    priceInr: 190000,
    maxUsers: 15,
    maxBranches: 10,
    summary: "Everything in Tier 3 plus live R2 photo showcase storefront, bulk WhatsApp inquiry cart & 1-click PDF catalogue.",
  },
};

export const INDIAN_STATES: Record<string, string> = {
  "01": "Jammu & Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra & Nagar Haveli and Daman & Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman & Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
};

export const GST_SLABS = [0, 5, 12, 18, 28, 40] as const;
