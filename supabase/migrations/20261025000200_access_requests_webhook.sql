-- Tell n8n about every request to join.
--
-- The same arrangement as clips_leads (20261025000100): every insert into
-- workspace_access_requests, which is the form on /platform and /register,
-- posts the row to an n8n webhook in the Database Webhook shape
-- ({type, table, schema, record, old_record}).
--
-- The URL and the shared secret live in Vault, not in this file:
--
--   select vault.create_secret('<n8n production webhook url>', 'n8n_access_request_url');
--   select vault.create_secret('<long random string>',         'n8n_access_request_secret');
--
-- Both or nothing. Until both exist the trigger does nothing, and a failed
-- post never fails the insert: the request is already stored and the platform
-- email already sent by then.

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_workspace_access_request()
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
  WHERE name = 'n8n_access_request_url';

  SELECT decrypted_secret INTO webhook_secret
  FROM vault.decrypted_secrets
  WHERE name = 'n8n_access_request_secret';

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
    RAISE WARNING 'workspace_access_requests webhook could not be queued: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_workspace_access_request() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.notify_workspace_access_request() IS
  'After-insert trigger on workspace_access_requests: posts the row to the n8n webhook named in Vault (n8n_access_request_url, n8n_access_request_secret). No-op until both exist; never fails the insert.';

DROP TRIGGER IF EXISTS workspace_access_requests_notify ON public.workspace_access_requests;
CREATE TRIGGER workspace_access_requests_notify
  AFTER INSERT ON public.workspace_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_workspace_access_request();

COMMIT;
