-- ==============================================================================
-- Nexus ERP — 0008_tenant_enquiries.sql
-- Customer enquiries inbox per tenant + public catalogue RPCs + feature gate
-- ==============================================================================

-- 1. Feature gate & permission definitions
INSERT INTO public.feature_definitions (feature_key, min_tier, label, category, description) VALUES
  ('customer_enquiries', 'tier_4', 'Customer Enquiries Inbox', 'Storefront', 'Public catalogue & storefront enquiry inbox with WhatsApp routing')
ON CONFLICT (feature_key) DO UPDATE SET
  min_tier = EXCLUDED.min_tier,
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description;

UPDATE public.tier_definitions
SET features = array_append(features, 'customer_enquiries')
WHERE tier_key = 'tier_4'
  AND NOT ('customer_enquiries' = ANY(features));

INSERT INTO public.permission_definitions (permission_key, feature_key, module, label, default_owner, default_branch_admin, default_worker) VALUES
  ('enquiries.view', 'customer_enquiries', 'Storefront', 'View Customer Enquiries Inbox', true, true, true),
  ('enquiries.manage', 'customer_enquiries', 'Storefront', 'Manage Enquiries & WhatsApp Routing', true, true, false)
ON CONFLICT (permission_key) DO UPDATE SET
  feature_key = EXCLUDED.feature_key,
  module = EXCLUDED.module,
  label = EXCLUDED.label,
  default_owner = EXCLUDED.default_owner,
  default_branch_admin = EXCLUDED.default_branch_admin,
  default_worker = EXCLUDED.default_worker;

-- 2. Tenant customer enquiries table
CREATE TABLE IF NOT EXISTS public.tenant_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL CHECK (char_length(customer_name) BETWEEN 1 AND 160),
  customer_contact TEXT NOT NULL CHECK (char_length(customer_contact) BETWEEN 5 AND 160),
  message TEXT CHECK (message IS NULL OR char_length(message) <= 1000),
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL DEFAULT 'catalogue' CHECK (source IN ('catalogue', 'storefront', 'product')),
  channel TEXT NOT NULL DEFAULT 'inbox' CHECK (channel IN ('inbox', 'whatsapp', 'both')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_enquiries_tenant_created
  ON public.tenant_enquiries (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_enquiries_ip
  ON public.tenant_enquiries (ip_hash, created_at DESC);

ALTER TABLE public.tenant_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_enquiries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_enquiries_isolation ON public.tenant_enquiries;
CREATE POLICY tenant_enquiries_isolation ON public.tenant_enquiries
  USING (public.is_platform_admin() OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_platform_admin() OR tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE ON public.tenant_enquiries TO nexus_app;

-- 3. Public catalogue resolution & safe product listing RPCs
CREATE OR REPLACE FUNCTION public.resolve_public_catalogue(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  status TEXT,
  brand_config JSONB,
  storefront_config JSONB,
  website_enabled BOOLEAN,
  catalogue_enabled BOOLEAN,
  enquiries_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id,
    t.name,
    t.slug,
    t.status,
    t.brand_config,
    t.storefront_config,
    public.is_feature_enabled(t.id, 'public_website_cms') AS website_enabled,
    public.is_feature_enabled(t.id, 'pdf_catalogue_export') AS catalogue_enabled,
    public.is_feature_enabled(t.id, 'customer_enquiries') AS enquiries_enabled
  FROM public.tenants t
  WHERE LOWER(t.slug) = LOWER(TRIM(p_slug))
     OR LOWER(COALESCE(t.custom_domain, '')) = LOWER(TRIM(p_slug))
  LIMIT 1;
END;
$$;

-- Never exposes cost_price / avg_cost!
CREATE OR REPLACE FUNCTION public.public_catalogue_products(
  p_tenant_id UUID,
  p_only_new_arrival BOOLEAN DEFAULT false,
  p_price_mode TEXT DEFAULT 'retail'
)
RETURNS TABLE (
  product_id UUID,
  model_code TEXT,
  name TEXT,
  category TEXT,
  brand TEXT,
  description TEXT,
  is_new_arrival BOOLEAN,
  primary_image_key TEXT,
  display_price NUMERIC,
  variants JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_mode TEXT := CASE
    WHEN p_price_mode IN ('retail', 'wholesale', 'hide') THEN p_price_mode
    ELSE 'retail'
  END;
  v_stock_enabled BOOLEAN;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.tenants t
    WHERE t.id = p_tenant_id
      AND t.status = 'active'
      AND (public.is_feature_enabled(t.id, 'pdf_catalogue_export') OR public.is_feature_enabled(t.id, 'public_website_cms'))
  ) THEN
    RETURN;
  END IF;

  v_stock_enabled := public.is_feature_enabled(p_tenant_id, 'dynamic_stock_matrix');

  RETURN QUERY
  SELECT
    pr.id AS product_id,
    pr.model_code,
    pr.name,
    pr.category,
    pr.brand,
    pr.description,
    pr.is_new_arrival,
    pr.primary_image_key,
    CASE
      WHEN v_mode = 'hide' THEN NULL
      WHEN v_mode = 'wholesale' THEN (SELECT MIN(v.wholesale_price) FROM public.product_variants v WHERE v.product_id = pr.id AND v.is_active = true)
      ELSE (SELECT MIN(v.selling_price) FROM public.product_variants v WHERE v.product_id = pr.id AND v.is_active = true)
    END AS display_price,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'sku', v.sku,
          'attributes', v.attributes,
          'display_price', CASE
            WHEN v_mode = 'wholesale' THEN v.wholesale_price
            WHEN v_mode = 'retail' THEN v.selling_price
            ELSE NULL
          END,
          'in_stock', CASE
            WHEN NOT v_stock_enabled THEN true
            ELSE COALESCE((SELECT SUM(bs.quantity) > 0 FROM public.branch_stock bs WHERE bs.variant_id = v.id AND bs.tenant_id = p_tenant_id), false)
          END
        )
        ORDER BY v.sku
      )
      FROM public.product_variants v
      WHERE v.product_id = pr.id AND v.is_active = true
    ), '[]'::jsonb) AS variants
  FROM public.products pr
  WHERE pr.tenant_id = p_tenant_id
    AND pr.is_active = true
    AND (NOT p_only_new_arrival OR pr.is_new_arrival = true)
  ORDER BY pr.is_new_arrival DESC, pr.updated_at DESC
  LIMIT 150;
END;
$$;

GRANT EXECUTE ON FUNCTION
  public.resolve_public_catalogue(TEXT),
  public.public_catalogue_products(UUID, BOOLEAN, TEXT)
TO nexus_app;
