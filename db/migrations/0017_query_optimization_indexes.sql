-- ==============================================================================
-- Nexus ERP — 0017_query_optimization_indexes.sql
-- High-impact composite & partial indexes for Neon Postgres query speed and
-- lower compute/scan overhead across Billing, Ledgers, Dashboard & Revisions.
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_customer
  ON public.invoices (tenant_id, customer_id, created_at DESC)
  WHERE customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_tenant_oversold
  ON public.invoices (tenant_id, branch_id)
  WHERE has_oversold = true AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_invoice_items_tenant_invoice
  ON public.invoice_items (tenant_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_invoice_payments_tenant_invoice
  ON public.invoice_payments (tenant_id, invoice_id);

CREATE INDEX IF NOT EXISTS idx_purchase_orders_tenant_supplier
  ON public.purchase_orders (tenant_id, supplier_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_purchase_items_tenant_po
  ON public.purchase_items (tenant_id, purchase_order_id);

CREATE INDEX IF NOT EXISTS idx_supplier_payments_tenant_supplier
  ON public.supplier_payments (tenant_id, supplier_id, paid_at DESC);

CREATE INDEX IF NOT EXISTS idx_stock_ledger_tenant_ref
  ON public.stock_ledger (tenant_id, ref_type, ref_id)
  WHERE ref_id IS NOT NULL;
