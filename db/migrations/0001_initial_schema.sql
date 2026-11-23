-- ==============================================================================
-- Nexus ERP — 0001_initial_schema.sql
-- Pure PostgreSQL 15+ (Neon today -> Self-Hosted VPS Postgres tomorrow)
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Restricted Application Role (NOBYPASSRLS so FORCE RLS is enforced)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nexus_app') THEN
    CREATE ROLE nexus_app LOGIN NOBYPASSRLS;
  END IF;
END
$$;

-- 2. Updated-at trigger helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ==============================================================================
-- Platform Governance & Reference Tables
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tier_definitions (
  tier_key TEXT PRIMARY KEY CHECK (tier_key IN ('tier_1','tier_2','tier_3','tier_4')),
  name TEXT NOT NULL,
  market_price_inr INT NOT NULL,
  price_inr INT NOT NULL,
  default_max_users INT NOT NULL DEFAULT 5,
  default_max_branches INT NOT NULL DEFAULT 1,
  features TEXT[] NOT NULL DEFAULT '{}',
  sort_order INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.feature_definitions (
  feature_key TEXT PRIMARY KEY,
  min_tier TEXT NOT NULL REFERENCES public.tier_definitions(tier_key),
  label TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS public.permission_definitions (
  permission_key TEXT PRIMARY KEY,
  feature_key TEXT NOT NULL REFERENCES public.feature_definitions(feature_key),
  module TEXT NOT NULL,
  label TEXT NOT NULL,
  default_owner BOOLEAN NOT NULL DEFAULT true,
  default_branch_admin BOOLEAN NOT NULL DEFAULT false,
  default_worker BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.vertical_presets (
  vertical_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  default_uom TEXT NOT NULL DEFAULT 'Unit',
  allow_decimal BOOLEAN NOT NULL DEFAULT false,
  default_axes JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_custom_fields JSONB NOT NULL DEFAULT '[]'::jsonb,
  default_hsn_prefixes TEXT[] NOT NULL DEFAULT '{}'
);

-- ==============================================================================
-- Multi-Tenant Core
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  custom_domain TEXT UNIQUE,
  vertical_key TEXT NOT NULL DEFAULT 'footwear',
  tier TEXT NOT NULL DEFAULT 'tier_1' REFERENCES public.tier_definitions(tier_key),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  max_users INT NOT NULL DEFAULT 5 CHECK (max_users > 0),
  max_branches INT NOT NULL DEFAULT 1 CHECK (max_branches > 0),
  max_storage_mb INT NOT NULL DEFAULT 250 CHECK (max_storage_mb > 0),
  storage_used_bytes BIGINT NOT NULL DEFAULT 0 CHECK (storage_used_bytes >= 0),
  amc_renewal_date DATE,
  feature_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  brand_config JSONB NOT NULL DEFAULT '{"ui_style":"style_4","primary_color":"#0284c7"}'::jsonb,
  tax_config JSONB NOT NULL DEFAULT '{"gst_enabled":true,"default_tax_mode":"inclusive","allow_estimate_mode":true,"allow_negative_stock":false,"hsn_digits":4,"costing":"weighted_avg","default_state_code":"33"}'::jsonb,
  storefront_config JSONB NOT NULL DEFAULT '{"price_display":"retail","whatsapp_number":"","hero_title":"","hero_subtitle":"","catalogue_price_display":"retail"}'::jsonb,
  stock_outdated_banner BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  is_platform_admin BOOLEAN NOT NULL DEFAULT false,
  role TEXT NOT NULL DEFAULT 'worker' CHECK (role IN ('owner','branch_admin','worker')),
  full_name TEXT NOT NULL,
  email TEXT,
  username TEXT,
  password_hash TEXT NOT NULL,
  phone TEXT,
  session_version INT NOT NULL DEFAULT 1,
  failed_login_count INT NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  must_change_password BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_email_ci ON public.profiles (LOWER(email)) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_tenant_username_ci ON public.profiles (tenant_id, LOWER(username)) WHERE username IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.password_reset_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  identifier_submitted TEXT NOT NULL,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','resolved','rejected')),
  resolved_by UUID REFERENCES public.profiles(id),
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL CHECK (char_length(code) BETWEEN 1 AND 4 AND code = UPPER(code)),
  type TEXT NOT NULL DEFAULT 'retail' CHECK (type IN ('factory','retail','warehouse')),
  gstin TEXT,
  state_code TEXT NOT NULL DEFAULT '33',
  address TEXT,
  phone TEXT,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_read_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  device_no INT NOT NULL CHECK (device_no BETWEEN 1 AND 9),
  label TEXT NOT NULL DEFAULT 'POS Device',
  last_seq INT NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, device_no)
);

CREATE TABLE IF NOT EXISTS public.branch_counters (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  fy_code TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  last_seq INT NOT NULL DEFAULT 0 CHECK (last_seq >= 0),
  PRIMARY KEY (branch_id, fy_code, doc_type)
);

CREATE TABLE IF NOT EXISTS public.user_branch_assignments (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, branch_id)
);

