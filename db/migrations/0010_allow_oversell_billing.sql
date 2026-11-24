-- ==============================================================================
-- Nexus ERP — 0010_allow_oversell_billing.sql
-- Allow billing even when physical stock exceeds recorded system stock (warn only, never block)
-- ==============================================================================

UPDATE public.tenants
SET tax_config = jsonb_set(
  COALESCE(tax_config, '{}'::jsonb),
  '{allow_negative_stock}',
  'true'::jsonb,
  true
);
