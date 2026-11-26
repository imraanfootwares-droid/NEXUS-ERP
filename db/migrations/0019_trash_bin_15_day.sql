-- ==============================================================================
-- 0019: 15-Day Trash Bin & 1-Click Restore (Tier 3 & Tier 4 Gated Feature)
-- Lightweight, auto-expiring recycle bin for deleted bills, purchases & expenses.
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.trash_items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  entity_type     text NOT NULL CHECK (entity_type IN ('invoice', 'purchase', 'expense', 'ledger_entry')),
  entity_id       uuid NOT NULL,
  title           text NOT NULL,
  subtitle        text,
  amount          numeric(14,2) NOT NULL DEFAULT 0,
  snapshot        jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  deleted_by_name text,
  deleted_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '15 days')
);

CREATE INDEX IF NOT EXISTS idx_trash_items_tenant_expires
  ON public.trash_items (tenant_id, expires_at DESC);

CREATE INDEX IF NOT EXISTS idx_trash_items_expires
  ON public.trash_items (expires_at);

ALTER TABLE public.trash_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS trash_items_tenant_isolation ON public.trash_items;
CREATE POLICY trash_items_tenant_isolation ON public.trash_items
  USING (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant_id', true)
  )
  WITH CHECK (
    current_setting('app.is_platform_admin', true) = 'true'
    OR tenant_id::text = current_setting('app.current_tenant_id', true)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trash_items TO nexus_app;

-- Register gated feature in feature_definitions (Tier 3+ default, Super Admin toggleable)
INSERT INTO public.feature_definitions (feature_key, min_tier, label, category, description)
VALUES (
  'trash_bin',
  'tier_3',
  '15-Day Trash Bin & Restore',
  'Billing',
  'Recover accidentally deleted bills, purchase bills & expenses within 15 days (auto-clears after 15 days)'
)
ON CONFLICT (feature_key) DO UPDATE SET
  min_tier = EXCLUDED.min_tier,
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  description = EXCLUDED.description;

-- Enable trash_bin by default on Tier 3 and Tier 4
UPDATE public.tier_definitions
SET features = array_append(features, 'trash_bin')
WHERE tier_key IN ('tier_3', 'tier_4')
  AND NOT ('trash_bin' = ANY(features));

-- Register permission_definitions & backfill existing tenants
INSERT INTO public.permission_definitions (permission_key, feature_key, module, label, default_owner, default_branch_admin, default_worker)
VALUES ('trash.manage', 'trash_bin', 'Settings', 'View & Restore 15-Day Trash Bin', true, true, false)
ON CONFLICT (permission_key) DO UPDATE SET
  feature_key = EXCLUDED.feature_key,
  label = EXCLUDED.label,
  default_owner = EXCLUDED.default_owner,
  default_branch_admin = EXCLUDED.default_branch_admin,
  default_worker = EXCLUDED.default_worker;

INSERT INTO public.tenant_role_permissions (tenant_id, role, permission_key, allowed)
SELECT t.id, r.role, 'trash.manage',
       CASE WHEN r.role IN ('owner', 'branch_admin') THEN true ELSE false END
FROM public.tenants t
CROSS JOIN (VALUES ('owner'), ('branch_admin'), ('worker')) AS r(role)
ON CONFLICT (tenant_id, role, permission_key) DO NOTHING;