CREATE TABLE IF NOT EXISTS public.tenant_role_permissions (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner','branch_admin','worker')),
  permission_key TEXT NOT NULL REFERENCES public.permission_definitions(permission_key) ON DELETE CASCADE,
  allowed BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (tenant_id, role, permission_key)
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  actor_id UUID,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created ON public.audit_logs (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.tenant_backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  s3_key TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  checksum_sha256 TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('scheduled','manual')),
  status TEXT NOT NULL DEFAULT 'completed',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pending_uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  bucket TEXT NOT NULL CHECK (bucket IN ('public','private')),
  key TEXT NOT NULL UNIQUE,
  expected_bytes BIGINT NOT NULL CHECK (expected_bytes > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'staging' CHECK (status IN ('staging','committed','failed')),
  total_rows INT NOT NULL DEFAULT 0,
  error_message TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.import_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  row_no INT NOT NULL,
  payload JSONB NOT NULL
);

-- ==============================================================================
-- Dynamic Catalog, HSN Directory & Stock
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.hsn_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  rate_rule_type TEXT NOT NULL DEFAULT 'flat' CHECK (rate_rule_type IN ('flat','price_threshold')),
  threshold_amount NUMERIC(14,2),
  rate_below_threshold NUMERIC(5,2) CHECK (rate_below_threshold IS NULL OR (rate_below_threshold BETWEEN 0 AND 40)),
  rate_above_threshold NUMERIC(5,2) CHECK (rate_above_threshold IS NULL OR (rate_above_threshold BETWEEN 0 AND 40)),
  default_gst_rate NUMERIC(5,2) NOT NULL DEFAULT 12 CHECK (default_gst_rate BETWEEN 0 AND 40),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_hsn_global_code ON public.hsn_codes (code) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_hsn_tenant_code ON public.hsn_codes (tenant_id, code) WHERE tenant_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.uoms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  allow_decimal BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tenant_id, code)
);

CREATE TABLE IF NOT EXISTS public.variant_axis_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  preset_values TEXT[] NOT NULL DEFAULT '{}',
  ratio_presets JSONB NOT NULL DEFAULT '[]'::jsonb,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS public.custom_field_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text','number','select','boolean','date')),
  options TEXT[] NOT NULL DEFAULT '{}',
  is_required BOOLEAN NOT NULL DEFAULT false,
  show_on_bill BOOLEAN NOT NULL DEFAULT false,
  show_on_website BOOLEAN NOT NULL DEFAULT true,
  show_in_catalogue BOOLEAN NOT NULL DEFAULT true,
  sort_order INT NOT NULL DEFAULT 0,
  UNIQUE (tenant_id, field_key)
);

CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  model_code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  brand TEXT,
  uom TEXT NOT NULL DEFAULT 'Pair',
  hsn_code TEXT,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 5 CHECK (gst_rate BETWEEN 0 AND 40),
  description TEXT,
  custom_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_published_web BOOLEAN NOT NULL DEFAULT false,
  is_new_arrival BOOLEAN NOT NULL DEFAULT false,
  primary_image_key TEXT,
  gallery_keys TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, model_code)
);
CREATE INDEX IF NOT EXISTS idx_products_custom_fields ON public.products USING GIN (custom_fields);
CREATE INDEX IF NOT EXISTS idx_products_sync ON public.products (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  sku TEXT NOT NULL,
  barcode TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  cost_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  avg_cost NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (avg_cost >= 0),
  mrp NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (mrp >= 0),
  selling_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  wholesale_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (wholesale_price >= 0),
  low_stock_threshold NUMERIC(14,3) NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, sku)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_variants_barcode ON public.product_variants (tenant_id, barcode) WHERE barcode IS NOT NULL AND barcode <> '';
