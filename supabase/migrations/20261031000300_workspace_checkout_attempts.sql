-- Freeze one checkout attempt per workspace before contacting Stripe. An
-- unknown provider outcome must survive retries, deploys and different managers.
BEGIN;

CREATE TABLE public.workspace_checkout_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  customer_id TEXT NOT NULL CHECK (customer_id <> ''),
  plan_key TEXT NOT NULL CHECK (plan_key <> ''),
  price_id TEXT NOT NULL CHECK (price_id <> ''),
  success_url TEXT NOT NULL CHECK (length(success_url) BETWEEN 1 AND 2000),
  cancel_url TEXT NOT NULL CHECK (length(cancel_url) BETWEEN 1 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '1 hour'),
  stripe_session_id TEXT UNIQUE,
  retired_at TIMESTAMPTZ,
  retired_reason TEXT CHECK (retired_reason IN ('expired', 'subscription_ended', 'absent_after_expiry')),
  CHECK (expires_at > created_at),
  CHECK ((retired_at IS NULL) = (retired_reason IS NULL))
);
CREATE UNIQUE INDEX workspace_checkout_attempts_one_active
  ON public.workspace_checkout_attempts(workspace_id) WHERE retired_at IS NULL;
ALTER TABLE public.workspace_checkout_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_checkout_attempts FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_checkout_attempts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.workspace_checkout_attempts TO service_role;

CREATE FUNCTION public.claim_workspace_checkout_attempt_v1(
  p_workspace_id UUID, p_customer_id TEXT, p_plan_key TEXT, p_price_id TEXT,
  p_success_url TEXT, p_cancel_url TEXT,
  p_replace_attempt_id UUID DEFAULT NULL, p_retired_reason TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE attempt public.workspace_checkout_attempts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-checkout:' || p_workspace_id::text, 0));
  SELECT * INTO attempt FROM public.workspace_checkout_attempts
    WHERE workspace_id = p_workspace_id AND retired_at IS NULL FOR UPDATE;
  IF FOUND THEN
    IF p_replace_attempt_id IS NULL OR attempt.id <> p_replace_attempt_id THEN
      RETURN to_jsonb(attempt);
    END IF;
    IF p_retired_reason IS NULL OR p_retired_reason NOT IN ('expired', 'subscription_ended', 'absent_after_expiry') THEN
      RAISE EXCEPTION 'CHECKOUT_RETIRE_REASON_REQUIRED';
    END IF;
    -- Expired/ended reasons require a confirmed Stripe response in the caller.
    -- Absence additionally requires the frozen expiry plus a clock-skew margin.
    IF p_retired_reason = 'absent_after_expiry' AND now() <= attempt.expires_at + interval '1 minute' THEN
      RAISE EXCEPTION 'CHECKOUT_NOT_EXPIRED';
    END IF;
    UPDATE public.workspace_checkout_attempts
      SET retired_at = now(), retired_reason = p_retired_reason WHERE id = attempt.id;
  ELSIF p_replace_attempt_id IS NOT NULL THEN
    RAISE EXCEPTION 'CHECKOUT_ATTEMPT_MISSING';
  END IF;
  INSERT INTO public.workspace_checkout_attempts(workspace_id, customer_id, plan_key, price_id, success_url, cancel_url)
    VALUES(p_workspace_id, p_customer_id, p_plan_key, p_price_id, p_success_url, p_cancel_url)
    RETURNING * INTO attempt;
  RETURN to_jsonb(attempt);
END;
$$;

CREATE FUNCTION public.record_workspace_checkout_session_v1(p_workspace_id UUID, p_attempt_id UUID, p_session_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE attempt public.workspace_checkout_attempts;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('workspace-checkout:' || p_workspace_id::text, 0));
  SELECT * INTO attempt FROM public.workspace_checkout_attempts
    WHERE id = p_attempt_id AND workspace_id = p_workspace_id AND retired_at IS NULL FOR UPDATE;
  IF NOT FOUND OR p_session_id IS NULL OR p_session_id = '' THEN RAISE EXCEPTION 'CHECKOUT_ATTEMPT_UNAVAILABLE'; END IF;
  IF attempt.stripe_session_id IS NOT NULL AND attempt.stripe_session_id <> p_session_id THEN
    RAISE EXCEPTION 'CHECKOUT_SESSION_CONFLICT';
  END IF;
  UPDATE public.workspace_checkout_attempts SET stripe_session_id = p_session_id
    WHERE id = attempt.id RETURNING * INTO attempt;
  RETURN to_jsonb(attempt);
END;
$$;

-- All customer-creation callers converge on the already recorded customer;
-- a late retry cannot overwrite a customer that another manager persisted.
CREATE FUNCTION public.record_workspace_billing_customer_v1(p_workspace_id UUID, p_customer_id TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE customer_id TEXT;
BEGIN
  IF p_customer_id IS NULL OR p_customer_id = '' THEN RAISE EXCEPTION 'CUSTOMER_REQUIRED'; END IF;
  INSERT INTO public.workspace_billing_profiles(workspace_id, stripe_customer_id)
    VALUES(p_workspace_id, p_customer_id)
    ON CONFLICT (workspace_id) DO UPDATE SET
      stripe_customer_id = COALESCE(NULLIF(workspace_billing_profiles.stripe_customer_id, ''), EXCLUDED.stripe_customer_id),
      updated_at = now()
    RETURNING stripe_customer_id INTO customer_id;
  RETURN customer_id;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_workspace_checkout_attempt_v1(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_checkout_attempt_v1(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,UUID,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.record_workspace_checkout_session_v1(UUID,UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_workspace_checkout_session_v1(UUID,UUID,TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.record_workspace_billing_customer_v1(UUID,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_workspace_billing_customer_v1(UUID,TEXT) TO service_role;
COMMIT;
