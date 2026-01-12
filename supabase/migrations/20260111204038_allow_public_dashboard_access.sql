-- Allow anonymous users to read client data when accessing via dashboard_slug
-- This enables public client approval dashboards at /client/:slug

CREATE POLICY "Allow anonymous read by dashboard_slug"
  ON public.clients FOR SELECT
  TO anon
  USING (dashboard_slug IS NOT NULL);

-- Grant SELECT permission to anonymous users
GRANT SELECT ON public.clients TO anon;
