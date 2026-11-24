-- Demo and pricing enquiries submitted from the public landing page.
-- Only platform admins can read or change them through the application role.
CREATE TABLE IF NOT EXISTS public.landing_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact TEXT NOT NULL CHECK (char_length(contact) BETWEEN 5 AND 160),
  business TEXT NOT NULL CHECK (char_length(business) BETWEEN 2 AND 160),
  interest TEXT CHECK (interest IS NULL OR char_length(interest) <= 120),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  ip_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_landing_enquiries_created ON public.landing_enquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_landing_enquiries_ip ON public.landing_enquiries (ip_hash, created_at DESC);

ALTER TABLE public.landing_enquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.landing_enquiries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS landing_enquiries_platform ON public.landing_enquiries;
CREATE POLICY landing_enquiries_platform ON public.landing_enquiries
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

GRANT SELECT, INSERT, UPDATE ON public.landing_enquiries TO nexus_app;
