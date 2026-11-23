-- ==============================================================================
-- Nexus ERP — 0003_acid_rpcs.sql
-- Security-hardened, deadlock-free ACID PostgreSQL functions.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Pre-Auth & Public Storefront Lookup Functions (Narrow outputs only)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_find_user(
  p_identifier TEXT,
  p_tenant_slug TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  is_platform_admin BOOLEAN,
  role TEXT,
  full_name TEXT,
  email TEXT,
  username TEXT,
  password_hash TEXT,
  session_version INT,
  failed_login_count INT,
  locked_until TIMESTAMPTZ,
  must_change_password BOOLEAN,
  is_active BOOLEAN,
  tenant_status TEXT,
  tenant_slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ident TEXT := LOWER(TRIM(p_identifier));
  v_slug TEXT := NULLIF(LOWER(TRIM(COALESCE(p_tenant_slug, ''))), '');
BEGIN
  IF position('/' IN v_ident) > 0 AND position('@' IN v_ident) = 0 THEN
    v_slug := split_part(v_ident, '/', 1);
    v_ident := split_part(v_ident, '/', 2);
  END IF;

  RETURN QUERY
  SELECT
    p.id, p.tenant_id, p.is_platform_admin, p.role, p.full_name,
    p.email, p.username, p.password_hash, p.session_version,
    p.failed_login_count, p.locked_until, p.must_change_password, p.is_active,
    t.status AS tenant_status, t.slug AS tenant_slug
  FROM public.profiles p
  LEFT JOIN public.tenants t ON t.id = p.tenant_id
  WHERE (
    (position('@' IN v_ident) > 0 AND LOWER(p.email) = v_ident)
    OR (position('@' IN v_ident) = 0 AND LOWER(p.username) = v_ident AND (v_slug IS NULL OR LOWER(t.slug) = v_slug))
  )
  LIMIT 2;
END;
$$;

CREATE OR REPLACE FUNCTION public.auth_record_login_attempt(
  p_user_id UUID,
  p_success BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_success THEN
    UPDATE public.profiles
    SET failed_login_count = 0, locked_until = NULL
    WHERE id = p_user_id;
  ELSE
    UPDATE public.profiles
    SET failed_login_count = failed_login_count + 1,
        locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
    WHERE id = p_user_id;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_tenant_host(p_host TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  status TEXT,
  brand_config JSONB,
  storefront_config JSONB,
  website_enabled BOOLEAN,
  catalogue_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.name, t.slug, t.status, t.brand_config, t.storefront_config,
    public.is_feature_enabled(t.id, 'public_website_cms') AS website_enabled,
    public.is_feature_enabled(t.id, 'pdf_catalogue_export') AS catalogue_enabled
  FROM public.tenants t
  WHERE LOWER(t.custom_domain) = LOWER(TRIM(p_host))
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_tenant_slug(p_slug TEXT)
RETURNS TABLE (
  id UUID,
  name TEXT,
  slug TEXT,
  status TEXT,
  brand_config JSONB,
  storefront_config JSONB,
  website_enabled BOOLEAN,
  catalogue_enabled BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT
    t.id, t.name, t.slug, t.status, t.brand_config, t.storefront_config,
    public.is_feature_enabled(t.id, 'public_website_cms') AS website_enabled,
    public.is_feature_enabled(t.id, 'pdf_catalogue_export') AS catalogue_enabled
  FROM public.tenants t
  WHERE LOWER(t.slug) = LOWER(TRIM(p_slug))
  LIMIT 1;
END;
$$;

-- Never exposes cost_price / avg_cost!
CREATE OR REPLACE FUNCTION public.storefront_products(
  p_tenant_id UUID,
  p_only_new_arrival BOOLEAN DEFAULT false
)
RETURNS TABLE (
  product_id UUID,
  model_code TEXT,
  name TEXT,
  category TEXT,
  brand TEXT,
  uom TEXT,
  description TEXT,
  custom_fields JSONB,
  is_new_arrival BOOLEAN,
  primary_image_key TEXT,
  gallery_keys TEXT[],
  variants JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_price_mode TEXT;
  v_stock_enabled BOOLEAN;
BEGIN
  SELECT COALESCE(t.storefront_config->>'price_display', 'retail')
  INTO v_price_mode
  FROM public.tenants t
  WHERE t.id = p_tenant_id AND t.status = 'active';

  IF v_price_mode IS NULL THEN
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
    pr.uom,
    pr.description,
    pr.custom_fields,
    pr.is_new_arrival,
    pr.primary_image_key,
    pr.gallery_keys,
    COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', v.id,
          'sku', v.sku,
          'attributes', v.attributes,
          'mrp', CASE WHEN v_price_mode = 'hide' THEN NULL ELSE v.mrp END,
          'display_price', CASE
            WHEN v_price_mode = 'wholesale' THEN v.wholesale_price
            WHEN v_price_mode = 'retail' THEN v.selling_price
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
      WHERE v.product_id = pr.id AND v.tenant_id = p_tenant_id AND v.is_active = true
    ), '[]'::jsonb) AS variants
  FROM public.products pr
  WHERE pr.tenant_id = p_tenant_id
    AND pr.is_active = true
    AND pr.is_published_web = true
    AND (NOT p_only_new_arrival OR pr.is_new_arrival = true)
  ORDER BY pr.is_new_arrival DESC, pr.updated_at DESC;
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. Feature Resolver & FY Document Counter Helpers
-- ------------------------------------------------------------------------------
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

  -- Hard dependency checks matching FEATURE_DEPENDENCIES
  IF p_feature_key IN ('bill_designer', 'discounts_returns_payments', 'data_exports_gst') THEN
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

CREATE OR REPLACE FUNCTION public.current_ist_fy_code()
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')) >= 4 THEN
      RIGHT(EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int::text, 2)
      || '-' ||
      RIGHT((EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int + 1)::text, 2)
    ELSE
      RIGHT((EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int - 1)::text, 2)
      || '-' ||
      RIGHT(EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata'))::int::text, 2)
  END;
$$;

CREATE OR REPLACE FUNCTION public.next_doc_number(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_doc_type TEXT,
  p_series_prefix TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_fy TEXT := public.current_ist_fy_code();
  v_seq INT;
  v_doc TEXT;
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  INSERT INTO public.branch_counters (tenant_id, branch_id, fy_code, doc_type, last_seq)
  VALUES (p_tenant_id, p_branch_id, v_fy, p_doc_type, 1)
  ON CONFLICT (branch_id, fy_code, doc_type)
  DO UPDATE SET last_seq = public.branch_counters.last_seq + 1
  RETURNING last_seq INTO v_seq;

  v_doc := UPPER(p_series_prefix) || '/' || v_fy || '/' || LPAD(v_seq::text, 4, '0');
  IF char_length(v_doc) > 16 THEN
    RAISE EXCEPTION 'Generated document number % exceeds 16 characters', v_doc;
  END IF;
  RETURN v_doc;
END;
$$;

-- Internal atomic stock + weighted average cost updater
CREATE OR REPLACE FUNCTION public.apply_stock_delta(
  p_tenant_id UUID,
  p_branch_id UUID,
  p_variant_id UUID,
  p_delta NUMERIC,
  p_reason TEXT,
  p_ref_type TEXT,
  p_ref_id UUID,
  p_actor_id UUID,
  p_allow_negative BOOLEAN DEFAULT false,
  p_unit_cost NUMERIC DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_cur_qty NUMERIC(14,3);
  v_new_qty NUMERIC(14,3);
  v_total_qty NUMERIC(14,3);
  v_cur_avg NUMERIC(14,4);
  v_new_avg NUMERIC(14,4);
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  INSERT INTO public.branch_stock (tenant_id, branch_id, variant_id, quantity)
  VALUES (p_tenant_id, p_branch_id, p_variant_id, 0)
  ON CONFLICT (branch_id, variant_id) DO NOTHING;

  SELECT quantity INTO v_cur_qty
  FROM public.branch_stock
  WHERE branch_id = p_branch_id AND variant_id = p_variant_id AND tenant_id = p_tenant_id
  FOR UPDATE;

  v_new_qty := v_cur_qty + p_delta;
  IF NOT p_allow_negative AND v_new_qty < 0 THEN
    RAISE EXCEPTION 'INSUFFICIENT_STOCK: variant % has %, requested delta %', p_variant_id, v_cur_qty, p_delta;
  END IF;

  -- Update moving weighted average cost on positive stock-in with unit cost
  IF p_delta > 0 AND p_unit_cost IS NOT NULL AND p_unit_cost >= 0 THEN
    SELECT COALESCE(SUM(bs.quantity), 0) INTO v_total_qty
    FROM public.branch_stock bs
    WHERE bs.variant_id = p_variant_id AND bs.tenant_id = p_tenant_id;

    SELECT avg_cost INTO v_cur_avg
    FROM public.product_variants
    WHERE id = p_variant_id AND tenant_id = p_tenant_id
    FOR UPDATE;

    IF GREATEST(v_total_qty, 0) + p_delta > 0 THEN
      v_new_avg := ((GREATEST(v_total_qty, 0) * COALESCE(v_cur_avg, 0)) + (p_delta * p_unit_cost))
                   / (GREATEST(v_total_qty, 0) + p_delta);
      UPDATE public.product_variants
      SET avg_cost = ROUND(v_new_avg, 4)
      WHERE id = p_variant_id AND tenant_id = p_tenant_id;
    END IF;
  END IF;

  UPDATE public.branch_stock
  SET quantity = v_new_qty
  WHERE branch_id = p_branch_id AND variant_id = p_variant_id AND tenant_id = p_tenant_id;

  INSERT INTO public.stock_ledger (
    tenant_id, branch_id, variant_id, change_qty, unit_cost, balance_after, reason, ref_type, ref_id, notes, created_by
  )
  VALUES (
    p_tenant_id, p_branch_id, p_variant_id, p_delta, p_unit_cost, v_new_qty, p_reason, p_ref_type, p_ref_id, p_notes, p_actor_id
  );

  RETURN v_new_qty;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. All 9 ACID RPCs
-- ------------------------------------------------------------------------------

-- RPC 1: create_invoice_atomic (Online, Finalize Draft, or Offline Device Series w/ Oversold Flag)
CREATE OR REPLACE FUNCTION public.create_invoice_atomic(
  p_tenant_id UUID,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_idem UUID := NULLIF(p_payload->>'idempotency_key', '')::uuid;
  v_existing UUID;
  v_draft_id UUID := NULLIF(p_payload->>'draft_id', '')::uuid;
  v_branch_id UUID := (p_payload->>'branch_id')::uuid;
  v_branch_code TEXT;
  v_branch_ro BOOLEAN;
  v_inv_type TEXT := COALESCE(p_payload->>'invoice_type', 'sale');
  v_customer_id UUID := NULLIF(p_payload->>'customer_id', '')::uuid;
  v_actor_id UUID := NULLIF(p_payload->>'created_by', '')::uuid;
  v_is_draft BOOLEAN := COALESCE((p_payload->>'is_draft')::boolean, false);
  v_is_offline BOOLEAN := (p_payload->'offline') IS NOT NULL AND (p_payload->'offline') <> 'null'::jsonb;
  v_device_id UUID;
  v_device_no INT;
  v_device_seq INT;
  v_last_dev_seq INT;
  v_inv_number TEXT := NULL;
  v_stock_active BOOLEAN;
  v_allow_neg BOOLEAN := false;
  v_tax_cfg JSONB;
  v_item JSONB;
  v_pay JSONB;
  v_variant_id UUID;
  v_qty NUMERIC(14,3);
  v_new_bal NUMERIC(14,3);
  v_avg_cost NUMERIC(14,4);
  v_has_oversold BOOLEAN := false;
  v_item_oversold BOOLEAN := false;
  v_invoice_id UUID;
  v_grand_total NUMERIC(14,2) := COALESCE((p_payload->>'grand_total')::numeric, 0);
  v_paid_amount NUMERIC(14,2) := COALESCE((p_payload->>'paid_amount')::numeric, 0);
  v_credit_redeem NUMERIC(14,2) := COALESCE((p_payload->>'credit_redeemed')::numeric, 0);
  v_due_amount NUMERIC(14,2);
  v_status TEXT;
  v_cust_credit NUMERIC(14,2);
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  IF v_idem IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.invoices WHERE idempotency_key = v_idem AND tenant_id = p_tenant_id;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT code, is_read_only INTO v_branch_code, v_branch_ro
  FROM public.branches WHERE id = v_branch_id AND tenant_id = p_tenant_id;
  IF v_branch_code IS NULL THEN RAISE EXCEPTION 'Branch not found'; END IF;
  IF v_branch_ro THEN RAISE EXCEPTION 'Branch is read-only due to branch quota limit'; END IF;

  SELECT tax_config INTO v_tax_cfg FROM public.tenants WHERE id = p_tenant_id;
  v_stock_active := public.is_feature_enabled(p_tenant_id, 'auto_stock_and_alerts')
                    AND v_inv_type <> 'estimate_bill_of_supply'
                    AND NOT v_is_draft;
  v_allow_neg := v_is_offline OR COALESCE((v_tax_cfg->>'allow_negative_stock')::boolean, false);

  -- Number allocation (NULL for drafts)
  IF NOT v_is_draft THEN
    IF v_is_offline THEN
      v_device_id := (p_payload->'offline'->>'device_id')::uuid;
      v_device_seq := (p_payload->'offline'->>'device_seq')::int;
      SELECT device_no, last_seq INTO v_device_no, v_last_dev_seq
      FROM public.devices WHERE id = v_device_id AND branch_id = v_branch_id AND tenant_id = p_tenant_id AND is_active = true
      FOR UPDATE;
      IF v_device_no IS NULL THEN RAISE EXCEPTION 'Offline device not active'; END IF;
      IF v_device_seq <= v_last_dev_seq THEN RAISE EXCEPTION 'Duplicate or stale offline device sequence'; END IF;
      UPDATE public.devices SET last_seq = v_device_seq, last_seen_at = now() WHERE id = v_device_id;
      v_inv_number := v_branch_code || v_device_no::text || '/' || public.current_ist_fy_code() || '/' || LPAD(v_device_seq::text, 4, '0');
    ELSE
      v_inv_number := public.next_doc_number(
        p_tenant_id,
        v_branch_id,
        CASE WHEN v_inv_type = 'estimate_bill_of_supply' THEN 'estimate' ELSE 'sale' END,
        CASE WHEN v_inv_type = 'estimate_bill_of_supply' THEN v_branch_code || 'E' ELSE v_branch_code END
      );
    END IF;
  END IF;

  v_due_amount := GREATEST(0, v_grand_total - v_paid_amount - v_credit_redeem);
  IF v_is_draft THEN
    v_status := 'draft';
  ELSIF v_due_amount = 0 THEN
    v_status := 'paid';
  ELSIF (v_paid_amount + v_credit_redeem) > 0 THEN
    v_status := 'partial';
  ELSE
    v_status := 'unpaid';
  END IF;

  IF v_customer_id IS NOT NULL AND NOT v_is_draft THEN
    SELECT credit_balance INTO v_cust_credit FROM public.customers
    WHERE id = v_customer_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF v_credit_redeem > COALESCE(v_cust_credit, 0) THEN
      RAISE EXCEPTION 'Insufficient customer credit balance';
    END IF;
    UPDATE public.customers
    SET current_due = current_due + v_due_amount,
        credit_balance = credit_balance - v_credit_redeem
    WHERE id = v_customer_id AND tenant_id = p_tenant_id;
  END IF;

  IF v_draft_id IS NOT NULL THEN
    SELECT id INTO v_invoice_id
    FROM public.invoices
    WHERE id = v_draft_id AND tenant_id = p_tenant_id AND status = 'draft'
    FOR UPDATE;
    IF v_invoice_id IS NULL THEN
      RAISE EXCEPTION 'Draft invoice not found or already finalized';
    END IF;

    DELETE FROM public.invoice_items WHERE invoice_id = v_draft_id AND tenant_id = p_tenant_id;
    DELETE FROM public.invoice_payments WHERE invoice_id = v_draft_id AND tenant_id = p_tenant_id;
    UPDATE public.invoices SET
      invoice_number = v_inv_number,
      invoice_type = v_inv_type,
      customer_id = v_customer_id,
      customer_snapshot = COALESCE(p_payload->'customer_snapshot', '{}'::jsonb),
      tax_mode = COALESCE(p_payload->>'tax_mode', 'inclusive'),
      supply_type = COALESCE(p_payload->>'supply_type', 'intra_state'),
      subtotal = COALESCE((p_payload->>'subtotal')::numeric, 0),
      discount_type = NULLIF(p_payload->>'discount_type', ''),
      discount_value = COALESCE((p_payload->>'discount_value')::numeric, 0),
      discount_amount = COALESCE((p_payload->>'discount_amount')::numeric, 0),
      taxable_amount = COALESCE((p_payload->>'taxable_amount')::numeric, 0),
      cgst_amount = COALESCE((p_payload->>'cgst_amount')::numeric, 0),
      sgst_amount = COALESCE((p_payload->>'sgst_amount')::numeric, 0),
      igst_amount = COALESCE((p_payload->>'igst_amount')::numeric, 0),
      round_off = COALESCE((p_payload->>'round_off')::numeric, 0),
      grand_total = v_grand_total,
      paid_amount = v_paid_amount,
      due_amount = v_due_amount,
      credit_redeemed = v_credit_redeem,
      status = v_status,
      idempotency_key = COALESCE(v_idem, idempotency_key),
      eway_bill_no = NULLIF(p_payload->>'eway_bill_no', ''),
      notes = NULLIF(p_payload->>'notes', '')
    WHERE id = v_draft_id AND tenant_id = p_tenant_id AND status = 'draft'
    RETURNING id INTO v_invoice_id;
  ELSE
    INSERT INTO public.invoices (
      tenant_id, branch_id, invoice_number, invoice_type, customer_id, customer_snapshot,
      tax_mode, supply_type, subtotal, discount_type, discount_value, discount_amount,
      taxable_amount, cgst_amount, sgst_amount, igst_amount, round_off, grand_total,
      paid_amount, due_amount, credit_redeemed, status, device_id, device_seq,
      offline_created_at, idempotency_key, eway_bill_no, template_id, notes, created_by
    ) VALUES (
      p_tenant_id, v_branch_id, v_inv_number, v_inv_type, v_customer_id,
      COALESCE(p_payload->'customer_snapshot', '{}'::jsonb),
      COALESCE(p_payload->>'tax_mode', 'inclusive'),
      COALESCE(p_payload->>'supply_type', 'intra_state'),
      COALESCE((p_payload->>'subtotal')::numeric, 0),
      NULLIF(p_payload->>'discount_type', ''),
      COALESCE((p_payload->>'discount_value')::numeric, 0),
      COALESCE((p_payload->>'discount_amount')::numeric, 0),
      COALESCE((p_payload->>'taxable_amount')::numeric, 0),
      COALESCE((p_payload->>'cgst_amount')::numeric, 0),
      COALESCE((p_payload->>'sgst_amount')::numeric, 0),
      COALESCE((p_payload->>'igst_amount')::numeric, 0),
      COALESCE((p_payload->>'round_off')::numeric, 0),
      v_grand_total, v_paid_amount, v_due_amount, v_credit_redeem, v_status,
      v_device_id, v_device_seq,
      NULLIF(p_payload->'offline'->>'offline_created_at', '')::timestamptz,
      v_idem, NULLIF(p_payload->>'eway_bill_no', ''),
      NULLIF(p_payload->>'template_id', '')::uuid,
      NULLIF(p_payload->>'notes', ''), v_actor_id
    )
    RETURNING id INTO v_invoice_id;
  END IF;

  -- Deterministic ORDER BY variant_id ASC prevents deadlocks
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_payload->'items') AS t(value)
    ORDER BY NULLIF(value->>'variant_id', '') ASC NULLS LAST
  LOOP
    v_variant_id := NULLIF(v_item->>'variant_id', '')::uuid;
    v_qty := (v_item->>'qty')::numeric;
    v_avg_cost := COALESCE((v_item->>'cost_price_snapshot')::numeric, 0);
    v_item_oversold := false;

    IF v_variant_id IS NOT NULL THEN
      SELECT avg_cost INTO v_avg_cost FROM public.product_variants WHERE id = v_variant_id AND tenant_id = p_tenant_id;
      IF v_stock_active THEN
        v_new_bal := public.apply_stock_delta(
          p_tenant_id, v_branch_id, v_variant_id, -v_qty, 'sale', 'invoice', v_invoice_id, v_actor_id, v_allow_neg, NULL, NULL
        );
        IF v_new_bal < 0 THEN
          v_item_oversold := true;
          v_has_oversold := true;
        END IF;
      END IF;
    END IF;

    INSERT INTO public.invoice_items (
      tenant_id, invoice_id, variant_id, product_name, sku, variant_attributes, hsn_code,
      qty, unit_price, cost_price_snapshot, discount_amount, taxable_value, gst_rate,
      cgst, sgst, igst, line_total, oversold
    ) VALUES (
      p_tenant_id, v_invoice_id, v_variant_id, v_item->>'product_name', NULLIF(v_item->>'sku', ''),
      COALESCE(v_item->'variant_attributes', '{}'::jsonb), NULLIF(v_item->>'hsn_code', ''),
      v_qty, (v_item->>'unit_price')::numeric, COALESCE(v_avg_cost, 0),
      COALESCE((v_item->>'discount_amount')::numeric, 0),
      COALESCE((v_item->>'taxable_value')::numeric, 0),
      COALESCE((v_item->>'gst_rate')::numeric, 0),
      COALESCE((v_item->>'cgst')::numeric, 0),
      COALESCE((v_item->>'sgst')::numeric, 0),
      COALESCE((v_item->>'igst')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0),
      v_item_oversold
    );
  END LOOP;

  IF v_has_oversold THEN
    UPDATE public.invoices SET has_oversold = true WHERE id = v_invoice_id AND tenant_id = p_tenant_id;
  END IF;

  IF NOT v_is_draft AND (p_payload->'payments') IS NOT NULL THEN
    FOR v_pay IN SELECT value FROM jsonb_array_elements(p_payload->'payments') AS t(value)
    LOOP
      IF COALESCE((v_pay->>'amount')::numeric, 0) > 0 THEN
        INSERT INTO public.invoice_payments (tenant_id, invoice_id, mode, amount, reference_no, recorded_by)
        VALUES (p_tenant_id, v_invoice_id, v_pay->>'mode', (v_pay->>'amount')::numeric, NULLIF(v_pay->>'reference_no', ''), v_actor_id);
      END IF;
    END LOOP;
  END IF;

  RETURN v_invoice_id;
END;
$$;

-- RPC 2: cancel_invoice_atomic
CREATE OR REPLACE FUNCTION public.cancel_invoice_atomic(
  p_tenant_id UUID,
  p_invoice_id UUID,
  p_actor_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_inv RECORD;
  v_item RECORD;
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  SELECT * INTO v_inv FROM public.invoices
  WHERE id = p_invoice_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_inv IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF v_inv.status = 'cancelled' THEN RAISE EXCEPTION 'Invoice already cancelled'; END IF;
  IF EXISTS (SELECT 1 FROM public.invoices WHERE parent_invoice_id = p_invoice_id AND tenant_id = p_tenant_id) THEN
    RAISE EXCEPTION 'Cannot cancel invoice with existing credit notes';
  END IF;

  UPDATE public.invoices SET status = 'cancelled', notes = COALESCE(notes || ' | ', '') || 'Cancelled: ' || p_reason
  WHERE id = p_invoice_id AND tenant_id = p_tenant_id;

  IF v_inv.customer_id IS NOT NULL AND v_inv.status <> 'draft' THEN
    UPDATE public.customers
    SET current_due = current_due - v_inv.due_amount,
        credit_balance = credit_balance + v_inv.credit_redeemed
    WHERE id = v_inv.customer_id AND tenant_id = p_tenant_id;
  END IF;

  IF v_inv.status <> 'draft' AND v_inv.invoice_type <> 'estimate_bill_of_supply'
     AND public.is_feature_enabled(p_tenant_id, 'auto_stock_and_alerts') THEN
    FOR v_item IN
      SELECT * FROM public.invoice_items
      WHERE invoice_id = p_invoice_id AND tenant_id = p_tenant_id AND variant_id IS NOT NULL
      ORDER BY variant_id ASC
    LOOP
      PERFORM public.apply_stock_delta(
        p_tenant_id, v_inv.branch_id, v_item.variant_id, v_item.qty, 'return', 'invoice_cancel', p_invoice_id, p_actor_id, true, NULL, p_reason
      );
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, p_actor_id, 'invoice.cancelled', 'invoice', p_invoice_id::text, jsonb_build_object('reason', p_reason));
END;
$$;

-- RPC 3: process_return_atomic (Credit Note Return + 1-Click Size Exchange)
CREATE OR REPLACE FUNCTION public.process_return_atomic(
  p_tenant_id UUID,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_idem UUID := NULLIF(p_payload->>'idempotency_key', '')::uuid;
  v_existing UUID;
  v_parent_id UUID := (p_payload->>'parent_invoice_id')::uuid;
  v_parent RECORD;
  v_branch_code TEXT;
  v_actor_id UUID := NULLIF(p_payload->>'created_by', '')::uuid;
  v_cn_id UUID;
  v_cn_number TEXT;
  v_item JSONB;
  v_vid UUID;
  v_qty NUMERIC(14,3);
  v_sold_qty NUMERIC(14,3);
  v_ret_qty NUMERIC(14,3);
  v_credit_to_balance NUMERIC(14,2) := COALESCE((p_payload->>'credit_to_balance')::numeric, 0);
  v_stock_active BOOLEAN;
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  IF v_idem IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.invoices WHERE idempotency_key = v_idem AND tenant_id = p_tenant_id;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT * INTO v_parent FROM public.invoices WHERE id = v_parent_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_parent IS NULL OR v_parent.status IN ('draft','cancelled') THEN
    RAISE EXCEPTION 'Parent invoice not eligible for return';
  END IF;

  SELECT code INTO v_branch_code FROM public.branches WHERE id = v_parent.branch_id AND tenant_id = p_tenant_id;
  v_cn_number := public.next_doc_number(p_tenant_id, v_parent.branch_id, 'credit_note', v_branch_code || 'C');
  v_stock_active := public.is_feature_enabled(p_tenant_id, 'auto_stock_and_alerts');

  INSERT INTO public.invoices (
    tenant_id, branch_id, invoice_number, invoice_type, parent_invoice_id, customer_id,
    customer_snapshot, tax_mode, supply_type, subtotal, taxable_amount, cgst_amount,
    sgst_amount, igst_amount, round_off, grand_total, paid_amount, due_amount, status,
    idempotency_key, notes, created_by
  ) VALUES (
    p_tenant_id, v_parent.branch_id, v_cn_number, 'return_credit_note', v_parent_id, v_parent.customer_id,
    v_parent.customer_snapshot, v_parent.tax_mode, v_parent.supply_type,
    COALESCE((p_payload->>'subtotal')::numeric, 0),
    COALESCE((p_payload->>'taxable_amount')::numeric, 0),
    COALESCE((p_payload->>'cgst_amount')::numeric, 0),
    COALESCE((p_payload->>'sgst_amount')::numeric, 0),
    COALESCE((p_payload->>'igst_amount')::numeric, 0),
    COALESCE((p_payload->>'round_off')::numeric, 0),
    COALESCE((p_payload->>'grand_total')::numeric, 0),
    COALESCE((p_payload->>'refund_paid')::numeric, 0),
    0, 'paid', v_idem, NULLIF(p_payload->>'notes', ''), v_actor_id
  )
  RETURNING id INTO v_cn_id;

  -- Returned items (restocked)
  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_payload->'return_items') AS t(value)
    ORDER BY NULLIF(value->>'variant_id', '') ASC NULLS LAST
  LOOP
    v_vid := NULLIF(v_item->>'variant_id', '')::uuid;
    v_qty := (v_item->>'qty')::numeric;

    IF v_vid IS NOT NULL THEN
      SELECT COALESCE(SUM(qty), 0) INTO v_sold_qty FROM public.invoice_items
      WHERE invoice_id = v_parent_id AND variant_id = v_vid AND tenant_id = p_tenant_id;

      SELECT COALESCE(SUM(ii.qty), 0) INTO v_ret_qty
      FROM public.invoice_items ii
      JOIN public.invoices i ON i.id = ii.invoice_id
      WHERE i.parent_invoice_id = v_parent_id AND i.invoice_type = 'return_credit_note'
        AND i.status <> 'cancelled' AND ii.variant_id = v_vid AND ii.tenant_id = p_tenant_id;

      IF v_ret_qty + v_qty > v_sold_qty THEN
        RAISE EXCEPTION 'Return quantity exceeds original sold quantity for variant %', v_vid;
      END IF;

      IF v_stock_active THEN
        PERFORM public.apply_stock_delta(
          p_tenant_id, v_parent.branch_id, v_vid, v_qty, 'return', 'credit_note', v_cn_id, v_actor_id, true, NULL, NULL
        );
      END IF;
    END IF;

    INSERT INTO public.invoice_items (
      tenant_id, invoice_id, variant_id, product_name, sku, hsn_code, qty, unit_price,
      taxable_value, gst_rate, cgst, sgst, igst, line_total
    ) VALUES (
      p_tenant_id, v_cn_id, v_vid, v_item->>'product_name', NULLIF(v_item->>'sku', ''),
      NULLIF(v_item->>'hsn_code', ''), v_qty, (v_item->>'unit_price')::numeric,
      COALESCE((v_item->>'taxable_value')::numeric, 0), COALESCE((v_item->>'gst_rate')::numeric, 0),
      COALESCE((v_item->>'cgst')::numeric, 0), COALESCE((v_item->>'sgst')::numeric, 0),
      COALESCE((v_item->>'igst')::numeric, 0), COALESCE((v_item->>'line_total')::numeric, 0)
    );
  END LOOP;

  -- Optional 1-click Size Exchange replacement items (deducted atomically)
  IF (p_payload->'exchange_items') IS NOT NULL AND jsonb_array_length(p_payload->'exchange_items') > 0 THEN
    FOR v_item IN
      SELECT value FROM jsonb_array_elements(p_payload->'exchange_items') AS t(value)
      ORDER BY NULLIF(value->>'variant_id', '') ASC NULLS LAST
    LOOP
      v_vid := NULLIF(v_item->>'variant_id', '')::uuid;
      v_qty := (v_item->>'qty')::numeric;
      IF v_vid IS NOT NULL AND v_stock_active THEN
        PERFORM public.apply_stock_delta(
          p_tenant_id, v_parent.branch_id, v_vid, -v_qty, 'sale', 'size_exchange', v_cn_id, v_actor_id, false, NULL, 'Size exchange replacement'
        );
      END IF;
    END LOOP;
  END IF;

  IF v_parent.customer_id IS NOT NULL AND v_credit_to_balance > 0 THEN
    UPDATE public.customers SET credit_balance = credit_balance + v_credit_to_balance
    WHERE id = v_parent.customer_id AND tenant_id = p_tenant_id;
  END IF;

  RETURN v_cn_id;
END;
$$;

-- RPC 4: collect_customer_due_atomic
CREATE OR REPLACE FUNCTION public.collect_customer_due_atomic(
  p_tenant_id UUID,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_customer_id UUID := (p_payload->>'customer_id')::uuid;
  v_invoice_id UUID := NULLIF(p_payload->>'invoice_id', '')::uuid;
  v_amount NUMERIC(14,2) := (p_payload->>'amount')::numeric;
  v_mode TEXT := p_payload->>'mode';
  v_actor_id UUID := NULLIF(p_payload->>'recorded_by', '')::uuid;
  v_pay_id UUID;
  v_inv RECORD;
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  UPDATE public.customers SET current_due = GREATEST(0, current_due - v_amount)
  WHERE id = v_customer_id AND tenant_id = p_tenant_id;

  IF v_invoice_id IS NOT NULL THEN
    SELECT * INTO v_inv FROM public.invoices WHERE id = v_invoice_id AND tenant_id = p_tenant_id FOR UPDATE;
    IF v_inv IS NOT NULL THEN
      INSERT INTO public.invoice_payments (tenant_id, invoice_id, mode, amount, reference_no, recorded_by)
      VALUES (p_tenant_id, v_invoice_id, v_mode, v_amount, NULLIF(p_payload->>'reference_no', ''), v_actor_id)
      RETURNING id INTO v_pay_id;

      UPDATE public.invoices
      SET paid_amount = paid_amount + v_amount,
          due_amount = GREATEST(0, due_amount - v_amount),
          status = CASE WHEN GREATEST(0, due_amount - v_amount) = 0 THEN 'paid' ELSE 'partial' END
      WHERE id = v_invoice_id AND tenant_id = p_tenant_id;
    END IF;
  END IF;

  RETURN COALESCE(v_pay_id, v_customer_id);
END;
$$;

-- RPC 5: adjust_stock_atomic
CREATE OR REPLACE FUNCTION public.adjust_stock_atomic(
  p_tenant_id UUID,
  p_payload JSONB
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_allow_neg BOOLEAN := false;
  v_new_qty NUMERIC(14,3);
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  SELECT COALESCE((tax_config->>'allow_negative_stock')::boolean, false) INTO v_allow_neg
  FROM public.tenants WHERE id = p_tenant_id;

  v_new_qty := public.apply_stock_delta(
    p_tenant_id,
    (p_payload->>'branch_id')::uuid,
    (p_payload->>'variant_id')::uuid,
    (p_payload->>'change_qty')::numeric,
    COALESCE(p_payload->>'reason', 'adjustment'),
    'manual',
    NULL,
    NULLIF(p_payload->>'actor_id', '')::uuid,
    v_allow_neg,
    NULLIF(p_payload->>'unit_cost', '')::numeric,
    NULLIF(p_payload->>'notes', '')
  );

  IF COALESCE(p_payload->>'reason', '') = 'stock_count' THEN
    UPDATE public.tenants SET stock_outdated_banner = false WHERE id = p_tenant_id;
  END IF;

  RETURN v_new_qty;
END;
$$;

-- RPC 6: bulk_upsert_stock_atomic (commits staged rows in 1 transaction)
CREATE OR REPLACE FUNCTION public.bulk_upsert_stock_atomic(
  p_tenant_id UUID,
  p_job_id UUID,
  p_actor_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_job RECORD;
  v_row RECORD;
  v_p JSONB;
  v_prod_id UUID;
  v_var_id UUID;
  v_count INT := 0;
  v_qty NUMERIC(14,3);
  v_cost NUMERIC(14,2);
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  SELECT * INTO v_job FROM public.import_jobs WHERE id = p_job_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_job IS NULL OR v_job.status <> 'staging' THEN
    RAISE EXCEPTION 'Import job not in staging state';
  END IF;

  FOR v_row IN SELECT payload FROM public.import_staging WHERE job_id = p_job_id AND tenant_id = p_tenant_id ORDER BY row_no ASC
  LOOP
    v_p := v_row.payload;

    INSERT INTO public.products (tenant_id, model_code, name, category, brand, uom, hsn_code, gst_rate, custom_fields)
    VALUES (
      p_tenant_id, v_p->>'model_code', v_p->>'name', NULLIF(v_p->>'category', ''),
      NULLIF(v_p->>'brand', ''), COALESCE(NULLIF(v_p->>'uom', ''), 'Pair'),
      NULLIF(v_p->>'hsn_code', ''), COALESCE((v_p->>'gst_rate')::numeric, 5),
      COALESCE(v_p->'custom_fields', '{}'::jsonb)
    )
    ON CONFLICT (tenant_id, model_code) DO UPDATE SET
      name = EXCLUDED.name,
      category = COALESCE(EXCLUDED.category, public.products.category),
      hsn_code = COALESCE(EXCLUDED.hsn_code, public.products.hsn_code),
      gst_rate = EXCLUDED.gst_rate
    RETURNING id INTO v_prod_id;

    v_cost := COALESCE((v_p->>'cost_price')::numeric, 0);

    INSERT INTO public.product_variants (
      tenant_id, product_id, sku, barcode, attributes, cost_price, avg_cost, mrp, selling_price, wholesale_price, low_stock_threshold
    ) VALUES (
      p_tenant_id, v_prod_id, v_p->>'sku', NULLIF(v_p->>'barcode', ''),
      COALESCE(v_p->'attributes', '{}'::jsonb), v_cost, v_cost,
      COALESCE((v_p->>'mrp')::numeric, 0),
      COALESCE((v_p->>'selling_price')::numeric, 0),
      COALESCE((v_p->>'wholesale_price')::numeric, 0),
      COALESCE((v_p->>'low_stock_threshold')::numeric, 5)
    )
    ON CONFLICT (tenant_id, sku) DO UPDATE SET
      mrp = EXCLUDED.mrp,
      selling_price = EXCLUDED.selling_price,
      wholesale_price = EXCLUDED.wholesale_price,
      cost_price = EXCLUDED.cost_price,
      is_active = true
    RETURNING id INTO v_var_id;

    v_qty := COALESCE((v_p->>'opening_qty')::numeric, 0);
    IF v_qty > 0 THEN
      PERFORM public.apply_stock_delta(
        p_tenant_id, v_job.branch_id, v_var_id, v_qty, 'opening', 'import_job', p_job_id, p_actor_id, false, v_cost, 'Bulk import'
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.import_jobs SET status = 'committed', total_rows = v_count WHERE id = p_job_id AND tenant_id = p_tenant_id;
  DELETE FROM public.import_staging WHERE job_id = p_job_id AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object('committed_rows', v_count);
END;
$$;

-- RPC 7: record_production_batch_atomic
CREATE OR REPLACE FUNCTION public.record_production_batch_atomic(
  p_tenant_id UUID,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_idem UUID := NULLIF(p_payload->>'idempotency_key', '')::uuid;
  v_existing UUID;
  v_branch_id UUID := (p_payload->>'branch_id')::uuid;
  v_branch_code TEXT;
  v_stage TEXT := COALESCE(p_payload->>'stage', 'packed');
  v_batch_id UUID;
  v_batch_no TEXT;
  v_actor_id UUID := NULLIF(p_payload->>'created_by', '')::uuid;
  v_item JSONB;
  v_stock_active BOOLEAN := public.is_feature_enabled(p_tenant_id, 'dynamic_stock_matrix');
  v_total_units NUMERIC(14,3) := 0;
  v_total_cost NUMERIC(14,2) := 0;
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  IF v_idem IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.production_batches WHERE idempotency_key = v_idem AND tenant_id = p_tenant_id;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  SELECT code INTO v_branch_code FROM public.branches WHERE id = v_branch_id AND tenant_id = p_tenant_id;
  v_batch_no := public.next_doc_number(p_tenant_id, v_branch_id, 'production', v_branch_code || 'P');

  INSERT INTO public.production_batches (
    tenant_id, branch_id, batch_number, stage, karigar_unit_name, is_stocked, raw_material_notes, idempotency_key, created_by
  ) VALUES (
    p_tenant_id, v_branch_id, v_batch_no, v_stage, NULLIF(p_payload->>'karigar_unit_name', ''),
    (v_stage = 'packed' AND v_stock_active), NULLIF(p_payload->>'raw_material_notes', ''), v_idem, v_actor_id
  )
  RETURNING id INTO v_batch_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_payload->'items') AS t(value)
    ORDER BY (value->>'variant_id') ASC
  LOOP
    INSERT INTO public.production_batch_items (tenant_id, batch_id, variant_id, qty, unit_cost)
    VALUES (p_tenant_id, v_batch_id, (v_item->>'variant_id')::uuid, (v_item->>'qty')::numeric, COALESCE((v_item->>'unit_cost')::numeric, 0));

    v_total_units := v_total_units + (v_item->>'qty')::numeric;
    v_total_cost := v_total_cost + ((v_item->>'qty')::numeric * COALESCE((v_item->>'unit_cost')::numeric, 0));

    IF v_stage = 'packed' AND v_stock_active THEN
      PERFORM public.apply_stock_delta(
        p_tenant_id, v_branch_id, (v_item->>'variant_id')::uuid, (v_item->>'qty')::numeric,
        'production', 'production_batch', v_batch_id, v_actor_id, false,
        COALESCE((v_item->>'unit_cost')::numeric, 0), v_batch_no
      );
    END IF;
  END LOOP;

  UPDATE public.production_batches SET total_units = v_total_units, total_cost = v_total_cost
  WHERE id = v_batch_id AND tenant_id = p_tenant_id;

  RETURN v_batch_id;
END;
$$;

-- RPC 7b: advance_production_batch_stage_atomic (WIP stage progression -> auto-stocks once on packed)
CREATE OR REPLACE FUNCTION public.advance_production_batch_stage_atomic(
  p_tenant_id UUID,
  p_batch_id UUID,
  p_new_stage TEXT,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch RECORD;
  v_item RECORD;
  v_stock_active BOOLEAN := public.is_feature_enabled(p_tenant_id, 'dynamic_stock_matrix');
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  SELECT * INTO v_batch FROM public.production_batches
  WHERE id = p_batch_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_batch IS NULL THEN RAISE EXCEPTION 'Production batch not found'; END IF;

  UPDATE public.production_batches
  SET stage = p_new_stage,
      is_stocked = CASE WHEN p_new_stage = 'packed' AND v_stock_active THEN true ELSE is_stocked END
  WHERE id = p_batch_id AND tenant_id = p_tenant_id;

  IF p_new_stage = 'packed' AND NOT v_batch.is_stocked AND v_stock_active THEN
    FOR v_item IN
      SELECT * FROM public.production_batch_items
      WHERE batch_id = p_batch_id AND tenant_id = p_tenant_id
      ORDER BY variant_id ASC
    LOOP
      PERFORM public.apply_stock_delta(
        p_tenant_id, v_batch.branch_id, v_item.variant_id, v_item.qty,
        'production', 'production_batch', p_batch_id, p_actor_id, false,
        v_item.unit_cost, v_batch.batch_number
      );
    END LOOP;
  END IF;
END;
$$;

-- RPC 8: record_purchase_atomic & record_supplier_payment_atomic
CREATE OR REPLACE FUNCTION public.record_purchase_atomic(
  p_tenant_id UUID,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_idem UUID := NULLIF(p_payload->>'idempotency_key', '')::uuid;
  v_existing UUID;
  v_supplier_id UUID := (p_payload->>'supplier_id')::uuid;
  v_branch_id UUID := (p_payload->>'branch_id')::uuid;
  v_type TEXT := COALESCE(p_payload->>'purchase_type', 'finished_goods');
  v_total NUMERIC(14,2) := COALESCE((p_payload->>'total_amount')::numeric, 0);
  v_paid NUMERIC(14,2) := COALESCE((p_payload->>'paid_amount')::numeric, 0);
  v_actor_id UUID := NULLIF(p_payload->>'created_by', '')::uuid;
  v_po_id UUID;
  v_item JSONB;
  v_vid UUID;
  v_stock_active BOOLEAN := public.is_feature_enabled(p_tenant_id, 'dynamic_stock_matrix');
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  IF v_idem IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.purchase_orders WHERE idempotency_key = v_idem AND tenant_id = p_tenant_id;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  UPDATE public.suppliers SET current_due = current_due + GREATEST(0, v_total - v_paid)
  WHERE id = v_supplier_id AND tenant_id = p_tenant_id;

  INSERT INTO public.purchase_orders (
    tenant_id, branch_id, supplier_id, bill_number, purchase_type, total_amount,
    itc_cgst, itc_sgst, itc_igst, paid_amount, idempotency_key, notes, created_by
  ) VALUES (
    p_tenant_id, v_branch_id, v_supplier_id, NULLIF(p_payload->>'bill_number', ''), v_type, v_total,
    COALESCE((p_payload->>'itc_cgst')::numeric, 0),
    COALESCE((p_payload->>'itc_sgst')::numeric, 0),
    COALESCE((p_payload->>'itc_igst')::numeric, 0),
    v_paid, v_idem, NULLIF(p_payload->>'notes', ''), v_actor_id
  )
  RETURNING id INTO v_po_id;

  FOR v_item IN
    SELECT value FROM jsonb_array_elements(p_payload->'items') AS t(value)
    ORDER BY NULLIF(value->>'variant_id', '') ASC NULLS LAST
  LOOP
    v_vid := NULLIF(v_item->>'variant_id', '')::uuid;
    INSERT INTO public.purchase_items (
      tenant_id, purchase_order_id, variant_id, item_description, qty, unit_cost, gst_rate, line_total
    ) VALUES (
      p_tenant_id, v_po_id, v_vid, v_item->>'item_description', (v_item->>'qty')::numeric,
      (v_item->>'unit_cost')::numeric, COALESCE((v_item->>'gst_rate')::numeric, 0),
      COALESCE((v_item->>'line_total')::numeric, 0)
    );

    IF v_type = 'finished_goods' AND v_vid IS NOT NULL AND v_stock_active THEN
      PERFORM public.apply_stock_delta(
        p_tenant_id, v_branch_id, v_vid, (v_item->>'qty')::numeric, 'purchase', 'purchase_order', v_po_id, v_actor_id, false, (v_item->>'unit_cost')::numeric, NULL
      );
    END IF;
  END LOOP;

  RETURN v_po_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_supplier_payment_atomic(
  p_tenant_id UUID,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_idem UUID := NULLIF(p_payload->>'idempotency_key', '')::uuid;
  v_existing UUID;
  v_pay_id UUID;
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  IF v_idem IS NOT NULL THEN
    SELECT id INTO v_existing FROM public.supplier_payments WHERE idempotency_key = v_idem AND tenant_id = p_tenant_id;
    IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
  END IF;

  UPDATE public.suppliers SET current_due = GREATEST(0, current_due - (p_payload->>'amount')::numeric)
  WHERE id = (p_payload->>'supplier_id')::uuid AND tenant_id = p_tenant_id;

  INSERT INTO public.supplier_payments (
    tenant_id, supplier_id, purchase_order_id, mode, amount, reference_no, idempotency_key, notes, recorded_by
  ) VALUES (
    p_tenant_id, (p_payload->>'supplier_id')::uuid, NULLIF(p_payload->>'purchase_order_id', '')::uuid,
    p_payload->>'mode', (p_payload->>'amount')::numeric, NULLIF(p_payload->>'reference_no', ''),
    v_idem, NULLIF(p_payload->>'notes', ''), NULLIF(p_payload->>'recorded_by', '')::uuid
  )
  RETURNING id INTO v_pay_id;

  RETURN v_pay_id;
END;
$$;

-- RPC 9: dispatch_stock_transfer_atomic & receive_stock_transfer_atomic
CREATE OR REPLACE FUNCTION public.dispatch_stock_transfer_atomic(
  p_tenant_id UUID,
  p_transfer_id UUID,
  p_actor_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tr RECORD;
  v_from RECORD;
  v_to RECORD;
  v_doc_type TEXT;
  v_doc_no TEXT;
  v_item RECORD;
  v_val NUMERIC(14,2) := 0;
  v_igst NUMERIC(14,2) := 0;
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers WHERE id = p_transfer_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_tr IS NULL OR v_tr.status <> 'draft' THEN
    RAISE EXCEPTION 'Transfer not in draft state';
  END IF;

  SELECT * INTO v_from FROM public.branches WHERE id = v_tr.from_branch_id AND tenant_id = p_tenant_id;
  SELECT * INTO v_to FROM public.branches WHERE id = v_tr.to_branch_id AND tenant_id = p_tenant_id;
  IF v_from.is_read_only OR v_to.is_read_only THEN
    RAISE EXCEPTION 'Branch is read-only';
  END IF;

  IF COALESCE(NULLIF(TRIM(v_from.gstin), ''), '') <> ''
     AND COALESCE(NULLIF(TRIM(v_to.gstin), ''), '') <> ''
     AND UPPER(TRIM(v_from.gstin)) <> UPPER(TRIM(v_to.gstin)) THEN
    v_doc_type := 'branch_transfer_invoice';
    v_doc_no := public.next_doc_number(p_tenant_id, v_from.id, 'transfer_invoice', v_from.code || 'T');
  ELSE
    v_doc_type := 'delivery_challan';
    v_doc_no := public.next_doc_number(p_tenant_id, v_from.id, 'challan', v_from.code || 'D');
  END IF;

  FOR v_item IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND tenant_id = p_tenant_id
    ORDER BY variant_id ASC
  LOOP
    PERFORM public.apply_stock_delta(
      p_tenant_id, v_tr.from_branch_id, v_item.variant_id, -v_item.qty_sent,
      'transfer_out', 'stock_transfer', p_transfer_id, p_actor_id, false, NULL, v_doc_no
    );
    v_val := v_val + (v_item.qty_sent * v_item.transfer_price);
    IF v_doc_type = 'branch_transfer_invoice' THEN
      v_igst := v_igst + ROUND((v_item.qty_sent * v_item.transfer_price * v_item.gst_rate / 100.0), 2);
    END IF;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = 'dispatched',
      doc_type = v_doc_type,
      doc_number = v_doc_no,
      transfer_value = v_val,
      igst_amount = v_igst,
      dispatched_at = now()
  WHERE id = p_transfer_id AND tenant_id = p_tenant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.receive_stock_transfer_atomic(
  p_tenant_id UUID,
  p_transfer_id UUID,
  p_actor_id UUID,
  p_received JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tr RECORD;
  v_rec JSONB;
  v_item RECORD;
  v_qty_rec NUMERIC(14,3);
  v_partial BOOLEAN := false;
BEGIN
  IF NOT public.is_platform_admin() AND p_tenant_id IS DISTINCT FROM public.current_tenant_id() THEN
    RAISE EXCEPTION 'tenant mismatch';
  END IF;

  SELECT * INTO v_tr FROM public.stock_transfers WHERE id = p_transfer_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF v_tr IS NULL OR v_tr.status <> 'dispatched' THEN
    RAISE EXCEPTION 'Transfer not in dispatched state';
  END IF;

  FOR v_item IN
    SELECT * FROM public.stock_transfer_items
    WHERE transfer_id = p_transfer_id AND tenant_id = p_tenant_id
    ORDER BY variant_id ASC
  LOOP
    SELECT value INTO v_rec
    FROM jsonb_array_elements(p_received) AS t(value)
    WHERE (value->>'variant_id')::uuid = v_item.variant_id
    LIMIT 1;

    v_qty_rec := COALESCE((v_rec->>'qty_received')::numeric, v_item.qty_sent);
    IF v_qty_rec <> v_item.qty_sent THEN
      v_partial := true;
    END IF;

    UPDATE public.stock_transfer_items
    SET qty_received = v_qty_rec,
        discrepancy_note = NULLIF(v_rec->>'discrepancy_note', '')
    WHERE id = v_item.id AND tenant_id = p_tenant_id;

    IF v_qty_rec > 0 THEN
      PERFORM public.apply_stock_delta(
        p_tenant_id, v_tr.to_branch_id, v_item.variant_id, v_qty_rec,
        'transfer_in', 'stock_transfer', p_transfer_id, p_actor_id, false, v_item.transfer_price, v_tr.doc_number
      );
    END IF;
  END LOOP;

  UPDATE public.stock_transfers
  SET status = CASE WHEN v_partial THEN 'partial_received' ELSE 'received' END,
      received_at = now(),
      received_by = p_actor_id
  WHERE id = p_transfer_id AND tenant_id = p_tenant_id;
END;
$$;

-- Tighten EXECUTE privileges
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  public.current_tenant_id(),
  public.is_platform_admin(),
  public.auth_find_user(TEXT, TEXT),
  public.auth_record_login_attempt(UUID, BOOLEAN),
  public.resolve_tenant_host(TEXT),
  public.resolve_tenant_slug(TEXT),
  public.storefront_products(UUID, BOOLEAN),
  public.is_feature_enabled(UUID, TEXT),
  public.current_ist_fy_code(),
  public.next_doc_number(UUID, UUID, TEXT, TEXT),
  public.apply_stock_delta(UUID, UUID, UUID, NUMERIC, TEXT, TEXT, UUID, UUID, BOOLEAN, NUMERIC, TEXT),
  public.create_invoice_atomic(UUID, JSONB),
  public.cancel_invoice_atomic(UUID, UUID, UUID, TEXT),
  public.process_return_atomic(UUID, JSONB),
  public.collect_customer_due_atomic(UUID, JSONB),
  public.adjust_stock_atomic(UUID, JSONB),
  public.bulk_upsert_stock_atomic(UUID, UUID, UUID),
  public.record_production_batch_atomic(UUID, JSONB),
  public.advance_production_batch_stage_atomic(UUID, UUID, TEXT, UUID),
  public.record_purchase_atomic(UUID, JSONB),
  public.record_supplier_payment_atomic(UUID, JSONB),
  public.dispatch_stock_transfer_atomic(UUID, UUID, UUID),
  public.receive_stock_transfer_atomic(UUID, UUID, UUID, JSONB)
TO nexus_app;
