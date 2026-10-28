-- Flat subscriptions with customer-owned providers. Preserve every historical
-- lot and ledger entry, including references needed by delayed Stripe events.
BEGIN;

ALTER TABLE public.workspace_billing_profiles
  ALTER COLUMN plan_key SET DEFAULT 'standard',
  ALTER COLUMN base_price_cents SET DEFAULT 9900,
  ALTER COLUMN monthly_credit_allowance SET DEFAULT 0;

UPDATE public.billing_plans
SET monthly_credit_allowance = 0,
    is_purchasable = (plan_key = 'standard'),
    updated_at = now();
-- Existing Stripe prices and subscription identities are deliberately retained.
UPDATE public.workspace_billing_profiles
SET monthly_credit_allowance = 0,
    refill_enabled = false,
    refill_threshold_credits = NULL,
    refill_pack_credits = NULL,
    refill_monthly_cap_cents = NULL;

ALTER TABLE public.workspace_ai_credentials
  DROP CONSTRAINT IF EXISTS workspace_ai_credentials_provider_check;
ALTER TABLE public.workspace_ai_credentials
  ADD CONSTRAINT workspace_ai_credentials_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'winnr', 'blitz', 'podscan'));

-- Old callers and stale scheduled jobs must not issue new allowances/debits.
CREATE OR REPLACE FUNCTION public.grant_monthly_allowances_v1()
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT jsonb_build_object('granted_workspaces', 0, 'granted_credits', 0, 'retired', true); $$;

CREATE OR REPLACE FUNCTION public.spend_workspace_credits_v1(
  p_workspace_id UUID, p_operation_type TEXT,
  p_reference_kind TEXT DEFAULT NULL, p_reference_id TEXT DEFAULT NULL,
  p_client_id UUID DEFAULT NULL, p_actor_user_id UUID DEFAULT NULL,
  p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = ''
AS $$ SELECT jsonb_build_object('charged', 0, 'entry_id', NULL, 'idempotent', false, 'retired', true); $$;

INSERT INTO public.operation_credit_costs (operation_type, credit_cost)
VALUES
  ('research_run', 0),
  ('email_unlock_identify', 0),
  ('email_unlock_find', 0),
  ('email_unlock_verify', 0),
  ('dashboard_build', 0),
  ('query_generation', 0),
  ('compatibility_scoring', 0),
  ('podscan_lookup', 0),
  ('semantic_search', 0),
  ('pitch_profile', 0),
  ('mailbox_domain_purchase', 0),
  ('mailbox_monthly', 0)
ON CONFLICT DO NOTHING;

DO $$
DECLARE job RECORD;
BEGIN
  IF to_regclass('cron.job') IS NOT NULL THEN
    FOR job IN SELECT jobid FROM cron.job WHERE jobname IN
      ('workspace-monthly-allowance', 'workspace-credit-refill', 'workspace-credit-expiry')
    LOOP
      PERFORM cron.unschedule(job.jobid);
    END LOOP;
  END IF;
END;
$$;

-- Single entitlement decision for authenticated features and scheduled work.
-- Manual active/complimentary accounts remain supported. The default workspace
-- hosts platform operations and is not a customer subscription.
CREATE OR REPLACE FUNCTION public.workspace_subscription_access_v1(p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT w.status = 'active' AND (
      w.is_default OR p.billing_status IN ('active', 'comped') OR (
        COALESCE(p.billing_status, 'trialing') = 'trialing'
        AND COALESCE(p.trial_ends_at, w.created_at + interval '14 days') > now()
      )
    )
    FROM public.workspaces w
    LEFT JOIN public.workspace_billing_profiles p ON p.workspace_id = w.id
    WHERE w.id = p_workspace_id
  ), false);
$$;
REVOKE ALL ON FUNCTION public.workspace_subscription_access_v1(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_subscription_access_v1(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.grant_monthly_allowances_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_monthly_allowances_v1() TO service_role;
REVOKE ALL ON FUNCTION public.spend_workspace_credits_v1(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spend_workspace_credits_v1(UUID, TEXT, TEXT, TEXT, UUID, UUID, TEXT) TO service_role;
COMMIT;
