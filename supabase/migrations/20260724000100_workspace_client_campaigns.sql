-- Workspace-owned Instantly connections and podcast outreach campaigns.
-- Provider credentials are encrypted by the Edge Function before they reach
-- Postgres. These tables intentionally have no browser-facing RLS policies.

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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.client_dashboard_podcasts'::regclass
      AND conname = 'client_dashboard_podcasts_client_id_id_key'
  ) THEN
    ALTER TABLE public.client_dashboard_podcasts
      ADD CONSTRAINT client_dashboard_podcasts_client_id_id_key
      UNIQUE (client_id, id);
  END IF;
END;
$$;

CREATE TABLE public.workspace_instantly_integrations (
  workspace_id UUID PRIMARY KEY
    REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider_workspace_id UUID NOT NULL UNIQUE,
  provider_workspace_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'connected'
    CHECK (status IN ('connected', 'error', 'disconnected')),
  api_key_ciphertext TEXT,
  api_key_iv TEXT,
  api_key_last_four TEXT,
  accounts_snapshot JSONB NOT NULL DEFAULT '[]'::JSONB
    CHECK (jsonb_typeof(accounts_snapshot) = 'array'),
  connected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  connected_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  CONSTRAINT workspace_instantly_active_credential_check CHECK (
    status <> 'connected'
    OR (
      api_key_ciphertext IS NOT NULL
      AND api_key_iv IS NOT NULL
      AND api_key_last_four IS NOT NULL
      AND char_length(api_key_last_four) = 4
    )
  )
);

CREATE TABLE public.workspace_client_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 180),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'attention')),
  instantly_campaign_id UUID UNIQUE,
  instantly_campaign_status INTEGER
    CHECK (instantly_campaign_status IS NULL OR instantly_campaign_status IN (-99, -2, -1, 0, 1, 2, 3, 4)),
  sender_accounts TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  timezone TEXT NOT NULL DEFAULT 'America/New_York'
    CHECK (char_length(timezone) BETWEEN 1 AND 100),
  daily_limit INTEGER NOT NULL DEFAULT 30 CHECK (daily_limit BETWEEN 1 AND 1000),
  analytics JSONB NOT NULL DEFAULT '{}'::JSONB
    CHECK (jsonb_typeof(analytics) = 'object'),
  provider_sync_state TEXT NOT NULL DEFAULT 'idle'
    CHECK (provider_sync_state IN ('idle', 'creating', 'syncing', 'error')),
  provider_sync_started_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  CONSTRAINT workspace_client_campaigns_workspace_client_fkey
    FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE,
  CONSTRAINT workspace_client_campaigns_one_per_client
    UNIQUE (workspace_id, client_id),
  CONSTRAINT workspace_client_campaigns_workspace_client_id_key
    UNIQUE (workspace_id, client_id, id)
);

CREATE TABLE public.workspace_client_campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  campaign_id UUID NOT NULL,
  client_id UUID NOT NULL,
  shortlist_podcast_id UUID NOT NULL,
  podcast_id TEXT NOT NULL CHECK (char_length(podcast_id) BETWEEN 1 AND 300),
  podcast_name TEXT NOT NULL CHECK (char_length(podcast_name) BETWEEN 1 AND 500),
  podcast_url TEXT,
  host_name TEXT,
  contact_email TEXT,
  selection_source TEXT NOT NULL
    CHECK (selection_source IN ('client_positive', 'owner_override')),
  wave_started_on DATE NOT NULL
    DEFAULT date_trunc('week', timezone('utc'::TEXT, now()))::DATE,
  pitch_subject TEXT CHECK (pitch_subject IS NULL OR char_length(pitch_subject) <= 300),
  pitch_body TEXT CHECK (pitch_body IS NULL OR char_length(pitch_body) <= 20000),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'launching', 'in_outreach', 'replied', 'completed', 'failed')),
  instantly_lead_id UUID,
  instantly_lead_status INTEGER,
  email_open_count INTEGER NOT NULL DEFAULT 0 CHECK (email_open_count >= 0),
  email_reply_count INTEGER NOT NULL DEFAULT 0 CHECK (email_reply_count >= 0),
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  launched_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ,
  last_error TEXT CHECK (last_error IS NULL OR char_length(last_error) <= 1000),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::TEXT, now()),
  CONSTRAINT workspace_client_campaign_targets_campaign_fkey
    FOREIGN KEY (workspace_id, client_id, campaign_id)
    REFERENCES public.workspace_client_campaigns(workspace_id, client_id, id)
    ON DELETE CASCADE,
  CONSTRAINT workspace_client_campaign_targets_shortlist_fkey
    FOREIGN KEY (client_id, shortlist_podcast_id)
    REFERENCES public.client_dashboard_podcasts(client_id, id)
    ON DELETE CASCADE,
  CONSTRAINT workspace_client_campaign_targets_one_podcast
    UNIQUE (campaign_id, shortlist_podcast_id),
  CONSTRAINT workspace_client_campaign_targets_one_provider_lead
    UNIQUE (campaign_id, instantly_lead_id)
);

CREATE INDEX workspace_client_campaigns_workspace_status_idx
  ON public.workspace_client_campaigns(workspace_id, status, updated_at DESC);

CREATE INDEX workspace_client_campaign_targets_campaign_wave_idx
  ON public.workspace_client_campaign_targets(campaign_id, wave_started_on DESC, created_at DESC);

CREATE INDEX workspace_client_campaign_targets_workspace_status_idx
  ON public.workspace_client_campaign_targets(workspace_id, status, updated_at DESC);

CREATE OR REPLACE FUNCTION public.set_workspace_client_campaign_updated_at_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := timezone('utc'::TEXT, now());
  RETURN NEW;
END;
$$;

CREATE TRIGGER workspace_instantly_integrations_updated_at
  BEFORE UPDATE ON public.workspace_instantly_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_workspace_client_campaign_updated_at_v1();

CREATE TRIGGER workspace_client_campaigns_updated_at
  BEFORE UPDATE ON public.workspace_client_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.set_workspace_client_campaign_updated_at_v1();

CREATE TRIGGER workspace_client_campaign_targets_updated_at
  BEFORE UPDATE ON public.workspace_client_campaign_targets
  FOR EACH ROW EXECUTE FUNCTION public.set_workspace_client_campaign_updated_at_v1();

ALTER TABLE public.workspace_instantly_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_client_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_client_campaign_targets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.workspace_instantly_integrations FROM anon, authenticated;
REVOKE ALL ON TABLE public.workspace_client_campaigns FROM anon, authenticated;
REVOKE ALL ON TABLE public.workspace_client_campaign_targets FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.set_workspace_client_campaign_updated_at_v1() FROM PUBLIC;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_instantly_integrations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_client_campaigns TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.workspace_client_campaign_targets TO service_role;

COMMENT ON TABLE public.workspace_instantly_integrations IS
  'One encrypted Instantly API connection per GOAP workspace. No browser role has direct access.';
COMMENT ON TABLE public.workspace_client_campaigns IS
  'One ongoing Instantly-backed podcast outreach campaign per workspace client.';
COMMENT ON TABLE public.workspace_client_campaign_targets IS
  'Weekly podcast targets, reviewed pitch copy, and provider lead state for a client campaign.';
