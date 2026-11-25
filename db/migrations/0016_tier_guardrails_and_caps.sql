-- ==============================================================================
-- Nexus ERP — 0016_tier_guardrails_and_caps.sql
-- 1. Configurable per-tenant R2 photo cap & bill revision retention limits
--    (editable by Platform Super Admin per tenant).
-- 2. Move automated daily R2 backups to Tier 3+ (Tier 1 & 2 keep 1-click export).
-- 3. Add `bill_edit_history` feature (Tier 3+ default, Super Admin toggleable)
--    and `billing.history` permission.
-- ==============================================================================

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS max_product_photos INT NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS max_revisions_per_bill INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS revision_retention_days INT NOT NULL DEFAULT 180;

-- Update tier_definitions to reflect new Tier 1-4 feature allocation
UPDATE public.tier_definitions
SET features = ARRAY[
  'mobile_pc_access','rbac_logins','bill_designer','gst_billing_pdf',
  'discounts_returns_payments','analytics_basic','data_exports_gst'
]
WHERE tier_key = 'tier_1';

UPDATE public.tier_definitions
SET features = ARRAY[
  'mobile_pc_access','rbac_logins','bill_designer','gst_billing_pdf',
  'discounts_returns_payments','analytics_basic','data_exports_gst',
  'customer_crm','dynamic_stock_matrix','bulk_excel_import','auto_stock_and_alerts'
]
WHERE tier_key = 'tier_2';

UPDATE public.tier_definitions
SET features = ARRAY[
  'mobile_pc_access','rbac_logins','bill_designer','gst_billing_pdf',
  'discounts_returns_payments','analytics_basic','data_exports_gst',
  'customer_crm','dynamic_stock_matrix','bulk_excel_import','auto_stock_and_alerts',
  'daily_backups','bill_edit_history',
  'multi_branch_ledgers','supplier_and_production','stock_transfers','owner_profit_analytics'
]
WHERE tier_key = 'tier_3';

UPDATE public.tier_definitions
SET features = ARRAY[
  'mobile_pc_access','rbac_logins','bill_designer','gst_billing_pdf',
  'discounts_returns_payments','analytics_basic','data_exports_gst',
  'customer_crm','dynamic_stock_matrix','bulk_excel_import','auto_stock_and_alerts',
  'daily_backups','bill_edit_history',
  'multi_branch_ledgers','supplier_and_production','stock_transfers','owner_profit_analytics',
  'public_website_cms','pdf_catalogue_export','customer_enquiries'
]
WHERE tier_key = 'tier_4';

-- Upsert feature_definitions
INSERT INTO public.feature_definitions (feature_key, min_tier, label, category, description) VALUES
  ('daily_backups', 'tier_3', 'Automated Daily Cloud Backups', 'Core', 'Automated daily compressed backups to R2 (Tier 1 & 2 include 1-click manual download)'),
  ('bill_edit_history', 'tier_3', 'Edit Bills, History & 1-Click Revert', 'Billing', 'Edit finalized customer & supplier bills, inspect change diffs & revert to any version'),
  ('customer_enquiries', 'tier_4', 'Customer Enquiries Inbox', 'Storefront', 'Public catalogue & storefront enquiry inbox with WhatsApp routing')
ON CONFLICT (feature_key) DO UPDATE SET
  min_tier = EXCLUDED.min_tier,
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Upsert permission_definitions & backfill for existing tenants
INSERT INTO public.permission_definitions (permission_key, feature_key, module, label, default_owner, default_branch_admin, default_worker) VALUES
  ('billing.history', 'bill_edit_history', 'Billing', 'Edit Finalized Bills, History & Revert', true, true, false)
ON CONFLICT (permission_key) DO UPDATE SET
  feature_key = EXCLUDED.feature_key,
  label = EXCLUDED.label,
  default_owner = EXCLUDED.default_owner,
  default_branch_admin = EXCLUDED.default_branch_admin,
  default_worker = EXCLUDED.default_worker;

INSERT INTO public.tenant_role_permissions (tenant_id, role, permission_key, allowed)
SELECT t.id, r.role, 'billing.history',
       CASE WHEN r.role IN ('owner', 'branch_admin') THEN true ELSE false END
FROM public.tenants t
CROSS JOIN (VALUES ('owner'), ('branch_admin'), ('worker')) AS r(role)
ON CONFLICT (tenant_id, role, permission_key) DO NOTHING;

-- Keep SQL dependency resolver in sync with FEATURE_DEPENDENCIES
CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  p_tenant_id UUID,
  p_feature_key TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tier TEXT;
  v_overrides JSONB;
  v_features TEXT[];
  v_direct BOOLEAN;
BEGIN
  SELECT t.tier, t.feature_overrides INTO v_tier, v_overrides
  FROM public.tenants t WHERE t.id = p_tenant_id;

  IF v_tier IS NULL THEN RETURN false; END IF;

  IF v_overrides ? p_feature_key THEN
    v_direct := (v_overrides->>p_feature_key)::boolean;
  ELSE
    SELECT td.features INTO v_features FROM public.tier_definitions td WHERE td.tier_key = v_tier;
    v_direct := p_feature_key = ANY(COALESCE(v_features, '{}'::text[]));
  END IF;

  IF NOT COALESCE(v_direct, false) THEN RETURN false; END IF;

  IF p_feature_key IN ('bill_designer', 'discounts_returns_payments', 'data_exports_gst', 'bill_edit_history') THEN
    RETURN public.is_feature_enabled(p_tenant_id, 'gst_billing_pdf');
  ELSIF p_feature_key IN ('bulk_excel_import', 'auto_stock_and_alerts', 'multi_branch_ledgers') THEN
    RETURN public.is_feature_enabled(p_tenant_id, 'dynamic_stock_matrix');
  ELSIF p_feature_key = 'stock_transfers' THEN
    RETURN public.is_feature_enabled(p_tenant_id, 'dynamic_stock_matrix')
       AND public.is_feature_enabled(p_tenant_id, 'multi_branch_ledgers');
  END IF;

  RETURN true;
END;
$$;
