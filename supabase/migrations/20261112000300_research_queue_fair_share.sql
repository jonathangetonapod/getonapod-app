-- Share research slots fairly, then finish started research first.
-- 20261112000200 ordered purely by how far along a job was. Every job re-queues after each step,
-- so a busy workspace's resumed jobs always outranked another workspace's fresh ones: a new batch
-- could wait until the busy workspaces had started their whole backlog. The per-workspace cap only
-- limits a workspace; it never guarantees one a slot.
-- Each free slot now goes to the workspace with the fewest running jobs, then within it to the batch
-- with the fewest running jobs (so a second client's batch is not stuck behind a 200-show one),
-- and only then to the furthest-along job: pitch phase, research under way, oldest.
CREATE OR REPLACE FUNCTION public.claim_client_research_jobs(p_limit integer DEFAULT 10)
RETURNS SETOF public.client_research_jobs
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 candidate uuid;
 claimed public.client_research_jobs%ROWTYPE;
 slots integer;
BEGIN
 PERFORM pg_advisory_xact_lock(510031);
 UPDATE client_research_jobs SET status='failed', message='Worker interrupted. Completed research is saved; retry to continue.', updated_at=now()
 WHERE status='running' AND leased_at < now() - interval '10 minutes';
 slots := LEAST(GREATEST(COALESCE(p_limit,10),0),10,
   GREATEST(0,20-(SELECT count(*)::integer FROM client_research_jobs WHERE status='running')));
 FOR i IN 1..slots LOOP
   -- Running counts are taken once per claim and joined in, not recounted for every queued row.
   WITH ws AS (SELECT workspace_id, count(*) AS n FROM client_research_jobs WHERE status='running' GROUP BY workspace_id),
        bt AS (SELECT batch_id, count(*) AS n FROM client_research_jobs WHERE status='running' GROUP BY batch_id)
   SELECT q.id INTO candidate FROM client_research_jobs q
   LEFT JOIN ws ON ws.workspace_id=q.workspace_id
   LEFT JOIN bt ON bt.batch_id=q.batch_id
   WHERE q.status='queued' AND COALESCE(ws.n,0) < 10
   ORDER BY COALESCE(ws.n,0),COALESCE(bt.n,0),(q.phase='pitch') DESC,(q.continue_token IS NOT NULL) DESC,q.created_at,q.id
   FOR UPDATE OF q SKIP LOCKED LIMIT 1;
   EXIT WHEN candidate IS NULL;
   UPDATE client_research_jobs SET status='running',lease=gen_random_uuid(),leased_at=now(),updated_at=now()
     WHERE id=candidate RETURNING * INTO claimed;
   RETURN NEXT claimed;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.claim_client_research_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_research_jobs(integer) TO service_role;
