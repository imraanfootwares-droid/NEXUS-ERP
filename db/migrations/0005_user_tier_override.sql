-- Per-person access tier. NULL means the person follows their business plan.
-- A value limits the person to that tier's modules and never grants more than the plan.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tier_override TEXT
  CHECK (tier_override IS NULL OR tier_override IN ('tier_1','tier_2','tier_3','tier_4'));
