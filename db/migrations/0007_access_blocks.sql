-- Payment blocks for a whole business or one person.
-- Kept separate from tenants.status and profiles.is_active so unblocking restores
-- exactly what was there before. Change history is written to audit_logs.
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS access_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_block_message TEXT CHECK (access_block_message IS NULL OR char_length(access_block_message) <= 500),
  ADD COLUMN IF NOT EXISTS access_block_amount NUMERIC(14,2) CHECK (access_block_amount IS NULL OR access_block_amount >= 0),
  ADD COLUMN IF NOT EXISTS access_block_contact TEXT CHECK (access_block_contact IS NULL OR char_length(access_block_contact) <= 120),
  ADD COLUMN IF NOT EXISTS access_blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_blocked_by UUID;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS access_blocked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS access_block_message TEXT CHECK (access_block_message IS NULL OR char_length(access_block_message) <= 500),
  ADD COLUMN IF NOT EXISTS access_block_amount NUMERIC(14,2) CHECK (access_block_amount IS NULL OR access_block_amount >= 0),
  ADD COLUMN IF NOT EXISTS access_block_contact TEXT CHECK (access_block_contact IS NULL OR char_length(access_block_contact) <= 120),
  ADD COLUMN IF NOT EXISTS access_blocked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS access_blocked_by UUID;

CREATE INDEX IF NOT EXISTS idx_tenants_access_blocked ON public.tenants (id) WHERE access_blocked;
CREATE INDEX IF NOT EXISTS idx_profiles_access_blocked ON public.profiles (tenant_id) WHERE access_blocked;