CREATE INDEX IF NOT EXISTS idx_variants_attributes ON public.product_variants USING GIN (attributes);
CREATE INDEX IF NOT EXISTS idx_variants_sync ON public.product_variants (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS public.branch_stock (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, variant_id)
);
CREATE INDEX IF NOT EXISTS idx_branch_stock_sync ON public.branch_stock (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS public.stock_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  change_qty NUMERIC(14,3) NOT NULL,
  unit_cost NUMERIC(14,4),
  balance_after NUMERIC(14,3) NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('opening','purchase','production','sale','return','transfer_out','transfer_in','adjustment','stock_count')),
  ref_type TEXT,
  ref_id UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stock_ledger_tenant_created ON public.stock_ledger (tenant_id, created_at DESC);

-- ==============================================================================
-- Billing, CRM, Expenses & Day-End Close
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.bill_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('a4','thermal_80mm','thermal_58mm')),
  is_default BOOLEAN NOT NULL DEFAULT false,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  gstin TEXT,
  state_code TEXT,
  address TEXT,
  customer_type TEXT NOT NULL DEFAULT 'retail' CHECK (customer_type IN ('retail','wholesale')),
  default_discount_pct NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (default_discount_pct BETWEEN 0 AND 100),
  credit_limit NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
  credit_days INT NOT NULL DEFAULT 0 CHECK (credit_days >= 0),
  current_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit_balance NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_balance >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_sync ON public.customers (tenant_id, updated_at);

CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  invoice_number TEXT CHECK (invoice_number IS NULL OR char_length(invoice_number) <= 16),
  invoice_type TEXT NOT NULL DEFAULT 'sale' CHECK (invoice_type IN ('sale','return_credit_note','estimate_bill_of_supply')),
  parent_invoice_id UUID REFERENCES public.invoices(id) ON DELETE RESTRICT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  tax_mode TEXT NOT NULL DEFAULT 'inclusive' CHECK (tax_mode IN ('inclusive','exclusive','none')),
  supply_type TEXT NOT NULL DEFAULT 'intra_state' CHECK (supply_type IN ('intra_state','inter_state')),
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_type TEXT CHECK (discount_type IS NULL OR discount_type IN ('percent','flat')),
  discount_value NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  taxable_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (taxable_amount >= 0),
  cgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
  sgst_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
  igst_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (igst_amount >= 0),
  round_off NUMERIC(8,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (grand_total >= 0),
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  due_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (due_amount >= 0),
  credit_redeemed NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit_redeemed >= 0),
  status TEXT NOT NULL DEFAULT 'paid' CHECK (status IN ('draft','paid','partial','unpaid','cancelled')),
  has_oversold BOOLEAN NOT NULL DEFAULT false,
  device_id UUID REFERENCES public.devices(id) ON DELETE RESTRICT,
  device_seq INT,
  offline_created_at TIMESTAMPTZ,
  idempotency_key UUID UNIQUE,
  eway_bill_no TEXT,
  irn TEXT,
  ack_no TEXT,
  ack_date TIMESTAMPTZ,
  signed_qr TEXT,
  template_id UUID REFERENCES public.bill_templates(id),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_invoices_number ON public.invoices (tenant_id, branch_id, invoice_number) WHERE invoice_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_tenant_created ON public.invoices (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.invoice_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  product_name TEXT NOT NULL,
  sku TEXT,
  variant_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  hsn_code TEXT,
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(14,2) NOT NULL CHECK (unit_price >= 0),
  cost_price_snapshot NUMERIC(14,4) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  taxable_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (gst_rate BETWEEN 0 AND 40),
  cgst NUMERIC(14,2) NOT NULL DEFAULT 0,
  sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  oversold BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.invoice_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK (mode IN ('cash','upi','card','bank_transfer')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  reference_no TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID
);

CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  category TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  mode TEXT NOT NULL CHECK (mode IN ('cash','upi','card','bank_transfer')),
  expense_date DATE NOT NULL,
  note TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.day_closes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  close_date DATE NOT NULL,
  expected_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
  counted_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
  variance_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
  upi_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  card_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  bank_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  expense_cash NUMERIC(14,2) NOT NULL DEFAULT 0,
  note TEXT,
  closed_by UUID,
  closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, close_date)
);

