-- Two review fixes for the clients and relationships surfaces:
--   1. the plan's active-client cap, enforced inside
--      workspace_client_operation_v2;
--   2. workspace_host_relationship_book_v2, the relationship book paged.
--
-- 1. Enforce the plan's active-client cap inside workspace_client_operation_v2.
--
-- The cap was checked in the workspace-clients edge function before the RPC
-- ran, which left two gaps: it only covered creates (a paused or churned
-- client could be moved to active past the limit), and the read and the
-- insert were separate statements, so two concurrent creates could both see
-- the last free seat. The check now runs inside the RPC under a lock on the
-- workspace row, on create-as-active and on transitions to active. Paused and
-- churned creates stay exempt.
--
-- Everything else is the 20260722000200 definition unchanged: the same
-- validation, actor resolution, member list path and delegation to
-- workspace_client_operation. The limit matches workspace_client_allowance_v1
-- (included_active_clients, 3 when no billing profile exists yet).

BEGIN;

CREATE OR REPLACE FUNCTION public.workspace_client_operation_v2(
  p_action TEXT,
  p_workspace_id UUID,
  p_client_id UUID,
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
  actor_email TEXT;
  actor_role TEXT;
  normalized_action TEXT := lower(btrim(COALESCE(p_action, '')));
  result JSONB;
  requested_status TEXT;
  current_status TEXT;
  active_client_count INTEGER;
  active_client_limit INTEGER;
BEGIN
  IF normalized_action NOT IN ('list', 'create', 'update', 'delete')
    OR p_workspace_id IS NULL
    OR p_actor_user_id IS NULL
    OR p_token_issued_at IS NULL
    OR p_token_issued_at < 1
    OR p_token_issued_at > floor(EXTRACT(EPOCH FROM clock_timestamp()))::BIGINT + 300
  THEN
    RAISE EXCEPTION 'invalid workspace client operation'
      USING ERRCODE = '22023';
  END IF;

  -- Serialize client mutations per workspace before anything else touches the
  -- workspace row. Taking this first matters: the role check below holds
  -- FOR SHARE on the same row, and upgrading a share lock that a concurrent
  -- call also holds would deadlock. NO KEY UPDATE conflicts with FOR SHARE
  -- (so two creates cannot both count the same free seat) but not with the
  -- FOR KEY SHARE that foreign-key inserts elsewhere take.
  IF normalized_action IN ('create', 'update') THEN
    PERFORM 1
    FROM public.workspaces AS locked_workspace
    WHERE locked_workspace.id = p_workspace_id
    FOR NO KEY UPDATE;
  END IF;

  SELECT lower(btrim(auth_user.email))
  INTO actor_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = p_actor_user_id
    AND NULLIF(btrim(auth_user.email), '') IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workspace client actor identity is unavailable'
      USING ERRCODE = '42501';
  END IF;

  IF public.is_platform_admin_identity(p_actor_user_id, actor_email) THEN
    actor_role := public.workspace_staff_actor_role_v1(
      p_workspace_id,
      p_actor_user_id,
      p_token_issued_at,
      true
    );
  ELSE
    SELECT membership.role
    INTO actor_role
    FROM public.workspace_memberships AS membership
    JOIN public.workspaces AS workspace
      ON workspace.id = membership.workspace_id
    JOIN auth.users AS auth_user
      ON auth_user.id = membership.user_id
      AND lower(btrim(auth_user.email)) = membership.email_normalized
    WHERE membership.workspace_id = p_workspace_id
      AND membership.user_id = p_actor_user_id
      AND membership.email_normalized = actor_email
      AND membership.status = 'active'
      AND membership.role IN ('owner', 'admin', 'member')
      AND workspace.status = 'active'
      AND NOT workspace.is_default
      AND p_token_issued_at >= membership.workspace_access_not_before_epoch
      AND p_token_issued_at >= workspace.access_not_before_epoch
      AND (
        membership.provisioning_method <> 'admin_temporary_password'
        OR (
          NOT membership.password_change_required
          AND auth_user.raw_app_meta_data ->> 'workspace_id' = p_workspace_id::TEXT
          AND auth_user.raw_app_meta_data ->> 'workspace_membership_id' = membership.id::TEXT
          AND auth_user.raw_app_meta_data ->> 'workspace_provisioning_method'
            = 'admin_temporary_password'
          AND auth_user.raw_app_meta_data ->> 'workspace_password_change_required'
            = 'false'
        )
      )
    FOR SHARE OF membership, workspace;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'active workspace staff access is required'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF normalized_action <> 'list' AND actor_role = 'member' THEN
    RAISE EXCEPTION 'active workspace manager access is required'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_action = 'list' THEN
    IF p_client_id IS NOT NULL
      OR COALESCE(p_payload, '{}'::JSONB) <> '{}'::JSONB
    THEN
      RAISE EXCEPTION 'invalid list parameters' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(
      jsonb_agg(to_jsonb(safe_client) ORDER BY safe_client.name, safe_client.id),
      '[]'::JSONB
    )
    INTO result
    FROM (
      SELECT
        client.id,
        client.workspace_id,
        client.name,
        client.email,
        client.contact_person,
        client.linkedin_url,
        client.website,
        client.status,
        client.notes,
        client.created_at,
        client.updated_at
      FROM public.clients AS client
      WHERE client.workspace_id = p_workspace_id
    ) AS safe_client;

    RETURN result;
  END IF;

  -- Plan limit. Only a client becoming active takes a seat: creating one as
  -- active, or moving a paused or churned client to active. Paused and churned
  -- creates, edits that keep a client active, and moves away from active are
  -- never blocked, so a limit lowered after signup cannot freeze existing work.
  -- The count runs under the workspace lock taken above, so two concurrent
  -- calls cannot both claim the last seat.
  IF normalized_action IN ('create', 'update') THEN
    requested_status := NULLIF(btrim(p_payload ->> 'status'), '');

    IF requested_status = 'active' AND normalized_action = 'update' THEN
      SELECT client.status
      INTO current_status
      FROM public.clients AS client
      WHERE client.id = p_client_id
        AND client.workspace_id = p_workspace_id;
    END IF;

    IF requested_status = 'active'
      AND (normalized_action = 'create' OR current_status IS DISTINCT FROM 'active')
      AND (normalized_action = 'create' OR current_status IS NOT NULL)
    THEN
      SELECT COUNT(*)::INTEGER
      INTO active_client_count
      FROM public.clients AS client
      WHERE client.workspace_id = p_workspace_id
        AND client.status = 'active';

      SELECT COALESCE(profile.included_active_clients, 3)
      INTO active_client_limit
      FROM (SELECT 1) AS seed
      LEFT JOIN public.workspace_billing_profiles AS profile
        ON profile.workspace_id = p_workspace_id;

      IF active_client_count >= active_client_limit THEN
        RAISE EXCEPTION 'workspace client limit reached'
          USING ERRCODE = 'P0001',
            DETAIL = jsonb_build_object(
              'client_limit', active_client_limit,
              'active_clients', active_client_count
            )::TEXT;
      END IF;
    END IF;
  END IF;

  RETURN public.workspace_client_operation(
    normalized_action,
    p_workspace_id,
    p_client_id,
    p_payload,
    p_actor_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) IS
  'Workspace-epoch-aware client operation: every active staff role may list; owner/admin roles and the platform owner may mutate. A client becoming active is refused past the plan''s included_active_clients, checked under a workspace row lock.';

REVOKE ALL ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_client_operation_v2(
  TEXT, UUID, UUID, JSONB, UUID, BIGINT
) TO service_role;

-- The relationship book, one page at a time.
--
-- workspace_host_relationship_book_v1 returned at most p_limit rows and the
-- edge function asked for 500, so a book past 500 hosts silently lost the
-- rest, and the header counts were computed from whatever arrived. v2 is the
-- same query with an offset, a total order for stable paging, and whole-book
-- counts on every row. v1 is left in place for any caller still on it.
CREATE OR REPLACE FUNCTION public.workspace_host_relationship_book_v2(
  p_workspace_id UUID,
  p_limit INTEGER DEFAULT 200,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  podcast_id TEXT,
  podcast_name TEXT,
  host_name TEXT,
  contact_email TEXT,
  derived_state TEXT,
  manual_stage TEXT,
  summary TEXT,
  last_contacted_at TIMESTAMPTZ,
  touch_count INTEGER,
  booked_client_name TEXT,
  client_count INTEGER,
  note_count INTEGER,
  last_note_at TIMESTAMPTZ,
  curated BOOLEAN,
  total_count INTEGER,
  in_conversation_count INTEGER,
  booked_count INTEGER,
  engaged_count INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH known AS (
  -- The only source. "Add relationship" inserts here directly, and the Master
  -- Inbox capture inserts here before recording the thread, so both curated
  -- routes are covered and nothing else can enrol a show behind the operator.
  SELECT DISTINCT podcast_id
  FROM public.workspace_host_relationships
  WHERE workspace_id = p_workspace_id
),
rel AS (
  SELECT * FROM public.workspace_podcast_relationships_v1(
    p_workspace_id,
    ARRAY(SELECT entry.podcast_id FROM known entry WHERE entry.podcast_id IS NOT NULL)
  )
)
SELECT
  rel.podcast_id,
  COALESCE(book.podcast_name, catalog.podcast_name, target.podcast_name, booking_record.podcast_name) AS podcast_name,
  COALESCE(book.host_name, catalog.host_name, target.host_name, booking_record.host_name) AS host_name,
  COALESCE(book.contact_email, rel.contact_email) AS contact_email,
  rel.state AS derived_state,
  book.manual_stage,
  book.summary,
  rel.last_contacted_at,
  rel.touch_count,
  rel.booked_client_name,
  COALESCE((
    SELECT COUNT(DISTINCT linked.client_id)::INTEGER
    FROM (
      SELECT association.client_id
      FROM public.workspace_host_relationship_clients association
      WHERE association.workspace_id = p_workspace_id AND association.podcast_id = rel.podcast_id
      UNION
      SELECT campaign_target.client_id
      FROM public.workspace_client_campaign_targets campaign_target
      WHERE campaign_target.workspace_id = p_workspace_id
        AND campaign_target.podcast_id = rel.podcast_id
        AND (campaign_target.launched_at IS NOT NULL OR campaign_target.instantly_lead_id IS NOT NULL)
      UNION
      SELECT thread.client_id
      FROM public.workspace_inbox_thread_state thread
      WHERE thread.workspace_id = p_workspace_id AND thread.podcast_id = rel.podcast_id
      UNION
      SELECT booking.client_id
      FROM public.bookings booking
      JOIN public.clients booking_client ON booking_client.id = booking.client_id
      WHERE booking_client.workspace_id = p_workspace_id
        AND booking.podcast_id = rel.podcast_id
        AND booking.status <> 'cancelled'
    ) linked
  ), 0) AS client_count,
  COALESCE((
    SELECT COUNT(*)::INTEGER FROM public.workspace_host_relationship_events event
    WHERE event.workspace_id = p_workspace_id AND event.podcast_id = rel.podcast_id AND event.kind <> 'system'
  ), 0) AS note_count,
  (
    SELECT MAX(event.occurred_at) FROM public.workspace_host_relationship_events event
    WHERE event.workspace_id = p_workspace_id AND event.podcast_id = rel.podcast_id
  ) AS last_note_at,
  (book.podcast_id IS NOT NULL) AS curated,
  -- Whole-book figures, computed before the page is cut, so the header can
  -- state the real totals while only one page of rows travels.
  (COUNT(*) OVER ())::INTEGER AS total_count,
  (COUNT(*) FILTER (WHERE rel.state = 'in_conversation') OVER ())::INTEGER AS in_conversation_count,
  (COUNT(*) FILTER (WHERE rel.state = 'booked') OVER ())::INTEGER AS booked_count,
  (COUNT(*) FILTER (WHERE rel.state IN ('replied', 'declined')) OVER ())::INTEGER AS engaged_count
FROM rel
LEFT JOIN public.workspace_host_relationships book
  ON book.workspace_id = p_workspace_id AND book.podcast_id = rel.podcast_id
LEFT JOIN public.podcasts catalog ON catalog.podscan_id = rel.podcast_id
LEFT JOIN LATERAL (
  SELECT campaign_target.podcast_name, campaign_target.host_name
  FROM public.workspace_client_campaign_targets campaign_target
  WHERE campaign_target.workspace_id = p_workspace_id AND campaign_target.podcast_id = rel.podcast_id
  ORDER BY campaign_target.updated_at DESC
  LIMIT 1
) target ON TRUE
LEFT JOIN LATERAL (
  SELECT booking.podcast_name, booking.host_name
  FROM public.bookings booking
  JOIN public.clients booking_client ON booking_client.id = booking.client_id
  WHERE booking_client.workspace_id = p_workspace_id
    AND booking.podcast_id = rel.podcast_id
    AND booking.status <> 'cancelled'
  ORDER BY COALESCE(booking.publish_date, booking.recording_date, booking.scheduled_date) DESC NULLS LAST,
    booking.updated_at DESC
  LIMIT 1
) booking_record ON TRUE
ORDER BY
  CASE rel.state
    WHEN 'in_conversation' THEN 0
    WHEN 'booked' THEN 1
    WHEN 'replied' THEN 2
    WHEN 'declined' THEN 3
    WHEN 'suppressed' THEN 4
    ELSE 5
  END,
  rel.last_contacted_at DESC NULLS LAST,
  -- A total order, so consecutive pages never repeat or skip a row.
  rel.podcast_id
LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000))
OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

COMMENT ON FUNCTION public.workspace_host_relationship_book_v2(UUID, INTEGER, INTEGER) IS
  'The curated relationship book, paged: same rows and order as v1 plus an offset, a podcast_id tiebreak, and whole-book total and state counts on every row.';

REVOKE ALL ON FUNCTION public.workspace_host_relationship_book_v2(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_host_relationship_book_v2(UUID, INTEGER, INTEGER) TO service_role;

COMMIT;
