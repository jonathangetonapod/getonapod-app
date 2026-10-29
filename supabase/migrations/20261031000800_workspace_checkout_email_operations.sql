-- Checkout mail has a business identity independent of content. Unknown delivery
-- blocks a new action for the same checkout and recipient; age never releases it.
BEGIN;
CREATE TABLE public.workspace_checkout_email_operations (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  action_key UUID NOT NULL,
  scope_hash TEXT NOT NULL CHECK (scope_hash ~ '^[0-9a-f]{64}$'),
  payload_hash TEXT NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  owner_token UUID NOT NULL DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'sending' CHECK (status IN ('sending', 'sent', 'failed', 'skipped', 'unknown')),
  provider_message_id TEXT CHECK (provider_message_id IS NULL OR length(provider_message_id) BETWEEN 1 AND 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, action_key),
  CHECK (status <> 'sent' OR provider_message_id IS NOT NULL)
);
CREATE UNIQUE INDEX workspace_checkout_email_one_unresolved_scope
  ON public.workspace_checkout_email_operations(workspace_id, scope_hash) WHERE status IN ('sending', 'unknown');
ALTER TABLE public.workspace_checkout_email_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_checkout_email_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_checkout_email_operations FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.claim_workspace_checkout_email_v1(
  p_workspace_id UUID, p_action_key UUID, p_scope_hash TEXT, p_payload_hash TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation public.workspace_checkout_email_operations;
BEGIN
  IF p_workspace_id IS NULL OR p_action_key IS NULL
    OR p_scope_hash IS NULL OR p_scope_hash !~ '^[0-9a-f]{64}$'
    OR p_payload_hash IS NULL OR p_payload_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'CHECKOUT_EMAIL_INVALID_OPERATION';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout-email:' || p_workspace_id::text, 0));
  SELECT * INTO operation FROM public.workspace_checkout_email_operations
    WHERE workspace_id = p_workspace_id AND action_key = p_action_key;
  IF FOUND THEN
    IF operation.scope_hash <> p_scope_hash OR operation.payload_hash <> p_payload_hash THEN
      RETURN jsonb_build_object('outcome', 'conflict');
    END IF;
    RETURN jsonb_build_object('outcome', 'existing', 'status', operation.status);
  END IF;
  IF EXISTS (SELECT 1 FROM public.workspace_checkout_email_operations
    WHERE workspace_id = p_workspace_id AND scope_hash = p_scope_hash AND status IN ('sending', 'unknown')) THEN
    RETURN jsonb_build_object('outcome', 'blocked', 'status', 'unknown');
  END IF;
  INSERT INTO public.workspace_checkout_email_operations(workspace_id, action_key, scope_hash, payload_hash)
    VALUES(p_workspace_id, p_action_key, p_scope_hash, p_payload_hash) RETURNING * INTO operation;
  RETURN jsonb_build_object('outcome', 'claimed', 'status', operation.status, 'owner_token', operation.owner_token);
END;
$$;

CREATE FUNCTION public.complete_workspace_checkout_email_v1(
  p_workspace_id UUID, p_action_key UUID, p_owner_token UUID, p_status TEXT, p_provider_message_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE operation public.workspace_checkout_email_operations;
BEGIN
  IF p_status IS NULL OR p_status NOT IN ('sent', 'failed', 'skipped', 'unknown')
    OR (p_status = 'sent' AND COALESCE(length(btrim(p_provider_message_id)), 0) NOT BETWEEN 1 AND 255) THEN
    RAISE EXCEPTION 'CHECKOUT_EMAIL_INVALID_RESULT';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout-email:' || p_workspace_id::text, 0));
  UPDATE public.workspace_checkout_email_operations
    SET status = p_status, provider_message_id = CASE WHEN p_status = 'sent' THEN btrim(p_provider_message_id) ELSE NULL END,
      completed_at = now()
    WHERE workspace_id = p_workspace_id AND action_key = p_action_key AND owner_token = p_owner_token AND status = 'sending'
    RETURNING * INTO operation;
  IF NOT FOUND THEN
    -- A repeated identical completion is safe; unknown and other terminal states
    -- cannot be rewritten by late workers or a new action.
    SELECT * INTO operation FROM public.workspace_checkout_email_operations
      WHERE workspace_id = p_workspace_id AND action_key = p_action_key AND owner_token = p_owner_token
      AND status = p_status AND provider_message_id IS NOT DISTINCT FROM
        (CASE WHEN p_status = 'sent' THEN btrim(p_provider_message_id) ELSE NULL END);
    IF NOT FOUND THEN RAISE EXCEPTION 'CHECKOUT_EMAIL_RESULT_CONFLICT'; END IF;
  END IF;
  RETURN jsonb_build_object('status', operation.status);
END;
$$;

CREATE FUNCTION public.workspace_checkout_email_outcome_v1(p_workspace_id UUID, p_action_key UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('status', status) FROM public.workspace_checkout_email_operations
    WHERE workspace_id = p_workspace_id AND action_key = p_action_key;
$$;

REVOKE ALL ON FUNCTION public.claim_workspace_checkout_email_v1(UUID,UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_workspace_checkout_email_v1(UUID,UUID,UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.workspace_checkout_email_outcome_v1(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_checkout_email_v1(UUID,UUID,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_workspace_checkout_email_v1(UUID,UUID,UUID,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.workspace_checkout_email_outcome_v1(UUID,UUID) TO service_role;
COMMIT;
