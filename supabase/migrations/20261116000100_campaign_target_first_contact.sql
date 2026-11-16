-- When the host was first emailed, as distinct from most recently emailed.
--
-- The client portal told a client "Emailed Nov 9" for a show, and a week later
-- the same row said "Emailed Nov 16". Nothing was wrong with the row: the only
-- send timestamp we kept was last_contact_at, written from the provider's
-- timestamp_last_contact, which moves forward every time a follow-up goes out.
-- A client watching one show saw its first-contact date creep, and the
-- "Pitches emailed by month" chart re-bucketed shows into later months.
--
-- first_contact_at answers the question the client is actually asking — when
-- did you first pitch me to this host — and is written once and never moved.
-- last_contact_at keeps its meaning for the staff views, which care about the
-- most recent send when judging whether a sequence is still running.

ALTER TABLE public.workspace_client_campaign_targets
  ADD COLUMN IF NOT EXISTS first_contact_at TIMESTAMPTZ;

COMMENT ON COLUMN public.workspace_client_campaign_targets.first_contact_at IS
  'When the first pitch email reached this host. Written once and never moved, unlike last_contact_at which advances with every follow-up.';

-- Backfill from what the existing rows can prove. launched_at is exact: the
-- launch path created the lead and started the sequence together. Where there
-- is no launch, last_contact_at is the only send evidence the row carries; it
-- may already be a follow-up, so the backfilled date can be later than the
-- true first send. That is the best this data supports, and from here the
-- value is frozen, so no client sees a date move again.
UPDATE public.workspace_client_campaign_targets
SET first_contact_at = COALESCE(launched_at, last_contact_at)
WHERE first_contact_at IS NULL
  AND COALESCE(launched_at, last_contact_at) IS NOT NULL;
