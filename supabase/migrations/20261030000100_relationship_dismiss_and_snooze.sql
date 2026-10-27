-- "Not a host" and snooze for the relationship book.
--
--   1. dismissed_at / dismissed_by: an operator says a row is not a podcast
--      host (a homeowner answering a client's cold email, say). The row is
--      kept rather than deleted, so its address stays known and nothing adds
--      it back behind them; the book simply stops listing it. Adding the same
--      host again by hand restores it.
--   2. snoozed_until: an operator parks a row until a date. A snoozed row
--      stays listed but drops out of Needs attention and Follow-up overdue
--      until the date passes. Purely a display decision: it changes nothing
--      about outreach state or pitch gating.
--   3. workspace_host_relationship_book_v4: v3 without dismissed rows, plus
--      snoozed_until. Nothing else changes; v3 is left in place for any
--      function build still calling it.

BEGIN;

ALTER TABLE public.workspace_host_relationships
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS snoozed_until TIMESTAMPTZ;

COMMENT ON COLUMN public.workspace_host_relationships.dismissed_at IS
  'Set when an operator marked this record as not a podcast host. Hidden from the book; kept so it is never re-added.';
COMMENT ON COLUMN public.workspace_host_relationships.snoozed_until IS
  'Operator snooze: the row leaves Needs attention and Follow-up overdue until this time.';

CREATE OR REPLACE FUNCTION public.workspace_host_relationship_book_v4(
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
  client_names TEXT[],
  note_count INTEGER,
  last_note_at TIMESTAMPTZ,
  last_message_body TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_direction TEXT,
  last_thread_key TEXT,
  last_thread_client_id UUID,
  curated BOOLEAN,
  snoozed_until TIMESTAMPTZ,
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
  -- A row someone marked "Not a host" stays in the table, so the address is
  -- still known and the record is never added back behind them, but it is
  -- no longer part of the book: not listed, not counted.
  SELECT DISTINCT podcast_id
  FROM public.workspace_host_relationships
  WHERE workspace_id = p_workspace_id
    AND dismissed_at IS NULL
),
rel AS (
  SELECT * FROM public.workspace_podcast_relationships_v1(
    p_workspace_id,
    ARRAY(SELECT entry.podcast_id FROM known entry WHERE entry.podcast_id IS NOT NULL)
  )
),
staged AS (
  SELECT
    rel.*,
    book.podcast_id AS book_podcast_id,
    book.podcast_name AS book_podcast_name,
    book.host_name AS book_host_name,
    book.contact_email AS book_contact_email,
    book.manual_stage,
    book.summary,
    book.snoozed_until,
    -- A host who opted out is never shown as anything else. An explicit
    -- stage otherwise wins, except Nurturing, which only describes a host
    -- nobody has pitched yet: once outreach starts, the activity takes over.
    CASE
      WHEN rel.state = 'suppressed' OR book.manual_stage = 'do_not_contact' THEN 'do_not_contact'
      WHEN book.manual_stage IN ('new', 'pitched', 'in_conversation', 'placed', 'not_a_fit') THEN book.manual_stage
      WHEN book.manual_stage IN ('nurturing', 'warm') AND rel.state = 'none' THEN 'nurturing'
      WHEN rel.state IN ('in_conversation', 'replied') THEN 'in_conversation'
      WHEN rel.state = 'booked' THEN 'placed'
      WHEN rel.state = 'declined' THEN 'not_a_fit'
      WHEN rel.state = 'pitched' THEN 'pitched'
      ELSE 'new'
    END AS stage
  FROM rel
  LEFT JOIN public.workspace_host_relationships book
    ON book.workspace_id = p_workspace_id AND book.podcast_id = rel.podcast_id
)
SELECT
  staged.podcast_id,
  COALESCE(staged.book_podcast_name, catalog.podcast_name, target.podcast_name, booking_record.podcast_name) AS podcast_name,
  COALESCE(staged.book_host_name, catalog.host_name, target.host_name, booking_record.host_name) AS host_name,
  COALESCE(staged.book_contact_email, staged.contact_email) AS contact_email,
  staged.state AS derived_state,
  staged.manual_stage,
  staged.summary,
  staged.last_contacted_at,
  staged.touch_count,
  staged.booked_client_name,
  COALESCE(cardinality(linked.client_ids), 0)::INTEGER AS client_count,
  COALESCE(linked.client_names, ARRAY[]::TEXT[]) AS client_names,
  COALESCE((
    SELECT COUNT(*)::INTEGER FROM public.workspace_host_relationship_events event
    WHERE event.workspace_id = p_workspace_id AND event.podcast_id = staged.podcast_id AND event.kind <> 'system'
  ), 0) AS note_count,
  (
    SELECT MAX(event.occurred_at) FROM public.workspace_host_relationship_events event
    WHERE event.workspace_id = p_workspace_id AND event.podcast_id = staged.podcast_id
  ) AS last_note_at,
  saved.latest_message_body AS last_message_body,
  saved.latest_message_at AS last_message_at,
  -- The host is the lead on the thread. A message from that address is
  -- theirs; one from any other address is ours.
  CASE
    WHEN saved.from_email IS NULL THEN NULL
    WHEN lower(btrim(saved.from_email)) = lower(btrim(COALESCE(
      saved.lead_email, staged.book_contact_email, staged.contact_email, ''
    ))) THEN 'inbound'
    ELSE 'outbound'
  END AS last_message_direction,
  COALESCE(saved.thread_key, inbox.thread_key) AS last_thread_key,
  CASE WHEN saved.thread_key IS NOT NULL THEN saved.client_id ELSE inbox.client_id END AS last_thread_client_id,
  (staged.book_podcast_id IS NOT NULL) AS curated,
  staged.snoozed_until,
  (COUNT(*) OVER ())::INTEGER AS total_count,
  (COUNT(*) FILTER (WHERE staged.stage = 'in_conversation') OVER ())::INTEGER AS in_conversation_count,
  (COUNT(*) FILTER (WHERE staged.stage = 'placed') OVER ())::INTEGER AS booked_count,
  (COUNT(*) FILTER (WHERE staged.state IN ('replied', 'declined')) OVER ())::INTEGER AS engaged_count
FROM staged
LEFT JOIN public.podcasts catalog ON catalog.podscan_id = staged.podcast_id
LEFT JOIN LATERAL (
  SELECT
    array_agg(DISTINCT ids.client_id) AS client_ids,
    array_agg(DISTINCT named.name ORDER BY named.name) FILTER (WHERE named.name IS NOT NULL) AS client_names
  FROM (
    SELECT association.client_id
    FROM public.workspace_host_relationship_clients association
    WHERE association.workspace_id = p_workspace_id AND association.podcast_id = staged.podcast_id
    UNION
    SELECT campaign_target.client_id
    FROM public.workspace_client_campaign_targets campaign_target
    WHERE campaign_target.workspace_id = p_workspace_id
      AND campaign_target.podcast_id = staged.podcast_id
      AND (campaign_target.launched_at IS NOT NULL OR campaign_target.instantly_lead_id IS NOT NULL)
    UNION
    SELECT thread.client_id
    FROM public.workspace_inbox_thread_state thread
    WHERE thread.workspace_id = p_workspace_id AND thread.podcast_id = staged.podcast_id
    UNION
    SELECT booking.client_id
    FROM public.bookings booking
    JOIN public.clients booking_client ON booking_client.id = booking.client_id
    WHERE booking_client.workspace_id = p_workspace_id
      AND booking.podcast_id = staged.podcast_id
      AND booking.status <> 'cancelled'
  ) ids
  LEFT JOIN public.clients named
    ON named.workspace_id = p_workspace_id AND named.id = ids.client_id
) linked ON TRUE
LEFT JOIN LATERAL (
  SELECT
    saved_thread.thread_key, saved_thread.client_id, saved_thread.latest_message_body,
    saved_thread.latest_message_at, saved_thread.from_email, saved_thread.lead_email
  FROM public.workspace_host_relationship_threads saved_thread
  WHERE saved_thread.workspace_id = p_workspace_id AND saved_thread.podcast_id = staged.podcast_id
  ORDER BY saved_thread.latest_message_at DESC NULLS LAST, saved_thread.updated_at DESC
  LIMIT 1
) saved ON TRUE
LEFT JOIN LATERAL (
  -- A conversation that was never saved to the book can still be replied
  -- to: the inbox knows the thread even when this page has no copy of it.
  SELECT inbox_thread.thread_key, inbox_thread.client_id
  FROM public.workspace_inbox_thread_state inbox_thread
  WHERE inbox_thread.workspace_id = p_workspace_id AND inbox_thread.podcast_id = staged.podcast_id
  ORDER BY inbox_thread.updated_at DESC
  LIMIT 1
) inbox ON TRUE
LEFT JOIN LATERAL (
  SELECT campaign_target.podcast_name, campaign_target.host_name
  FROM public.workspace_client_campaign_targets campaign_target
  WHERE campaign_target.workspace_id = p_workspace_id AND campaign_target.podcast_id = staged.podcast_id
  ORDER BY campaign_target.updated_at DESC
  LIMIT 1
) target ON TRUE
LEFT JOIN LATERAL (
  SELECT booking.podcast_name, booking.host_name
  FROM public.bookings booking
  JOIN public.clients booking_client ON booking_client.id = booking.client_id
  WHERE booking_client.workspace_id = p_workspace_id
    AND booking.podcast_id = staged.podcast_id
    AND booking.status <> 'cancelled'
  ORDER BY COALESCE(booking.publish_date, booking.recording_date, booking.scheduled_date) DESC NULLS LAST,
    booking.updated_at DESC
  LIMIT 1
) booking_record ON TRUE
ORDER BY
  CASE staged.stage
    WHEN 'in_conversation' THEN 0
    WHEN 'placed' THEN 1
    WHEN 'pitched' THEN 2
    WHEN 'nurturing' THEN 3
    WHEN 'new' THEN 4
    WHEN 'not_a_fit' THEN 5
    ELSE 6
  END,
  staged.last_contacted_at DESC NULLS LAST,
  staged.podcast_id
LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 200), 1000))
OFFSET GREATEST(0, COALESCE(p_offset, 0));
$$;

COMMENT ON FUNCTION public.workspace_host_relationship_book_v4(UUID, INTEGER, INTEGER) IS
  'The curated relationship book, paged: v3 without rows marked not a host, plus each row''s snooze.';

REVOKE ALL ON FUNCTION public.workspace_host_relationship_book_v4(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_host_relationship_book_v4(UUID, INTEGER, INTEGER) TO service_role;

COMMIT;
