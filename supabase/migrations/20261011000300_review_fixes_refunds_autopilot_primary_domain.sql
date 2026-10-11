-- Review fixes: refundable mailbox orders, visible autopilot failures, and an
-- atomic primary-domain switch.
--
--  1. workspace_mailbox_orders records the exact ledger debits each order was
--     paid with, so a provider job that later fails can reverse them, and
--     stamps when that refund happened so it is never issued twice. The order
--     row is now written before the provider is called, so winnr_job_id stays
--     nullable until the provider accepts.
--  2. client_autopilot_settings records why the last run did not finish. A
--     failed run used to vanish: the claim had already pushed next_run_at a
--     week out and nothing told the agency why no shows arrived.
--  3. set_workspace_primary_domain_v1 clears the old primary and sets the new
--     one in one transaction. Two separate updates from the edge function left
--     a workspace with no primary at all (client links falling back to the
--     platform domain) whenever the second write failed.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:review-fixes-20261011000300:v1', 0));

-- 1. Mailbox orders --------------------------------------------------------
ALTER TABLE public.workspace_mailbox_orders
  ADD COLUMN IF NOT EXISTS charged_entry_ids UUID[] NOT NULL DEFAULT '{}'::UUID[];
ALTER TABLE public.workspace_mailbox_orders
  ADD COLUMN IF NOT EXISTS credits_refunded_at TIMESTAMPTZ;

COMMENT ON COLUMN public.workspace_mailbox_orders.charged_entry_ids IS
  'Ledger debit entries this order was paid with (fresh charges only). Refunded by id when the provider fails the job.';
COMMENT ON COLUMN public.workspace_mailbox_orders.credits_refunded_at IS
  'When the order''s debits were refunded. Set together with status = failed by the single caller that claims the failure.';

-- 2. Autopilot run failures --------------------------------------------------
ALTER TABLE public.client_autopilot_settings
  ADD COLUMN IF NOT EXISTS last_run_error TEXT;
ALTER TABLE public.client_autopilot_settings
  ADD COLUMN IF NOT EXISTS last_run_error_at TIMESTAMPTZ;

ALTER TABLE public.client_autopilot_settings
  DROP CONSTRAINT IF EXISTS client_autopilot_settings_last_run_error_length;
ALTER TABLE public.client_autopilot_settings
  ADD CONSTRAINT client_autopilot_settings_last_run_error_length
  CHECK (last_run_error IS NULL OR char_length(last_run_error) <= 500);

-- 3. Atomic primary domain ---------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_workspace_primary_domain_v1(p_domain_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target RECORD;
BEGIN
  IF p_domain_id IS NULL THEN
    RAISE EXCEPTION 'domain id is required' USING ERRCODE = '22023';
  END IF;

  SELECT domain.id, domain.workspace_id, domain.hostname, domain.status
  INTO target
  FROM public.workspace_domains AS domain
  WHERE domain.id = p_domain_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'DOMAIN_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;
  IF target.status <> 'active' THEN
    RAISE EXCEPTION 'DOMAIN_NOT_SERVING' USING ERRCODE = '22023';
  END IF;

  -- Clear first: the partial unique index allows one primary per workspace
  -- and is not deferrable, so setting before clearing would collide.
  UPDATE public.workspace_domains
  SET is_primary = false, updated_at = now()
  WHERE workspace_id = target.workspace_id
    AND is_primary
    AND id <> target.id;

  UPDATE public.workspace_domains
  SET is_primary = true, updated_at = now()
  WHERE id = target.id;

  RETURN jsonb_build_object(
    'id', target.id,
    'workspace_id', target.workspace_id,
    'hostname', target.hostname
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_workspace_primary_domain_v1(UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_workspace_primary_domain_v1(UUID)
  TO service_role;

COMMIT;
