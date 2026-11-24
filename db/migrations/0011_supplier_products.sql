-- Add supplied_products list to suppliers so shopkeepers can record
-- multiple products/items bought from each supplier.
ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS supplied_products TEXT[] NOT NULL DEFAULT '{}'::text[];
