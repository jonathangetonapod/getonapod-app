-- Durable research jobs. Only authenticated manager endpoints and the worker access this table.
CREATE TABLE public.client_research_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL,
 workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
 client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
 shortlist_podcast_id uuid NOT NULL REFERENCES public.client_dashboard_podcasts(id) ON DELETE CASCADE,
 podcast_name text NOT NULL,
 actor_id uuid NOT NULL,
 actor_issued_at bigint NOT NULL,
 actor_metadata jsonb NOT NULL,
 status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','skipped')),
 phase text NOT NULL DEFAULT 'research' CHECK (phase IN ('research','pitch')),
 continue_token text,
 research_run_started_at text,
 pitch_outputs jsonb NOT NULL DEFAULT '[]'::jsonb,
 lease uuid,
 leased_at timestamptz,
 message text,
 pitch jsonb,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.client_research_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_research_jobs FROM anon, authenticated;
GRANT ALL ON public.client_research_jobs TO service_role;
CREATE UNIQUE INDEX client_research_jobs_active ON public.client_research_jobs(shortlist_podcast_id) WHERE status IN ('queued','running');
CREATE INDEX client_research_jobs_client ON public.client_research_jobs(client_id, created_at DESC);
CREATE FUNCTION public.claim_client_research_job() RETURNS SETOF public.client_research_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(510031);
 -- A crashed invocation is visible and requires an explicit retry. Never silently re-bill it.
 UPDATE client_research_jobs SET status='failed', message='Worker interrupted. Completed research is saved; retry to continue.', updated_at=now()
 WHERE status='running' AND leased_at < now() - interval '10 minutes';
 RETURN QUERY
 UPDATE client_research_jobs j SET status='running', lease=gen_random_uuid(), leased_at=now(), updated_at=now()
 WHERE j.id = (SELECT q.id FROM client_research_jobs q WHERE q.status='queued'
 AND NOT EXISTS (SELECT 1 FROM client_research_jobs r WHERE r.status='running')
 ORDER BY q.created_at FOR UPDATE SKIP LOCKED LIMIT 1)
 RETURNING j.*;
END; $$;
REVOKE ALL ON FUNCTION public.claim_client_research_job() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_research_job() TO service_role;
CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.schedule('client-research-tick','* * * * *',$job$
 SELECT net.http_post(
 url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='research_tick_url'),
 headers := jsonb_build_object('Content-Type','application/json','x-research-secret',(SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='research_tick_secret')),
 body := '{}'::jsonb, timeout_milliseconds := 150000)
 WHERE EXISTS (SELECT 1 FROM vault.decrypted_secrets WHERE name IN ('research_tick_url','research_tick_secret') HAVING count(*)=2);
$job$);
