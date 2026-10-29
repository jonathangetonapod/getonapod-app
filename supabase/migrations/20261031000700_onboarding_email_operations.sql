BEGIN;
-- Service-only operation history. Frozen payloads contain private onboarding links.
CREATE TABLE public.workspace_onboarding_email_operations (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  instance_id uuid NOT NULL REFERENCES public.workspace_onboarding_instances(id) ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('start','resend_invitation','request_changes','rotate')),
  request jsonb NOT NULL CHECK (jsonb_typeof(request) = 'object'),
  instance_snapshot jsonb NOT NULL,
  email_payload jsonb,
  state text NOT NULL DEFAULT 'prepared' CHECK (state IN ('prepared','sending','sent','failed','skipped','unknown')),
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE UNIQUE INDEX workspace_onboarding_email_one_unresolved
  ON public.workspace_onboarding_email_operations(instance_id) WHERE state IN ('prepared','sending','unknown');
ALTER TABLE public.workspace_onboarding_email_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_onboarding_email_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_onboarding_email_operations FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.workspace_onboarding_email_operations TO service_role;
ALTER TABLE public.workspace_onboarding_notifications ADD COLUMN email_operation_id uuid
  REFERENCES public.workspace_onboarding_email_operations(id) ON DELETE SET NULL;

-- Lifecycle cancellation stops unsent work, never erases an in-flight receipt.
-- Applies to existing client submit/approve/archive RPCs as well as rotation.
CREATE FUNCTION public.preserve_workspace_onboarding_delivery_hold_v1()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF OLD.status IN ('processing','unknown') AND NEW.status IN ('pending','cancelled') THEN
    NEW.status := OLD.status;
    NEW.email_operation_id := OLD.email_operation_id;
    NEW.attempt_count := OLD.attempt_count;
    NEW.attempted_at := OLD.attempted_at;
    NEW.sent_at := OLD.sent_at;
    NEW.provider_message_id := OLD.provider_message_id;
    NEW.last_error := OLD.last_error;
    NEW.next_attempt_at := OLD.next_attempt_at;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.preserve_workspace_onboarding_delivery_hold_v1() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER workspace_onboarding_delivery_hold
  BEFORE UPDATE ON public.workspace_onboarding_notifications
  FOR EACH ROW EXECUTE FUNCTION public.preserve_workspace_onboarding_delivery_hold_v1();

