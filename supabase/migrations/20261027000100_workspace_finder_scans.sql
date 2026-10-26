-- Podcast Finder scans, kept so a paid scan survives a refresh.
--
-- A scan ran entirely in the browser and its ranked results lived only in
-- component state: refreshing, leaving the page or picking another client
-- threw away discovery and scoring the workspace had already paid for. Each
-- finished scan is now stored with the queries it ran, the filters it used and
-- its ranked results, so the page can list recent scans, reopen one, and draft
-- the next strategy away from the angles already tried.
--
-- Written and read only by the workspace-clients Edge Function under the
-- service role, which checks workspace access first. No browser role has
-- direct access, the same as the campaign tables.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass
      AND conname = 'clients_workspace_id_id_key'
  ) THEN
    ALTER TABLE public.clients
      ADD CONSTRAINT clients_workspace_id_id_key UNIQUE (workspace_id, id);
  END IF;
END;
$$;

CREATE TABLE public.workspace_finder_scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  -- The search terms the scan actually ran: the operator's keywords and the
  -- AI strategy, after removals.
  queries TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  filters JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Podcasts found before the scoring cap, and how many were ranked.
  found_count INTEGER NOT NULL DEFAULT 0 CHECK (found_count BETWEEN 0 AND 100000),
  match_count INTEGER NOT NULL DEFAULT 0 CHECK (match_count BETWEEN 0 AND 500),
  -- The most the scan could have charged, as the page computed it before it
  -- ran. The ledger holds what was actually charged.
  credits_used INTEGER NOT NULL DEFAULT 0 CHECK (credits_used BETWEEN 0 AND 1000),
  results JSONB NOT NULL DEFAULT '[]'::JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  CONSTRAINT workspace_finder_scans_workspace_client_fkey
    FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT workspace_finder_scans_queries_check CHECK (
    cardinality(queries) <= 40
  ),
  CONSTRAINT workspace_finder_scans_filters_check CHECK (
    jsonb_typeof(filters) = 'object'
    AND octet_length(filters::TEXT) <= 8192
  ),
  CONSTRAINT workspace_finder_scans_results_check CHECK (
    jsonb_typeof(results) = 'array'
    AND octet_length(results::TEXT) <= 524288
  )
);

CREATE INDEX workspace_finder_scans_client_recent_idx
  ON public.workspace_finder_scans (workspace_id, client_id, created_at DESC);

CREATE INDEX workspace_finder_scans_workspace_recent_idx
  ON public.workspace_finder_scans (workspace_id, created_at DESC);

ALTER TABLE public.workspace_finder_scans ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workspace_finder_scans FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_finder_scans TO service_role;

COMMENT ON TABLE public.workspace_finder_scans IS
  'Finished Podcast Finder scans per workspace client: queries, filters and ranked results. No browser role has direct access.';
