-- ==============================================================================
-- Nexus ERP — 0002_rls_policies.sql
-- Enforces ENABLE + FORCE ROW LEVEL SECURITY on every tenant-scoped table.
-- Uses transaction-local GUCs set via set_config(..., true).
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.tenant_id', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(current_setting('app.is_platform_admin', true) = 'true', false);
$$;

-- Tenants table policy
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_self_read ON public.tenants;
CREATE POLICY tenant_self_read ON public.tenants
  USING (public.is_platform_admin() OR id = public.current_tenant_id())
  WITH CHECK (public.is_platform_admin() OR id = public.current_tenant_id());

-- Tenant-scoped tables loop
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'profiles',
    'password_reset_requests',
    'branches',
    'devices',
    'branch_counters',
    'user_branch_assignments',
    'tenant_role_permissions',
    'audit_logs',
    'tenant_backups',
    'pending_uploads',
    'import_jobs',
    'import_staging',
    'uoms',
    'variant_axis_definitions',
    'custom_field_definitions',
    'products',
    'product_variants',
    'branch_stock',
    'stock_ledger',
    'bill_templates',
    'customers',
    'invoices',
    'invoice_items',
    'invoice_payments',
    'expenses',
    'day_closes',
    'suppliers',
    'purchase_orders',
    'purchase_items',
    'supplier_payments',
    'production_batches',
    'production_batch_items',
    'stock_transfers',
    'stock_transfer_items'
  ];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I;', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I USING (public.is_platform_admin() OR tenant_id = public.current_tenant_id()) WITH CHECK (public.is_platform_admin() OR tenant_id = public.current_tenant_id());',
      t
    );
  END LOOP;
END
$$;

-- HSN Codes: global master rows (tenant_id IS NULL) are readable by all; tenant rows are isolated
ALTER TABLE public.hsn_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hsn_codes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hsn_read ON public.hsn_codes;
CREATE POLICY hsn_read ON public.hsn_codes
  FOR SELECT
  USING (tenant_id IS NULL OR public.is_platform_admin() OR tenant_id = public.current_tenant_id());

DROP POLICY IF EXISTS hsn_write ON public.hsn_codes;
CREATE POLICY hsn_write ON public.hsn_codes
  FOR ALL
  USING (public.is_platform_admin() OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_platform_admin() OR tenant_id = public.current_tenant_id());
