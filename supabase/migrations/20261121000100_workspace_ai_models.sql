-- Which model each AI step runs on, chosen per workspace on the Integrations page.
--
-- 'default' is the workspace-wide model; every other id is one AI step whose
-- model used to be hardcoded. The research/pitch stages keep their per-stage
-- choice on workspace_research_prompts.model and fall back to 'default' here.
--
-- An absent row means "follow the next level" (step -> workspace default ->
-- shipped default), so a workspace nobody has touched runs exactly as before.
--
-- As on workspace_research_prompts.model, the model id is deliberately not
-- checked against a list: the usable set is whatever the provider's Models API
-- reports for the key in play. The edge function validates against that live
-- list on write; the CHECK here only bounds the shape.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:workspace-ai-models:v1', 0));

CREATE TABLE IF NOT EXISTS public.workspace_ai_models (
  workspace_id UUID NOT NULL
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  setting_id TEXT NOT NULL CHECK (setting_id IN (
    'default',
    'research_structure',
    'pitch_fact_check',
    'host_discovery',
    'fit_scoring',
    'search_queries',
    'prospect_dashboard',
    'autopilot',
    'profile_drafts'
  )),
  model TEXT NOT NULL CHECK (length(model) BETWEEN 1 AND 128 AND model ~ '^[a-zA-Z0-9._-]+$'),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, setting_id)
);

-- Service-role only, like workspace_research_prompts: read and written through
-- the workspace-client-campaigns edge function, never directly by clients.
ALTER TABLE public.workspace_ai_models ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_ai_models FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.workspace_ai_models FROM service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.workspace_ai_models TO service_role;

COMMENT ON TABLE public.workspace_ai_models IS
  'Per-workspace AI model choices: a workspace default and per-step overrides. Absent row = follow the next level (step -> default -> shipped).';

COMMIT;
