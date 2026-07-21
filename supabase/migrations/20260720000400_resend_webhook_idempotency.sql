-- Transactional, idempotent processing for signed Resend webhook events.
-- Resend provides at-least-once delivery and does not guarantee event order,
-- so the svix-id receipt, email state transition, engagement counter, and
-- suppression update must commit together.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:resend-webhook-idempotency:v1', 0));

CREATE TABLE IF NOT EXISTS public.resend_webhook_events (
  svix_id TEXT PRIMARY KEY
    CHECK (char_length(svix_id) BETWEEN 1 AND 256),
  event_type TEXT NOT NULL
    CHECK (char_length(event_type) BETWEEN 1 AND 128),
  -- Unsupported signed event families are receipt-ledgered and ignored, so an
  -- email identifier is required only for the outbound email events we process.
  resend_email_id TEXT
    CHECK (
      resend_email_id IS NULL
      OR char_length(resend_email_id) BETWEEN 1 AND 256
    ),
  event_created_at TIMESTAMPTZ NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Receipt rows are the idempotency record and must never be rewritten to guess
-- around schema drift. Lock the ledger and accept only the exact authoritative
-- shape; a prepared target with any mismatch requires manual reconciliation.
LOCK TABLE public.resend_webhook_events IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    WHERE relation.oid = 'public.resend_webhook_events'::regclass
      AND relation.relkind = 'r'
      AND relation.relpersistence = 'p'
      AND NOT relation.relispartition
  ) OR (
    SELECT count(*)
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'resend_webhook_events'
  ) <> 5 OR EXISTS (
    SELECT 1
    FROM (VALUES
      ('svix_id', 'text', 'NO', NULL::TEXT),
      ('event_type', 'text', 'NO', NULL::TEXT),
      ('resend_email_id', 'text', 'YES', NULL::TEXT),
      ('event_created_at', 'timestamptz', 'NO', NULL::TEXT),
      ('received_at', 'timestamptz', 'NO', 'now')
    ) AS required_column(column_name, udt_name, is_nullable, default_marker)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns AS existing_column
      WHERE existing_column.table_schema = 'public'
        AND existing_column.table_name = 'resend_webhook_events'
        AND existing_column.column_name = required_column.column_name
        AND existing_column.udt_name = required_column.udt_name
        AND existing_column.is_nullable = required_column.is_nullable
        AND CASE
          WHEN required_column.default_marker IS NULL
            THEN existing_column.column_default IS NULL
          ELSE lower(btrim(COALESCE(existing_column.column_default, ''))) =
            required_column.default_marker || '()'
        END
    )
  ) OR (
    SELECT count(*)
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
      'public.resend_webhook_events'::regclass
      AND constraint_definition.contype <> 'n'
  ) <> 4 OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
        'public.resend_webhook_events'::regclass
      AND constraint_definition.conname = 'resend_webhook_events_pkey'
      AND constraint_definition.contype = 'p'
      AND constraint_definition.convalidated
      AND NOT constraint_definition.condeferrable
      AND NOT constraint_definition.condeferred
      AND constraint_definition.conkey = ARRAY[
        (
          SELECT attribute.attnum
          FROM pg_attribute AS attribute
          WHERE attribute.attrelid = 'public.resend_webhook_events'::regclass
            AND attribute.attname = 'svix_id'
            AND NOT attribute.attisdropped
        )
      ]::SMALLINT[]
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
        'public.resend_webhook_events'::regclass
      AND constraint_definition.conname =
        'resend_webhook_events_svix_id_check'
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
      AND lower(replace(replace(regexp_replace(
        pg_get_constraintdef(constraint_definition.oid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '')) =
        'checkchar_lengthsvix_id>=1andchar_lengthsvix_id<=256'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
        'public.resend_webhook_events'::regclass
      AND constraint_definition.conname =
        'resend_webhook_events_event_type_check'
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
      AND lower(replace(replace(regexp_replace(
        pg_get_constraintdef(constraint_definition.oid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '')) =
        'checkchar_lengthevent_type>=1andchar_lengthevent_type<=128'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid =
        'public.resend_webhook_events'::regclass
      AND constraint_definition.conname =
        'resend_webhook_events_resend_email_id_check'
      AND constraint_definition.contype = 'c'
      AND constraint_definition.convalidated
      AND lower(replace(replace(regexp_replace(
        pg_get_constraintdef(constraint_definition.oid),
        '[[:space:]]',
        '',
        'g'
      ), '(', ''), ')', '')) =
        'checkresend_email_idisnullorchar_lengthresend_email_id>=1andchar_lengthresend_email_id<=256'
  ) OR EXISTS (
    SELECT 1
    FROM pg_index AS index_definition
    JOIN pg_class AS index_relation
      ON index_relation.oid = index_definition.indexrelid
    WHERE index_definition.indrelid =
        'public.resend_webhook_events'::regclass
      AND NOT (
        (
          index_definition.indexrelid = (
            SELECT constraint_definition.conindid
            FROM pg_constraint AS constraint_definition
            WHERE constraint_definition.conrelid =
                'public.resend_webhook_events'::regclass
              AND constraint_definition.conname =
                'resend_webhook_events_pkey'
              AND constraint_definition.contype = 'p'
          )
          AND index_relation.relname = 'resend_webhook_events_pkey'
          AND index_relation.relam = (
            SELECT access_method.oid
            FROM pg_am AS access_method
            WHERE access_method.amname = 'btree'
          )
          AND index_definition.indisprimary
          AND index_definition.indisunique
          AND index_definition.indimmediate
          AND index_definition.indisvalid
          AND index_definition.indisready
          AND index_definition.indislive
          AND index_definition.indnkeyatts = 1
          AND index_definition.indnatts = 1
          AND index_definition.indexprs IS NULL
          AND index_definition.indpred IS NULL
          AND index_definition.indoption[0] = 0
          AND index_definition.indkey[0] = (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.resend_webhook_events'::regclass
              AND attribute.attname = 'svix_id'
              AND NOT attribute.attisdropped
          )
        )
        OR (
          index_relation.relname =
            'resend_webhook_events_received_at_idx'
          AND NOT index_definition.indisunique
          AND NOT index_definition.indisexclusion
          AND index_relation.relam = (
            SELECT access_method.oid
            FROM pg_am AS access_method
            WHERE access_method.amname = 'btree'
          )
          AND index_definition.indimmediate
          AND index_definition.indisvalid
          AND index_definition.indisready
          AND index_definition.indislive
          AND index_definition.indnkeyatts = 1
          AND index_definition.indnatts = 1
          AND index_definition.indexprs IS NULL
          AND index_definition.indpred IS NULL
          AND index_definition.indoption[0] = 3
          AND index_definition.indkey[0] = (
            SELECT attribute.attnum
            FROM pg_attribute AS attribute
            WHERE attribute.attrelid =
                'public.resend_webhook_events'::regclass
              AND attribute.attname = 'received_at'
              AND NOT attribute.attisdropped
          )
        )
      )
  ) OR EXISTS (
    SELECT 1
    FROM pg_trigger AS trigger_definition
    WHERE trigger_definition.tgrelid =
        'public.resend_webhook_events'::regclass
      AND NOT trigger_definition.tgisinternal
  ) THEN
    RAISE EXCEPTION
      'Resend webhook receipt ledger schema drift requires manual reconciliation';
  END IF;
END;
$$;

ALTER TABLE public.resend_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resend_webhook_events NO FORCE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.resend_webhook_events
  FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.resend_webhook_events TO service_role;

DROP INDEX IF EXISTS public.resend_webhook_events_received_at_idx;
CREATE INDEX resend_webhook_events_received_at_idx
  ON public.resend_webhook_events (received_at DESC);

CREATE OR REPLACE FUNCTION public.process_resend_webhook_event(
  p_svix_id TEXT,
  p_event_type TEXT,
  p_resend_email_id TEXT,
  p_event_created_at TIMESTAMPTZ,
  p_bounce_type TEXT,
  p_complaint_type TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  email_log public.email_logs%ROWTYPE;
  inserted_count INTEGER;
  incoming_status TEXT;
  incoming_rank INTEGER;
  current_rank INTEGER;
  normalized_address TEXT;
  normalized_bounce_type TEXT;
  normalized_complaint_type TEXT;
BEGIN
  IF p_svix_id IS NULL
    OR p_svix_id <> btrim(p_svix_id)
    OR char_length(p_svix_id) NOT BETWEEN 1 AND 256
    OR p_event_type IS NULL
    OR p_event_type <> btrim(p_event_type)
    OR char_length(p_event_type) NOT BETWEEN 1 AND 128
    OR p_event_created_at IS NULL
  THEN
    RAISE EXCEPTION 'Invalid Resend webhook event';
  END IF;

  IF p_resend_email_id IS NOT NULL
    AND (
      p_resend_email_id <> btrim(p_resend_email_id)
      OR char_length(p_resend_email_id) NOT BETWEEN 1 AND 256
    )
  THEN
    RAISE EXCEPTION 'Invalid Resend email identifier';
  END IF;

  normalized_bounce_type := CASE lower(COALESCE(p_bounce_type, ''))
    WHEN 'hard' THEN 'hard'
    WHEN 'soft' THEN 'soft'
    WHEN 'unknown' THEN 'unknown'
    ELSE NULL
  END;

  IF p_event_type = 'email.bounced' AND normalized_bounce_type IS NULL THEN
    RAISE EXCEPTION 'Invalid bounce type';
  END IF;

  normalized_complaint_type := NULLIF(left(btrim(COALESCE(p_complaint_type, 'abuse')), 64), '');

  INSERT INTO public.resend_webhook_events (
    svix_id,
    event_type,
    resend_email_id,
    event_created_at
  )
  VALUES (
    p_svix_id,
    p_event_type,
    p_resend_email_id,
    p_event_created_at
  )
  ON CONFLICT (svix_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  IF inserted_count = 0 THEN
    RETURN 'duplicate';
  END IF;

  IF p_event_type NOT IN (
    'email.sent',
    'email.delivered',
    'email.delivery_delayed',
    'email.failed',
    'email.bounced',
    'email.complained',
    'email.suppressed',
    'email.opened',
    'email.clicked'
  ) THEN
    RETURN 'ignored';
  END IF;

  IF p_resend_email_id IS NULL THEN
    RAISE EXCEPTION 'Email identifier is required for this event';
  END IF;

  SELECT email.*
  INTO email_log
  FROM public.email_logs AS email
  WHERE email.resend_email_id = p_resend_email_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Raising rolls back the receipt as well, allowing Resend's retry to find
    -- an email log that committed shortly after the send response.
    RAISE EXCEPTION 'Email log is not available';
  END IF;

  incoming_status := CASE p_event_type
    WHEN 'email.sent' THEN 'sent'
    WHEN 'email.delivered' THEN 'delivered'
    WHEN 'email.failed' THEN 'failed'
    WHEN 'email.bounced' THEN 'bounced'
    WHEN 'email.complained' THEN 'complained'
    WHEN 'email.suppressed' THEN 'suppressed'
    ELSE NULL
  END;

  IF incoming_status IS NOT NULL THEN
    incoming_rank := CASE incoming_status
      WHEN 'sent' THEN 1
      WHEN 'delivered' THEN 2
      WHEN 'failed' THEN 3
      WHEN 'bounced' THEN 4
      WHEN 'complained' THEN 5
      WHEN 'suppressed' THEN 6
      ELSE 0
    END;
    current_rank := CASE email_log.status
      WHEN 'sent' THEN 1
      WHEN 'delivered' THEN 2
      WHEN 'failed' THEN 3
      WHEN 'bounced' THEN 4
      WHEN 'complained' THEN 5
      WHEN 'suppressed' THEN 6
      ELSE 0
    END;

    -- A lower-precedence retry (for example sent after delivered) cannot
    -- regress a later or terminal outcome.
    IF incoming_rank >= current_rank THEN
      UPDATE public.email_logs
      SET
        status = incoming_status,
        metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
          'resend_status_event_type', p_event_type,
          'resend_status_event_at', p_event_created_at
        )
      WHERE id = email_log.id;
      email_log.status := incoming_status;
      email_log.metadata := COALESCE(email_log.metadata, '{}'::JSONB) || jsonb_build_object(
        'resend_status_event_type', p_event_type,
        'resend_status_event_at', p_event_created_at
      );
    END IF;
  END IF;

  CASE p_event_type
    WHEN 'email.delivery_delayed' THEN
      UPDATE public.email_logs
      SET metadata = COALESCE(metadata, '{}'::JSONB) || jsonb_build_object(
        'delivery_delayed', true,
        'delayed_at', p_event_created_at
      )
      WHERE id = email_log.id;

    WHEN 'email.bounced' THEN
      UPDATE public.email_logs
      SET bounce_type = CASE
        WHEN CASE COALESCE(bounce_type, '')
          WHEN 'unknown' THEN 1
          WHEN 'soft' THEN 2
          WHEN 'hard' THEN 3
          ELSE 0
        END >= CASE normalized_bounce_type
          WHEN 'unknown' THEN 1
          WHEN 'soft' THEN 2
          WHEN 'hard' THEN 3
          ELSE 0
        END
          THEN bounce_type
        ELSE normalized_bounce_type
      END
      WHERE id = email_log.id;

    WHEN 'email.complained' THEN
      UPDATE public.email_logs
      SET complaint_type = COALESCE(normalized_complaint_type, 'abuse')
      WHERE id = email_log.id;

    WHEN 'email.opened' THEN
      UPDATE public.email_logs
      SET
        opened_at = CASE
          WHEN opened_at IS NULL OR p_event_created_at < opened_at
            THEN p_event_created_at
          ELSE opened_at
        END,
        open_count = GREATEST(COALESCE(open_count, 0), 0) + 1
      WHERE id = email_log.id;

    WHEN 'email.clicked' THEN
      UPDATE public.email_logs
      SET
        clicked_at = CASE
          WHEN clicked_at IS NULL OR p_event_created_at < clicked_at
            THEN p_event_created_at
          ELSE clicked_at
        END,
        click_count = GREATEST(COALESCE(click_count, 0), 0) + 1
      WHERE id = email_log.id;

    ELSE
      NULL;
  END CASE;

  IF p_event_type IN ('email.bounced', 'email.complained', 'email.suppressed') THEN
    normalized_address := lower(btrim(COALESCE(email_log.to_address, '')));
    IF normalized_address = '' OR char_length(normalized_address) > 320 THEN
      RAISE EXCEPTION 'Email log recipient is invalid';
    END IF;

    IF p_event_type = 'email.suppressed' THEN
      -- A provider-side suppression is not itself a new bounce. Preserve the
      -- historical bounce count while ensuring future sends are blocked.
      INSERT INTO public.email_bounces AS existing (
        email_address,
        bounce_type,
        bounce_count,
        first_bounced_at,
        last_bounced_at,
        suppressed,
        suppressed_at
      )
      VALUES (
        normalized_address,
        'suppressed',
        0,
        NULL,
        NULL,
        true,
        p_event_created_at
      )
      ON CONFLICT (email_address) DO UPDATE
      SET
        bounce_type = CASE
          WHEN CASE existing.bounce_type
            WHEN 'complaint' THEN 5
            WHEN 'spam' THEN 5
            WHEN 'hard' THEN 4
            WHEN 'suppressed' THEN 3
            WHEN 'soft' THEN 2
            WHEN 'unknown' THEN 1
            ELSE 0
          END >= 3
            THEN existing.bounce_type
          ELSE EXCLUDED.bounce_type
        END,
        suppressed = true,
        suppressed_at = CASE
          WHEN existing.suppressed_at IS NULL THEN EXCLUDED.suppressed_at
          ELSE LEAST(existing.suppressed_at, EXCLUDED.suppressed_at)
        END,
        updated_at = now();
    ELSE
      INSERT INTO public.email_bounces AS existing (
        email_address,
        bounce_type,
        bounce_count,
        first_bounced_at,
        last_bounced_at,
        suppressed,
        suppressed_at
      )
      VALUES (
        normalized_address,
        CASE
          WHEN p_event_type = 'email.complained' THEN 'complaint'
          ELSE normalized_bounce_type
        END,
        1,
        p_event_created_at,
        p_event_created_at,
        p_event_type = 'email.complained' OR normalized_bounce_type = 'hard',
        CASE
          WHEN p_event_type = 'email.complained' OR normalized_bounce_type = 'hard'
            THEN p_event_created_at
          ELSE NULL
        END
      )
      ON CONFLICT (email_address) DO UPDATE
      SET
        bounce_count = GREATEST(COALESCE(existing.bounce_count, 0), 0) + 1,
        first_bounced_at = CASE
          WHEN existing.first_bounced_at IS NULL THEN EXCLUDED.first_bounced_at
          ELSE LEAST(existing.first_bounced_at, EXCLUDED.first_bounced_at)
        END,
        last_bounced_at = CASE
          WHEN existing.last_bounced_at IS NULL THEN EXCLUDED.last_bounced_at
          ELSE GREATEST(existing.last_bounced_at, EXCLUDED.last_bounced_at)
        END,
        bounce_type = CASE
          WHEN CASE existing.bounce_type
            WHEN 'complaint' THEN 5
            WHEN 'spam' THEN 5
            WHEN 'hard' THEN 4
            WHEN 'suppressed' THEN 3
            WHEN 'soft' THEN 2
            WHEN 'unknown' THEN 1
            ELSE 0
          END >= CASE EXCLUDED.bounce_type
            WHEN 'complaint' THEN 5
            WHEN 'spam' THEN 5
            WHEN 'hard' THEN 4
            WHEN 'suppressed' THEN 3
            WHEN 'soft' THEN 2
            WHEN 'unknown' THEN 1
            ELSE 0
          END
            THEN existing.bounce_type
          ELSE EXCLUDED.bounce_type
        END,
        suppressed = COALESCE(existing.suppressed, false) OR EXCLUDED.suppressed,
        suppressed_at = CASE
          WHEN existing.suppressed_at IS NULL THEN EXCLUDED.suppressed_at
          WHEN EXCLUDED.suppressed_at IS NULL THEN existing.suppressed_at
          ELSE LEAST(existing.suppressed_at, EXCLUDED.suppressed_at)
        END,
        updated_at = now();
    END IF;
  END IF;

  RETURN 'processed';
END;
$$;

REVOKE ALL ON FUNCTION public.process_resend_webhook_event(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_resend_webhook_event(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) TO service_role;

COMMENT ON TABLE public.resend_webhook_events IS
  'Minimal signed Resend event receipt ledger keyed by svix-id for transactional deduplication.';
COMMENT ON FUNCTION public.process_resend_webhook_event(
  TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) IS
  'Service-only atomic Resend receipt, monotonic delivery update, engagement count, and suppression operation.';

COMMIT;
