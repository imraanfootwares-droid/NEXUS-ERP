-- Allow A5 half-page format in bill_templates alongside A4 and thermal 80mm / 58mm
ALTER TABLE public.bill_templates
  DROP CONSTRAINT IF EXISTS bill_templates_format_check;

ALTER TABLE public.bill_templates
  ADD CONSTRAINT bill_templates_format_check
  CHECK (format IN ('a4', 'a5', 'thermal_80mm', 'thermal_58mm'));
