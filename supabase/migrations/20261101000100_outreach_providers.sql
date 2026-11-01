-- A workspace's outreach runs through Instantly, Email Bison or ReachInbox.
--
-- The tables keep their instantly_* names: the columns now hold "the
-- provider's id", whichever provider the workspace connected. See
-- docs/outreach-providers.md for why they were not renamed.
--
-- Email Bison and ReachInbox ids are integers, and Email Bison is self-hosted
-- per customer, so:
--   * provider id columns move from UUID to TEXT,
--   * a campaign id is unique per workspace, not globally (two Bison
--     instances can both have campaign 42),
--   * the provider workspace identity is (provider, base URL, id).

ALTER TABLE public.workspace_instantly_integrations
  ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'instantly',
  ADD COLUMN IF NOT EXISTS provider_base_url TEXT;

ALTER TABLE public.workspace_instantly_integrations
  DROP CONSTRAINT IF EXISTS workspace_instantly_integrations_provider_check;
ALTER TABLE public.workspace_instantly_integrations
  ADD CONSTRAINT workspace_instantly_integrations_provider_check
  CHECK (provider IN ('instantly', 'emailbison', 'reachinbox'));

-- Instantly and ReachInbox have fixed origins; Email Bison needs the
-- customer's own host.
-- The shape here is the floor. The Edge layer applies the full guard (no IP
-- literals, no internal names) before any request is made.
ALTER TABLE public.workspace_instantly_integrations
  DROP CONSTRAINT IF EXISTS workspace_instantly_integrations_base_url_check;
ALTER TABLE public.workspace_instantly_integrations
  ADD CONSTRAINT workspace_instantly_integrations_base_url_check
  CHECK (
    (provider IN ('instantly', 'reachinbox') AND provider_base_url IS NULL)
    OR (
      provider = 'emailbison'
      AND provider_base_url IS NOT NULL
      AND char_length(provider_base_url) <= 300
      AND provider_base_url ~ '^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
    )
  );

ALTER TABLE public.workspace_instantly_integrations
  DROP CONSTRAINT IF EXISTS workspace_instantly_integrations_provider_workspace_id_key;
ALTER TABLE public.workspace_instantly_integrations
  ALTER COLUMN provider_workspace_id TYPE TEXT USING provider_workspace_id::TEXT;
ALTER TABLE public.workspace_instantly_integrations
  DROP CONSTRAINT IF EXISTS workspace_instantly_integrations_provider_workspace_id_length;
ALTER TABLE public.workspace_instantly_integrations
  ADD CONSTRAINT workspace_instantly_integrations_provider_workspace_id_length
  CHECK (char_length(provider_workspace_id) BETWEEN 1 AND 100);

-- One provider workspace can belong to one tenant, as before. COALESCE keeps
-- Instantly rows (no base URL) unique on their id alone.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_instantly_integrations_provider_identity_key
  ON public.workspace_instantly_integrations (
    provider,
    COALESCE(provider_base_url, ''),
    provider_workspace_id
  );

COMMENT ON COLUMN public.workspace_instantly_integrations.provider IS
  'Outreach provider for this workspace: instantly, emailbison or reachinbox. One per workspace.';
COMMENT ON COLUMN public.workspace_instantly_integrations.provider_base_url IS
  'Email Bison instance origin (https://host). NULL for Instantly and ReachInbox, whose API origins are fixed.';

-- Campaign ids: TEXT, unique within a workspace.
ALTER TABLE public.workspace_client_campaigns
  DROP CONSTRAINT IF EXISTS workspace_client_campaigns_instantly_campaign_id_key;
ALTER TABLE public.workspace_client_campaigns
  ALTER COLUMN instantly_campaign_id TYPE TEXT USING instantly_campaign_id::TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS workspace_client_campaigns_workspace_provider_campaign_key
  ON public.workspace_client_campaigns (workspace_id, instantly_campaign_id)
  WHERE instantly_campaign_id IS NOT NULL;
ALTER TABLE public.workspace_client_campaigns
  DROP CONSTRAINT IF EXISTS workspace_client_campaigns_instantly_campaign_id_length;
ALTER TABLE public.workspace_client_campaigns
  ADD CONSTRAINT workspace_client_campaigns_instantly_campaign_id_length
  CHECK (instantly_campaign_id IS NULL OR char_length(instantly_campaign_id) BETWEEN 1 AND 100);

ALTER TABLE public.workspace_client_campaign_targets
  ALTER COLUMN instantly_lead_id TYPE TEXT USING instantly_lead_id::TEXT,
  ALTER COLUMN instantly_campaign_id TYPE TEXT USING instantly_campaign_id::TEXT;
ALTER TABLE public.workspace_client_campaign_targets
  DROP CONSTRAINT IF EXISTS workspace_client_campaign_targets_provider_id_length;
ALTER TABLE public.workspace_client_campaign_targets
  ADD CONSTRAINT workspace_client_campaign_targets_provider_id_length
  CHECK (
    (instantly_lead_id IS NULL OR char_length(instantly_lead_id) BETWEEN 1 AND 100)
    AND (instantly_campaign_id IS NULL OR char_length(instantly_campaign_id) BETWEEN 1 AND 100)
  );

ALTER TABLE public.client_instantly_campaign_links
  ALTER COLUMN instantly_campaign_id TYPE TEXT USING instantly_campaign_id::TEXT;
ALTER TABLE public.client_instantly_campaign_links
  DROP CONSTRAINT IF EXISTS client_instantly_campaign_links_campaign_id_length;
ALTER TABLE public.client_instantly_campaign_links
  ADD CONSTRAINT client_instantly_campaign_links_campaign_id_length
  CHECK (char_length(instantly_campaign_id) BETWEEN 1 AND 100);

COMMENT ON COLUMN public.workspace_client_campaigns.instantly_campaign_id IS
  'The outreach provider''s campaign id (Instantly UUID, or Email Bison / ReachInbox integer, as text).';
COMMENT ON COLUMN public.workspace_client_campaign_targets.instantly_lead_id IS
  'The outreach provider''s lead id (Instantly UUID, or Email Bison / ReachInbox integer, as text).';
COMMENT ON COLUMN public.workspace_client_campaign_targets.instantly_campaign_id IS
  'The provider campaign this target''s lead was staged into. NULL means the client''s own campaign on workspace_client_campaigns.';
