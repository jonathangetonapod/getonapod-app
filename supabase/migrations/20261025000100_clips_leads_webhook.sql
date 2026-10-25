-- Tell n8n about every free-cut lead.
--
-- The clips-lead function emails the editors, but an email is a notification
-- only one inbox can act on. n8n wants the row: it can message a phone, log a
-- sheet, and set a reminder before the 72 hours are up. So every insert into
-- clips_leads posts the row to an n8n webhook, in the same shape the dashboard's
-- Database Webhooks use ({type, table, schema, record, old_record}), so a flow
-- written for one works with the other.
--
-- The URL and the shared secret live in Vault, not in this file:
--
--   select vault.create_secret('<n8n production webhook url>', 'n8n_clips_lead_url');
--   select vault.create_secret('<long random string>',         'n8n_clips_lead_secret');
--
-- Both or nothing. Until both exist the trigger does nothing, and if the post
-- itself ever fails the insert still commits: a lead is never lost because a
-- notification could not be sent. pg_net queues the request and returns at
-- once, so the insert does not wait on n8n either.

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_clips_lead()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  webhook_url TEXT;
  webhook_secret TEXT;
BEGIN
  SELECT decrypted_secret INTO webhook_url
  FROM vault.decrypted_secrets
  WHERE name = 'n8n_clips_lead_url';

  SELECT decrypted_secret INTO webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'n8n_clips_lead_secret';

  IF webhook_url IS NULL OR btrim(webhook_url) = ''
    OR webhook_secret IS NULL OR btrim(webhook_secret) = ''
  THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := webhook_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', webhook_secret
      ),
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', TG_TABLE_NAME,
        'schema', TG_TABLE_SCHEMA,
        'record', to_jsonb(NEW),
        'old_record', NULL
      ),
      timeout_milliseconds := 5000
    );
  EXCEPTION WHEN OTHERS THEN
    -- Queueing the request failed (pg_net unavailable, bad URL). The lead is
    -- already in the table and the editors have their email; say so and go on.
    RAISE WARNING 'clips_leads webhook could not be queued: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_clips_lead() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notify_clips_lead() IS
  'After-insert trigger on clips_leads: posts the row to the n8n webhook named in Vault (n8n_clips_lead_url, n8n_clips_lead_secret). No-op until both exist; never fails the insert.';

DROP TRIGGER IF EXISTS clips_leads_notify ON public.clips_leads;
CREATE TRIGGER clips_leads_notify
  AFTER INSERT ON public.clips_leads
  FOR EACH ROW EXECUTE FUNCTION public.notify_clips_lead();

COMMIT;