CREATE FUNCTION public.begin_workspace_onboarding_email_operation_v1(
  p_operation_id uuid, p_workspace_id uuid, p_instance_id uuid, p_action text,
  p_request jsonb, p_mutation jsonb, p_actor_user_id uuid, p_token_issued_at bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE existing public.workspace_onboarding_email_operations%ROWTYPE; snapshot jsonb; role_name text; email_kind text;
BEGIN
  IF p_operation_id IS NULL OR p_action NOT IN ('start','resend_invitation','request_changes','rotate')
    OR p_request IS NULL OR jsonb_typeof(p_request) <> 'object' THEN
    RAISE EXCEPTION 'INVALID_EMAIL_OPERATION' USING ERRCODE='22023';
  END IF;
  role_name := public.workspace_onboarding_actor_role_v1(p_workspace_id,p_actor_user_id,p_token_issued_at);
  IF role_name NOT IN ('owner','admin','platform_admin') THEN RAISE EXCEPTION 'manager access required' USING ERRCODE='42501'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('goap:workspace-onboarding-instance:' || p_instance_id::text,0));
  PERFORM 1 FROM public.workspace_onboarding_instances WHERE id=p_instance_id AND workspace_id=p_workspace_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'onboarding not found' USING ERRCODE='P0002'; END IF;
  SELECT * INTO existing FROM public.workspace_onboarding_email_operations WHERE id=p_operation_id;
  IF FOUND THEN
    IF existing.instance_id<>p_instance_id OR existing.workspace_id<>p_workspace_id OR existing.action<>p_action OR existing.request<>p_request THEN
      RAISE EXCEPTION 'EMAIL_OPERATION_CONFLICT' USING ERRCODE='22023';
    END IF;
    RETURN to_jsonb(existing);
  END IF;
  IF EXISTS(SELECT 1 FROM public.workspace_onboarding_email_operations WHERE instance_id=p_instance_id AND state IN ('prepared','sending','unknown'))
    OR EXISTS(SELECT 1 FROM public.workspace_onboarding_notifications WHERE instance_id=p_instance_id AND status IN ('unknown','processing'))
    OR (p_action<>'start' AND EXISTS(SELECT 1 FROM public.workspace_onboarding_notifications WHERE instance_id=p_instance_id AND kind='invitation' AND status='pending' AND email_operation_id IS NULL)) THEN
    RAISE EXCEPTION 'DELIVERY_UNCONFIRMED' USING ERRCODE='55000';
  END IF;
  IF p_action='resend_invitation' THEN
    IF EXISTS(SELECT 1 FROM public.workspace_onboarding_notifications WHERE instance_id=p_instance_id AND sent_at>now()-interval '10 minutes') THEN
      RAISE EXCEPTION 'ONBOARDING_RESEND_COOLDOWN' USING ERRCODE='55000';
    END IF;
    IF NOT EXISTS(SELECT 1 FROM public.workspace_onboarding_instances WHERE id=p_instance_id AND status IN ('invited','in_progress','changes_requested') AND archived_at IS NULL AND capability_expires_at>now()) THEN
      RAISE EXCEPTION 'ONBOARDING_LINK_UNAVAILABLE' USING ERRCODE='55000';
    END IF;
  END IF;
  IF p_action IN ('rotate','request_changes') THEN
    snapshot := public.workspace_onboarding_instance_operation_v1(p_action,p_workspace_id,p_instance_id,p_mutation,p_actor_user_id,p_token_issued_at);
  ELSE
    snapshot := public.workspace_onboarding_staff_detail_v1(p_workspace_id,p_instance_id,p_actor_user_id,p_token_issued_at);
  END IF;
  INSERT INTO public.workspace_onboarding_email_operations(id,workspace_id,instance_id,action,request,instance_snapshot)
    VALUES(p_operation_id,p_workspace_id,p_instance_id,p_action,p_request,snapshot) RETURNING * INTO existing;
  email_kind := CASE WHEN snapshot->>'status'='changes_requested' THEN 'changes_requested' ELSE 'invitation' END;
  UPDATE public.workspace_onboarding_notifications SET email_operation_id=p_operation_id,status='processing',attempted_at=now(),last_error=NULL
    WHERE instance_id=p_instance_id AND kind=email_kind AND schedule_offset_days=0;
  IF NOT FOUND THEN RAISE EXCEPTION 'EMAIL_NOTIFICATION_MISSING'; END IF;
  RETURN to_jsonb(existing);
END $$;

