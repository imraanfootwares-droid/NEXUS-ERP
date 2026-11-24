-- ==============================================================================
-- Nexus ERP — 0014_stock_follows_every_bill.sql
-- 1. Normal Bills (estimate_bill_of_supply) now reduce stock like GST Bills.
-- 2. Cancel puts back exactly what the bill removed (from stock_ledger).
-- 3. Returns only add stock back if the original bill removed it.
-- 4. Size-exchange respects the shop's "allow billing beyond stock" setting.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_invoice_atomic(p_tenant_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  -- Every finalized bill (GST Bill and Normal Bill) takes goods out of the shop.
  v_stock_active := public.is_feature_enabled(p_tenant_id, 'auto_stock_and_alerts')
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
$function$;

CREATE OR REPLACE FUNCTION public.cancel_invoice_atomic(p_tenant_id uuid, p_invoice_id uuid, p_actor_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  -- Put back exactly what this bill took out (stock ledger is the source of truth),
  -- so bills that never reduced stock never add stock on cancel.
  IF v_inv.status <> 'draft' THEN
    FOR v_item IN
      SELECT sl.variant_id, -SUM(sl.change_qty) AS qty
      FROM public.stock_ledger sl
      WHERE sl.tenant_id = p_tenant_id AND sl.ref_type = 'invoice' AND sl.ref_id = p_invoice_id
      GROUP BY sl.variant_id
      HAVING SUM(sl.change_qty) < 0
      ORDER BY sl.variant_id ASC
    LOOP
      PERFORM public.apply_stock_delta(
        p_tenant_id, v_inv.branch_id, v_item.variant_id, v_item.qty, 'return', 'invoice_cancel', p_invoice_id, p_actor_id, true, NULL, p_reason
      );
    END LOOP;
  END IF;

  INSERT INTO public.audit_logs (tenant_id, actor_id, action, entity_type, entity_id, metadata)
  VALUES (p_tenant_id, p_actor_id, 'invoice.cancelled', 'invoice', p_invoice_id::text, jsonb_build_object('reason', p_reason));
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_return_atomic(p_tenant_id uuid, p_payload jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

      IF v_stock_active AND EXISTS (
        SELECT 1 FROM public.stock_ledger sl
        WHERE sl.tenant_id = p_tenant_id AND sl.ref_type = 'invoice'
          AND sl.ref_id = v_parent.id AND sl.variant_id = v_vid AND sl.change_qty < 0
      ) THEN
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
          p_tenant_id, v_parent.branch_id, v_vid, -v_qty, 'sale', 'size_exchange', v_cn_id, v_actor_id,
          COALESCE((SELECT (t.tax_config->>'allow_negative_stock')::boolean FROM public.tenants t WHERE t.id = p_tenant_id), false),
          NULL, 'Size exchange replacement'
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
$function$;
