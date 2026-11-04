-- The pitch recipient, chosen in Step 1 from any source.
--
-- Step 1 of the pitch workspace draws on three sources (Podscan inboxes, the
-- verified host email, addresses the operator found) and sends every pitch to
-- exactly ONE of them, on every platform. No CC: Instantly and Email Bison
-- cannot copy a campaign lead, and the product sends one address everywhere.
--
-- 1. client_dashboard_podcasts.pitch_recipients: the chosen recipient, per
--    client + podcast, as a one-element list (the shape leaves room for more
--    without another migration). It lives on the shortlist row because that
--    row exists from Step 1 on; the campaign target is only created when the
--    pitch is sent. NULL means "never chosen", and the app then falls back to
--    the target's contact_email.
-- 2. podcast_contact_emails: the shared contact network's other addresses —
--    ones operators found themselves (unverified until a reply or Blitz proves
--    them) and ones a send proved bounced. podcast_direct_contacts stays the
--    one verified direct contact per podcast; this table never replaces it.

ALTER TABLE public.client_dashboard_podcasts
  ADD COLUMN IF NOT EXISTS pitch_recipients JSONB;

ALTER TABLE public.client_dashboard_podcasts
  DROP CONSTRAINT IF EXISTS client_dashboard_podcasts_pitch_recipients_check;
ALTER TABLE public.client_dashboard_podcasts
  ADD CONSTRAINT client_dashboard_podcasts_pitch_recipients_check CHECK (
    pitch_recipients IS NULL OR (
      jsonb_typeof(pitch_recipients) = 'array'
      AND jsonb_array_length(pitch_recipients) <= 1
    )
  );

COMMENT ON COLUMN public.client_dashboard_podcasts.pitch_recipients IS
  'The pitch recipient chosen in Step 1: [{email, source, sources, status, role: "to", contact_role?, mx?}], at most one. Written only by workspace-client-shortlist (recipients-save), which recomputes source and status server-side.';

CREATE TABLE IF NOT EXISTS public.podcast_contact_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The Podscan id the shortlist and campaign targets key podcasts by. Not a
  -- foreign key: a shortlisted show can predate its catalogue row.
  podcast_id TEXT NOT NULL CHECK (length(btrim(podcast_id)) BETWEEN 1 AND 200),
  email TEXT NOT NULL,
  normalized_email TEXT GENERATED ALWAYS AS (lower(btrim(email))) STORED,
  -- Where the network first learned the address. 'outreach' is an address it
  -- only learned about because a send to it bounced.
  source TEXT NOT NULL CHECK (source IN ('podscan', 'verified', 'manual', 'outreach')),
  status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (status IN ('verified', 'unverified', 'bounced')),
  contact_role TEXT CHECK (contact_role IS NULL OR contact_role IN ('host', 'producer', 'booking', 'other')),
  -- Result of the optional MX lookup when the address was added: 'none' means
  -- the domain publishes no mail server. Advisory only; nothing blocks on it.
  mx_status TEXT CHECK (mx_status IS NULL OR mx_status IN ('ok', 'none', 'unknown')),
  first_seen_workspace_id UUID REFERENCES public.workspaces(id) ON DELETE SET NULL,
  first_seen_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT podcast_contact_emails_email_check CHECK (
    normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND length(email) <= 254
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS podcast_contact_emails_podcast_email_idx
  ON public.podcast_contact_emails (podcast_id, normalized_email);
CREATE INDEX IF NOT EXISTS podcast_contact_emails_normalized_email_idx
  ON public.podcast_contact_emails (normalized_email);

COMMENT ON TABLE public.podcast_contact_emails IS
  'Private, platform-wide addresses for a podcast beyond the Podscan inbox and the one verified direct contact: operator-found (unverified until proven) and bounced. Service role only, like podcast_direct_contacts.';

-- Same posture as podcast_direct_contacts: platform-wide, so no tenant can
-- read it directly; edge functions decide what each workspace is shown.
ALTER TABLE public.podcast_contact_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_contact_emails FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.podcast_contact_emails FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.podcast_contact_emails TO service_role;