-- ==============================================================================
-- Suppliers, Purchases, Production & Multi-Branch Transfers
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  gstin TEXT,
  state_code TEXT,
  address TEXT,
  material_type TEXT,
  current_due NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  bill_number TEXT,
  purchase_type TEXT NOT NULL DEFAULT 'finished_goods' CHECK (purchase_type IN ('finished_goods','raw_material')),
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  itc_cgst NUMERIC(14,2) NOT NULL DEFAULT 0,
  itc_sgst NUMERIC(14,2) NOT NULL DEFAULT 0,
  itc_igst NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  idempotency_key UUID UNIQUE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  variant_id UUID REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  item_description TEXT NOT NULL,
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (gst_rate BETWEEN 0 AND 40),
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  purchase_order_id UUID REFERENCES public.purchase_orders(id) ON DELETE RESTRICT,
  mode TEXT NOT NULL CHECK (mode IN ('cash','upi','card','bank_transfer')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference_no TEXT,
  idempotency_key UUID UNIQUE,
  notes TEXT,
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recorded_by UUID
);

CREATE TABLE IF NOT EXISTS public.production_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  batch_number TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'packed' CHECK (stage IN ('cutting','stitching','lasting','finishing','packed')),
  karigar_unit_name TEXT,
  total_units NUMERIC(14,3) NOT NULL DEFAULT 0,
  total_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  is_stocked BOOLEAN NOT NULL DEFAULT false,
  raw_material_notes TEXT,
  idempotency_key UUID UNIQUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.production_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES public.production_batches(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  qty NUMERIC(14,3) NOT NULL CHECK (qty > 0),
  unit_cost NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0)
);

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL DEFAULT 'delivery_challan' CHECK (doc_type IN ('delivery_challan','branch_transfer_invoice')),
  doc_number TEXT NOT NULL,
  from_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  to_branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','dispatched','received','partial_received','cancelled')),
  transfer_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  igst_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  eway_bill_no TEXT,
  transport_name TEXT,
  lr_number TEXT,
  vehicle_no TEXT,
  notes TEXT,
  idempotency_key UUID UNIQUE,
  dispatched_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_by UUID,
  received_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_branch_id <> to_branch_id)
);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  qty_sent NUMERIC(14,3) NOT NULL CHECK (qty_sent > 0),
  qty_received NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  transfer_price NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (transfer_price >= 0),
  gst_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (gst_rate BETWEEN 0 AND 40),
  discrepancy_note TEXT
);

-- ==============================================================================
-- Triggers: updated_at & Finalized Invoice Immutability
-- ==============================================================================
DROP TRIGGER IF EXISTS trg_hsn_updated ON public.hsn_codes;
CREATE TRIGGER trg_hsn_updated BEFORE UPDATE ON public.hsn_codes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_updated ON public.products;
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_variants_updated ON public.product_variants;
CREATE TRIGGER trg_variants_updated BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_branch_stock_updated ON public.branch_stock;
CREATE TRIGGER trg_branch_stock_updated BEFORE UPDATE ON public.branch_stock FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_customers_updated ON public.customers;
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.enforce_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'Finalized GST invoices cannot be deleted; cancel or issue a credit note.';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status <> 'draft' THEN
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal
       OR NEW.grand_total IS DISTINCT FROM OLD.grand_total
       OR NEW.taxable_amount IS DISTINCT FROM OLD.taxable_amount
       OR NEW.cgst_amount IS DISTINCT FROM OLD.cgst_amount
       OR NEW.sgst_amount IS DISTINCT FROM OLD.sgst_amount
       OR NEW.igst_amount IS DISTINCT FROM OLD.igst_amount
       OR NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
       OR NEW.invoice_type IS DISTINCT FROM OLD.invoice_type THEN
      RAISE EXCEPTION 'Finalized invoice amounts and numbers are immutable.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_immutable ON public.invoices;
CREATE TRIGGER trg_invoice_immutable
BEFORE UPDATE OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_immutability();

-- ==============================================================================
-- Grants for restricted nexus_app role
-- ==============================================================================
GRANT USAGE ON SCHEMA public TO nexus_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO nexus_app;
GRANT DELETE ON
  public.pending_uploads,
  public.import_staging,
  public.user_branch_assignments,
  public.password_reset_requests,
  public.invoices,
  public.invoice_items,
  public.invoice_payments,
  public.tenant_backups,
  public.audit_logs,
  public.bill_templates,
  public.custom_field_definitions,
  public.variant_axis_definitions,
  public.uoms,
  public.expenses,
  public.suppliers,
  public.branches
TO nexus_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO nexus_app;
