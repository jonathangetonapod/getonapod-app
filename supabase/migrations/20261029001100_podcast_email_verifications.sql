-- Deliverability of podcast inbox addresses, checked with MillionVerifier.
--
-- Keyed by address rather than by show: many shows share one network or
-- publisher inbox, so each address is checked once and the result serves every
-- show (and every workspace) that lists it. podcasts.podscan_email is never
-- rewritten; the catalog reads these results alongside it.

CREATE TABLE public.podcast_email_verifications (
  normalized_email TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('ok', 'catch_all', 'unknown', 'disposable', 'invalid', 'error')),
  subresult TEXT,
  quality TEXT,
  is_free BOOLEAN,
  is_role BOOLEAN,
  did_you_mean TEXT,
  provider TEXT NOT NULL DEFAULT 'millionverifier',
  checked_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT podcast_email_verifications_normalized_check CHECK (
    normalized_email = lower(btrim(normalized_email))
    AND normalized_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  )
);

-- Re-checks pick the oldest results first.
CREATE INDEX podcast_email_verifications_checked_at_idx
  ON public.podcast_email_verifications (checked_at);

COMMENT ON TABLE public.podcast_email_verifications IS
  'Private, global deliverability results for podcast inbox addresses (MillionVerifier), one row per normalized address.';
COMMENT ON COLUMN public.podcast_email_verifications.status IS
  'MillionVerifier result: ok (deliverable), catch_all (domain accepts everything, unconfirmable), unknown, disposable, invalid, error.';

ALTER TABLE public.podcast_email_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.podcast_email_verifications FORCE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.podcast_email_verifications FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.podcast_email_verifications TO service_role;
