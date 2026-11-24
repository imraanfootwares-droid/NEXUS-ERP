-- ==============================================================================
-- Nexus ERP — 0009_party_ledger_entries.sql
-- Editable Customer & Supplier party statement annotations, custom fields & manual entries
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.party_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  party_type TEXT NOT NULL CHECK (party_type IN ('customer', 'supplier')),
  party_id UUID NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('invoice', 'purchase', 'payment', 'manual')),
  source_id UUID,
  entry_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  voucher_no TEXT,
  particulars TEXT,
  debit NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit NUMERIC(14,2) NOT NULL DEFAULT 0,
  extra_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  items_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_party_ledger_entries_party
  ON public.party_ledger_entries (tenant_id, party_type, party_id, entry_date ASC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_party_ledger_source
  ON public.party_ledger_entries (tenant_id, party_type, party_id, source_type, source_id)
  WHERE source_id IS NOT NULL;

ALTER TABLE public.party_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_ledger_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS party_ledger_entries_isolation ON public.party_ledger_entries;
CREATE POLICY party_ledger_entries_isolation ON public.party_ledger_entries
  USING (public.is_platform_admin() OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_platform_admin() OR tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.party_ledger_entries TO nexus_app;