CREATE FUNCTION public.claim_workspace_onboarding_email_send_v1(p_operation_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op public.workspace_onboarding_email_operations%ROWTYPE;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN RAISE EXCEPTION 'INVALID_EMAIL_PAYLOAD'; END IF;
  UPDATE public.workspace_onboarding_email_operations SET state='sending',email_payload=p_payload
    WHERE id=p_operation_id AND state='prepared' RETURNING * INTO op;
  IF FOUND THEN RETURN jsonb_build_object('claimed',true,'payload',op.email_payload); END IF;
  SELECT * INTO op FROM public.workspace_onboarding_email_operations WHERE id=p_operation_id;
  RETURN jsonb_build_object('claimed',false,'result',op.result);
END $$;

CREATE FUNCTION public.complete_workspace_onboarding_email_operation_v1(p_operation_id uuid,p_result jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE op public.workspace_onboarding_email_operations%ROWTYPE; outcome text := p_result->>'status';
BEGIN
  IF p_result IS NULL OR outcome IS NULL OR outcome NOT IN ('sent','failed','skipped','unknown') THEN RAISE EXCEPTION 'INVALID_EMAIL_RESULT'; END IF;
  UPDATE public.workspace_onboarding_email_operations SET state=outcome,result=p_result,completed_at=now()
    WHERE id=p_operation_id AND state='sending' RETURNING * INTO op;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.workspace_onboarding_notifications SET status=outcome,
    sent_at=CASE WHEN outcome='sent' THEN now() ELSE NULL END,
    provider_message_id=left(p_result->>'providerMessageId',255),
    last_error=CASE WHEN outcome IN ('unknown','failed') THEN left(COALESCE(p_result->>'error','Email delivery ' || outcome),500) ELSE NULL END,
    attempt_count=LEAST(attempt_count+1,10)
    WHERE instance_id=op.instance_id AND email_operation_id=p_operation_id;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.begin_workspace_onboarding_email_operation_v1(uuid,uuid,uuid,text,jsonb,jsonb,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.begin_workspace_onboarding_email_operation_v1(uuid,uuid,uuid,text,jsonb,jsonb,uuid,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.claim_workspace_onboarding_email_send_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_onboarding_email_send_v1(uuid,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.complete_workspace_onboarding_email_operation_v1(uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_workspace_onboarding_email_operation_v1(uuid,jsonb) TO service_role;

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
  WHERE email_operation_id IS NULL AND status <> 'unknown' AND instance_id = p_instance_id
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
  WHERE email_operation_id IS NULL AND status <> 'unknown' AND instance_id = p_instance_id
    AND kind = 'changes_requested'
    AND schedule_offset_days = 0;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_workspace_onboarding_reminders_v1(p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE candidate record; result jsonb := '[]'::jsonb; claimed_count integer := 0;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'invalid reminder claim limit' USING ERRCODE='22023'; END IF;
  FOR candidate IN
    SELECT notification.*, instance.capability_generation, instance.capability_expires_at,
      instance.recipient_name,instance.recipient_email,workspace.name AS workspace_name
    FROM public.workspace_onboarding_notifications notification
    JOIN public.workspace_onboarding_instances instance ON instance.id=notification.instance_id AND instance.workspace_id=notification.workspace_id
    JOIN public.workspaces workspace ON workspace.id=instance.workspace_id
    WHERE notification.kind='reminder' AND notification.status='pending' AND notification.next_attempt_at<=now()
      AND workspace.status='active' AND NOT workspace.is_default
      AND instance.status IN ('invited','in_progress','changes_requested') AND instance.capability_expires_at>now() AND instance.archived_at IS NULL
    ORDER BY notification.next_attempt_at,notification.id
    FOR UPDATE OF instance,notification SKIP LOCKED
  LOOP
    -- Recheck under the instance lock in a fresh statement snapshot. One reminder
    -- per instance, including separate callers and manual-operation reservations.
    IF EXISTS(SELECT 1 FROM public.workspace_onboarding_email_operations WHERE instance_id=candidate.instance_id AND state IN ('prepared','sending','unknown'))
      OR EXISTS(SELECT 1 FROM public.workspace_onboarding_notifications WHERE instance_id=candidate.instance_id AND id<>candidate.id AND status IN ('processing','unknown')) THEN CONTINUE; END IF;
    UPDATE public.workspace_onboarding_notifications SET status='processing',attempt_count=LEAST(attempt_count+1,10),attempted_at=now()
      WHERE id=candidate.id AND status='pending';
    IF NOT FOUND THEN CONTINUE; END IF;
    result := result || jsonb_build_array(jsonb_build_object(
      'notification_id',candidate.id,'operation_id',candidate.id,'idempotency_key','onboarding:' || candidate.id::text,
      'instance_id',candidate.instance_id,'workspace_id',candidate.workspace_id,'workspace_name',candidate.workspace_name,
      'recipient_name',candidate.recipient_name,'recipient_email',candidate.recipient_email,
      'capability_generation',candidate.capability_generation,'capability_expires_at',candidate.capability_expires_at,
      'schedule_offset_days',candidate.schedule_offset_days));
    claimed_count := claimed_count+1;
    EXIT WHEN claimed_count>=p_limit;
  END LOOP;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.record_workspace_onboarding_invitation_v1(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_workspace_onboarding_invitation_v1(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.record_workspace_onboarding_change_request_v1(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_workspace_onboarding_change_request_v1(uuid,text,text,text) TO service_role;
REVOKE ALL ON FUNCTION public.claim_workspace_onboarding_reminders_v1(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_workspace_onboarding_reminders_v1(integer) TO service_role;
-- Fence direct/no-email mutations as well as the new email entry point.
CREATE OR REPLACE FUNCTION public.workspace_onboarding_instance_operation_v1(
  p_action TEXT,
  p_workspace_id UUID,
  p_instance_id UUID,
  p_payload JSONB,
  p_actor_user_id UUID,
  p_token_issued_at BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  normalized_action TEXT := lower(btrim(COALESCE(p_action, '')));
  actor_role TEXT;
  target_instance public.workspace_onboarding_instances%ROWTYPE;
  target_version public.workspace_onboarding_template_versions%ROWTYPE;
  comment_value JSONB;
  comment_question_id TEXT;
  comment_body TEXT;
  normalized_profile JSONB;
  next_generation INTEGER;
  next_hash TEXT;
  next_expiry TIMESTAMPTZ;
  previous_status TEXT;
  assignment_ids UUID[] := ARRAY[]::UUID[];
  valid_assignment_count INTEGER;
  purged_paths JSONB;
  audit_metadata JSONB := '{}'::JSONB;
  result JSONB;
BEGIN
  IF normalized_action NOT IN (
    'request_changes',
    'update_profile',
    'rotate',
    'extend',
    'revoke',
    'archive',
    'update_assignments',
    'purge_paths',
    'purge'
  )
    OR p_workspace_id IS NULL
    OR p_instance_id IS NULL
    OR p_payload IS NULL
    OR jsonb_typeof(p_payload) <> 'object'
  THEN
    RAISE EXCEPTION 'invalid workspace onboarding instance operation'
      USING ERRCODE = '22023';
  END IF;

  actor_role := public.workspace_onboarding_actor_role_v1(
    p_workspace_id,
    p_actor_user_id,
    p_token_issued_at
  );
  IF actor_role NOT IN ('owner', 'admin', 'platform_admin') THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('goap:workspace-onboarding-instance:' || p_instance_id::TEXT, 0)
  );

  SELECT instance.*
  INTO target_instance
  FROM public.workspace_onboarding_instances AS instance
  WHERE instance.id = p_instance_id
    AND instance.workspace_id = p_workspace_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace onboarding instance not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF normalized_action IN ('rotate','request_changes') AND (
    EXISTS(SELECT 1 FROM public.workspace_onboarding_email_operations WHERE instance_id=p_instance_id AND state IN ('prepared','sending','unknown'))
    OR EXISTS(SELECT 1 FROM public.workspace_onboarding_notifications WHERE instance_id=p_instance_id AND status IN ('processing','unknown'))
    OR EXISTS(SELECT 1 FROM public.workspace_onboarding_notifications WHERE instance_id=p_instance_id AND kind='invitation' AND status='pending' AND email_operation_id IS NULL)
  ) THEN RAISE EXCEPTION 'DELIVERY_UNCONFIRMED' USING ERRCODE='55000'; END IF;

  SELECT version.*
  INTO target_version
  FROM public.workspace_onboarding_template_versions AS version
  WHERE version.id = target_instance.template_version_id
    AND version.workspace_id = p_workspace_id;

  IF normalized_action = 'request_changes' THEN
    IF target_instance.status <> 'submitted' OR target_instance.current_revision < 1 THEN
      RAISE EXCEPTION 'only a submitted onboarding can receive change requests'
        USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_payload -> 'comments') <> 'array'
      OR jsonb_array_length(p_payload -> 'comments') NOT BETWEEN 1 AND 100
    THEN
      RAISE EXCEPTION 'at least one review comment is required'
        USING ERRCODE = '22023';
    END IF;

    FOR comment_value IN
      SELECT value FROM jsonb_array_elements(p_payload -> 'comments')
    LOOP
      comment_question_id := btrim(COALESCE(comment_value ->> 'question_id', ''));
      comment_body := btrim(COALESCE(comment_value ->> 'body', ''));
      IF comment_question_id !~ '^[a-z][a-z0-9_-]{0,63}$'
        OR char_length(comment_body) NOT BETWEEN 1 AND 2000
        OR NOT EXISTS (
          SELECT 1
          FROM jsonb_array_elements(target_version.definition -> 'sections') AS section(value)
          CROSS JOIN LATERAL jsonb_array_elements(section.value -> 'questions') AS question(value)
          WHERE question.value ->> 'id' = comment_question_id
        )
      THEN
        RAISE EXCEPTION 'invalid onboarding review comment'
          USING ERRCODE = '22023';
      END IF;

      INSERT INTO public.workspace_onboarding_review_comments (
        workspace_id,
        instance_id,
        revision,
        question_id,
        body,
        created_by
      )
      VALUES (
        p_workspace_id,
        p_instance_id,
        target_instance.current_revision,
        comment_question_id,
        comment_body,
        p_actor_user_id
      );
    END LOOP;

    UPDATE public.workspace_onboarding_instances
    SET
      status = 'changes_requested',
      changes_requested_at = now(),
      capability_expires_at = GREATEST(capability_expires_at, now() + interval '14 days')
    WHERE id = p_instance_id
    RETURNING * INTO target_instance;

    INSERT INTO public.workspace_onboarding_notifications (
      workspace_id,
      instance_id,
      kind,
      schedule_offset_days,
      due_at,
      next_attempt_at
    )
    VALUES (
      p_workspace_id,
      p_instance_id,
      'changes_requested',
      0,
      now(),
      now()
    )
    ON CONFLICT (instance_id, kind, schedule_offset_days) DO UPDATE
    SET
      status = 'pending',
      due_at = now(),
      next_attempt_at = now(),
      attempt_count = 0,
      attempted_at = NULL,
      sent_at = NULL,
      provider_message_id = NULL,
      last_error = NULL;

    audit_metadata := jsonb_build_object(
      'revision', target_instance.current_revision,
      'comment_count', jsonb_array_length(p_payload -> 'comments'),
      'expires_at', target_instance.capability_expires_at
    );

  ELSIF normalized_action = 'update_profile' THEN
    IF target_instance.status NOT IN ('submitted', 'changes_requested')
      OR target_instance.current_revision < 1
    THEN
      RAISE EXCEPTION 'a submitted onboarding is required to edit the pitch profile'
        USING ERRCODE = '22023';
    END IF;
    normalized_profile := p_payload -> 'profile';
    IF jsonb_typeof(normalized_profile) <> 'object'
      OR octet_length(normalized_profile::TEXT) > 262144
    THEN
      RAISE EXCEPTION 'invalid onboarding pitch profile'
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.workspace_onboarding_profile_drafts (
      instance_id,
      workspace_id,
      revision,
      status,
      content,
      generation_error,
      updated_by
    )
    VALUES (
      p_instance_id,
      p_workspace_id,
      target_instance.current_revision,
      'edited',
      normalized_profile,
      NULL,
      p_actor_user_id
    )
    ON CONFLICT (instance_id) DO UPDATE
    SET
      revision = EXCLUDED.revision,
      status = 'edited',
      content = EXCLUDED.content,
      generation_error = NULL,
      updated_by = EXCLUDED.updated_by;
    audit_metadata := jsonb_build_object('revision', target_instance.current_revision);

  ELSIF normalized_action = 'rotate' THEN
    IF target_instance.status IN ('approved', 'revoked', 'submitted') THEN
      RAISE EXCEPTION 'this onboarding capability cannot be rotated'
        USING ERRCODE = '22023';
    END IF;
    next_generation := (p_payload ->> 'capability_generation')::INTEGER;
    next_hash := lower(btrim(COALESCE(p_payload ->> 'capability_hash', '')));
    next_expiry := (p_payload ->> 'capability_expires_at')::TIMESTAMPTZ;
    IF next_generation <> target_instance.capability_generation + 1
      OR next_hash !~ '^[0-9a-f]{64}$'
      OR next_expiry < now() + interval '1 hour'
      OR next_expiry > now() + interval '90 days'
    THEN
      RAISE EXCEPTION 'invalid rotated onboarding capability'
        USING ERRCODE = '22023';
    END IF;

    UPDATE public.workspace_onboarding_instances
    SET
      capability_generation = next_generation,
      capability_hash = next_hash,
      capability_expires_at = next_expiry,
      invited_at = now(),
      revoked_at = NULL,
      revoked_by = NULL
    WHERE id = p_instance_id
    RETURNING * INTO target_instance;

    -- Rotating a capability does not erase or requeue earlier email attempts.
    -- The email-operation reservation assigns a new send explicitly when asked.
    audit_metadata := jsonb_build_object(
      'generation', next_generation,
      'expires_at', next_expiry
    );

  ELSIF normalized_action = 'extend' THEN
    IF target_instance.status IN ('submitted', 'approved', 'revoked') THEN
      RAISE EXCEPTION 'this onboarding capability cannot be extended'
        USING ERRCODE = '22023';
    END IF;
    next_expiry := (p_payload ->> 'capability_expires_at')::TIMESTAMPTZ;
    IF next_expiry <= target_instance.capability_expires_at
      OR next_expiry < now() + interval '1 hour'
      OR next_expiry > now() + interval '90 days'
    THEN
      RAISE EXCEPTION 'invalid onboarding capability extension'
        USING ERRCODE = '22023';
    END IF;
    UPDATE public.workspace_onboarding_instances
    SET capability_expires_at = next_expiry
    WHERE id = p_instance_id
    RETURNING * INTO target_instance;
    UPDATE public.workspace_onboarding_notifications
    SET
      status = 'pending',
      next_attempt_at = due_at,
      attempt_count = 0,
      attempted_at = NULL,
      sent_at = NULL,
      provider_message_id = NULL,
      last_error = NULL
    WHERE instance_id = p_instance_id
      AND kind = 'reminder'
      AND status = 'cancelled'
      AND due_at > now()
      AND due_at < next_expiry;
    audit_metadata := jsonb_build_object('expires_at', next_expiry);

  ELSIF normalized_action = 'revoke' THEN
    IF target_instance.status = 'approved' THEN
      RAISE EXCEPTION 'approved onboarding cannot be revoked'
        USING ERRCODE = '22023';
    END IF;
    previous_status := target_instance.status;
    IF target_instance.status <> 'revoked' THEN
      UPDATE public.workspace_onboarding_instances
      SET
        status = 'revoked',
        revoked_at = now(),
        revoked_by = p_actor_user_id
      WHERE id = p_instance_id
      RETURNING * INTO target_instance;
      UPDATE public.workspace_onboarding_notifications
      SET status = 'cancelled'
      WHERE instance_id = p_instance_id
        AND status IN ('pending', 'processing', 'failed');
    END IF;
    audit_metadata := jsonb_build_object('previous_status', previous_status);

  ELSIF normalized_action = 'archive' THEN
    IF target_instance.archived_at IS NULL THEN
      UPDATE public.workspace_onboarding_instances
      SET
        archived_at = now(),
        status = CASE
          WHEN status IN ('invited', 'in_progress', 'changes_requested') THEN 'revoked'
          ELSE status
        END,
        revoked_at = CASE
          WHEN status IN ('invited', 'in_progress', 'changes_requested') THEN now()
          ELSE revoked_at
        END,
        revoked_by = CASE
          WHEN status IN ('invited', 'in_progress', 'changes_requested') THEN p_actor_user_id
          ELSE revoked_by
        END
      WHERE id = p_instance_id
      RETURNING * INTO target_instance;
      UPDATE public.workspace_onboarding_notifications
      SET status = 'cancelled'
      WHERE instance_id = p_instance_id
        AND status IN ('pending', 'processing', 'failed');
    END IF;
    audit_metadata := jsonb_build_object('status', target_instance.status);

  ELSIF normalized_action = 'update_assignments' THEN
    IF jsonb_typeof(p_payload -> 'assigned_membership_ids') <> 'array' THEN
      RAISE EXCEPTION 'assigned membership ids must be an array'
        USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(array_agg(DISTINCT assignment.value::UUID ORDER BY assignment.value::UUID), ARRAY[]::UUID[])
    INTO assignment_ids
    FROM jsonb_array_elements_text(p_payload -> 'assigned_membership_ids') AS assignment(value);
    IF cardinality(assignment_ids) > 100 THEN
      RAISE EXCEPTION 'too many onboarding assignments' USING ERRCODE = '22023';
    END IF;
    SELECT count(*)
    INTO valid_assignment_count
    FROM public.workspace_memberships AS membership
    WHERE membership.workspace_id = p_workspace_id
      AND membership.id = ANY(assignment_ids)
      AND membership.status = 'active'
      AND membership.role = 'member';
    IF valid_assignment_count <> cardinality(assignment_ids) THEN
      RAISE EXCEPTION 'invalid onboarding assignment'
        USING ERRCODE = '22023';
    END IF;
    DELETE FROM public.workspace_onboarding_assignments
    WHERE instance_id = p_instance_id;
    INSERT INTO public.workspace_onboarding_assignments (
      workspace_id,
      instance_id,
      membership_id,
      assigned_by
    )
    SELECT p_workspace_id, p_instance_id, assignment.membership_id, p_actor_user_id
    FROM unnest(assignment_ids) AS assignment(membership_id);
    audit_metadata := jsonb_build_object('assigned_member_count', cardinality(assignment_ids));

  ELSIF normalized_action IN ('purge_paths', 'purge') THEN
    IF target_instance.archived_at IS NULL
      OR p_payload ->> 'confirmation' <> 'PURGE'
    THEN
      RAISE EXCEPTION 'archived onboarding and explicit purge confirmation are required'
        USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(jsonb_agg(asset.storage_path ORDER BY asset.storage_path), '[]'::JSONB)
    INTO purged_paths
    FROM public.workspace_onboarding_assets AS asset
    WHERE asset.instance_id = p_instance_id;

    IF normalized_action = 'purge_paths' THEN
      RETURN jsonb_build_object(
        'instance_id', p_instance_id,
        'storage_paths', purged_paths
      );
    END IF;

    PERFORM set_config('app.onboarding_pii_purge', 'on', true);
    DELETE FROM public.workspace_onboarding_instances
    WHERE id = p_instance_id
      AND workspace_id = p_workspace_id;

    INSERT INTO public.workspace_audit_log (
      workspace_id,
      actor_user_id,
      action,
      entity_type,
      entity_id,
      metadata
    )
    VALUES (
      p_workspace_id,
      p_actor_user_id,
      'workspace.onboarding.purge',
      'workspace_onboarding_instance',
      p_instance_id,
      jsonb_build_object(
        'client_id', target_instance.client_id,
        'asset_count', jsonb_array_length(purged_paths),
        'client_record_retained', true
      )
    );
    RETURN jsonb_build_object(
      'purged', true,
      'instance_id', p_instance_id,
      'storage_paths', purged_paths
    );
  END IF;

  INSERT INTO public.workspace_audit_log (
    workspace_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  VALUES (
    p_workspace_id,
    p_actor_user_id,
    'workspace.onboarding.' || normalized_action,
    'workspace_onboarding_instance',
    p_instance_id,
    audit_metadata
  );

  result := public.workspace_onboarding_instance_detail_json_v1(p_instance_id);
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.workspace_onboarding_instance_operation_v1(text,uuid,uuid,jsonb,uuid,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_onboarding_instance_operation_v1(text,uuid,uuid,jsonb,uuid,bigint) TO service_role;
COMMIT;
