-- Optional link: which supplier / company a product is bought from.
-- Nullable so existing products and products made in-house keep working.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_supplier ON public.products (tenant_id, supplier_id) WHERE supplier_id IS NOT NULL;
