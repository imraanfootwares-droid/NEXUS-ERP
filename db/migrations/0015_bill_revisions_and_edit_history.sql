-- ==============================================================================
-- Nexus ERP — 0015_bill_revisions_and_edit_history.sql
-- Immutable version history & revert snapshots for Invoices, Purchase Bills,
-- and Party Ledger entries.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.bill_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('invoice', 'purchase', 'ledger_entry')),
  entity_id UUID NOT NULL,
  entity_label TEXT,
  version_no INT NOT NULL DEFAULT 1,
  action TEXT NOT NULL CHECK (action IN ('created', 'edited', 'reverted', 'deleted', 'cancelled')),
  summary TEXT NOT NULL,
  changes_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  before_snapshot JSONB NOT NULL,
  after_snapshot JSONB,
  reverted_from_version INT,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_bill_revisions_entity_version
  ON public.bill_revisions (tenant_id, entity_type, entity_id, version_no);

CREATE INDEX IF NOT EXISTS idx_bill_revisions_lookup
  ON public.bill_revisions (tenant_id, entity_type, entity_id, version_no DESC);

CREATE INDEX IF NOT EXISTS idx_bill_revisions_tenant_created
  ON public.bill_revisions (tenant_id, entity_type, created_at DESC);

ALTER TABLE public.bill_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_revisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bill_revisions_isolation ON public.bill_revisions;
CREATE POLICY bill_revisions_isolation ON public.bill_revisions
  USING (public.is_platform_admin() OR tenant_id = public.current_tenant_id())
  WITH CHECK (public.is_platform_admin() OR tenant_id = public.current_tenant_id());

GRANT SELECT, INSERT ON public.bill_revisions TO nexus_app;
