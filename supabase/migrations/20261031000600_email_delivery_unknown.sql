BEGIN;
ALTER TABLE public.workspace_onboarding_notifications DROP CONSTRAINT workspace_onboarding_notifications_status_check;
ALTER TABLE public.workspace_onboarding_notifications ADD CONSTRAINT workspace_onboarding_notifications_status_check
  CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped', 'cancelled', 'unknown'));

CREATE OR REPLACE FUNCTION public.record_workspace_onboarding_invitation_v1(
  p_instance_id UUID,
  p_status TEXT,
  p_provider_message_id TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_status TEXT := lower(btrim(COALESCE(p_status, '')));
BEGIN
  IF p_instance_id IS NULL
    OR normalized_status NOT IN ('sent', 'failed', 'skipped', 'unknown')
    OR char_length(COALESCE(p_provider_message_id, '')) > 255
    OR char_length(COALESCE(p_error, '')) > 500
  THEN
    RAISE EXCEPTION 'invalid onboarding invitation delivery result'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspace_onboarding_notifications
  SET
    status = normalized_status,
    attempt_count = LEAST(attempt_count + 1, 10),
    attempted_at = now(),
    sent_at = CASE WHEN normalized_status = 'sent' THEN now() ELSE NULL END,
    provider_message_id = NULLIF(btrim(COALESCE(p_provider_message_id, '')), ''),
    last_error = CASE
      WHEN normalized_status IN ('failed', 'unknown') THEN COALESCE(NULLIF(btrim(p_error), ''), CASE WHEN normalized_status = 'unknown' THEN 'Email delivery unknown' ELSE 'Email delivery failed' END)
      ELSE NULL
    END,
    next_attempt_at = CASE
      WHEN normalized_status = 'failed' THEN now() + interval '6 hours'
      ELSE next_attempt_at
    END
  WHERE status <> 'unknown' AND instance_id = p_instance_id
    AND kind = 'invitation'
    AND schedule_offset_days = 0;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_workspace_onboarding_change_request_v1(
  p_instance_id UUID,
  p_status TEXT,
  p_provider_message_id TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_status TEXT := lower(btrim(COALESCE(p_status, '')));
BEGIN
  IF p_instance_id IS NULL
    OR normalized_status NOT IN ('sent', 'failed', 'skipped', 'unknown')
    OR char_length(COALESCE(p_provider_message_id, '')) > 255
    OR char_length(COALESCE(p_error, '')) > 500
  THEN
    RAISE EXCEPTION 'invalid onboarding change-request delivery result'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspace_onboarding_notifications
  SET
    status = normalized_status,
    attempt_count = LEAST(attempt_count + 1, 10),
    attempted_at = now(),
    sent_at = CASE WHEN normalized_status = 'sent' THEN now() ELSE NULL END,
    provider_message_id = NULLIF(btrim(COALESCE(p_provider_message_id, '')), ''),
    last_error = CASE
      WHEN normalized_status IN ('failed', 'unknown') THEN COALESCE(NULLIF(btrim(p_error), ''), CASE WHEN normalized_status = 'unknown' THEN 'Email delivery unknown' ELSE 'Email delivery failed' END)
      ELSE NULL
    END,
    next_attempt_at = CASE
      WHEN normalized_status = 'failed' THEN now() + interval '6 hours'
      ELSE next_attempt_at
    END
  WHERE status <> 'unknown' AND instance_id = p_instance_id
    AND kind = 'changes_requested'
    AND schedule_offset_days = 0;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_workspace_onboarding_notification_v1(
  p_notification_id UUID,
  p_status TEXT,
  p_provider_message_id TEXT,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_status TEXT := lower(btrim(COALESCE(p_status, '')));
BEGIN
  IF p_notification_id IS NULL
    OR normalized_status NOT IN ('sent', 'failed', 'skipped', 'unknown', 'cancelled')
    OR char_length(COALESCE(p_provider_message_id, '')) > 255
    OR char_length(COALESCE(p_error, '')) > 500
  THEN
    RAISE EXCEPTION 'invalid onboarding notification result'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.workspace_onboarding_notifications
  SET
    status = normalized_status,
    sent_at = CASE WHEN normalized_status = 'sent' THEN now() ELSE NULL END,
    provider_message_id = NULLIF(btrim(COALESCE(p_provider_message_id, '')), ''),
    last_error = CASE
      WHEN normalized_status IN ('failed', 'unknown') THEN COALESCE(NULLIF(btrim(p_error), ''), CASE WHEN normalized_status = 'unknown' THEN 'Email delivery unknown' ELSE 'Email delivery failed' END)
      ELSE NULL
    END,
    next_attempt_at = CASE
      WHEN normalized_status = 'failed' THEN now() + interval '6 hours'
      ELSE next_attempt_at
    END
  WHERE id = p_notification_id
    AND status = 'processing';
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.record_workspace_onboarding_invitation_v1(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_workspace_onboarding_invitation_v1(uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.record_workspace_onboarding_change_request_v1(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_workspace_onboarding_change_request_v1(uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.complete_workspace_onboarding_notification_v1(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workspace_onboarding_notification_v1(uuid, text, text, text) TO service_role;
COMMIT;
