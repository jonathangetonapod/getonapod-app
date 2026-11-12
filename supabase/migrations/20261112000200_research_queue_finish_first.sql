-- Finish started research before starting new research.
-- The queue used to order by updated_at, which sent every job to the back after each step:
-- a 150-show batch advanced breadth-first and nothing completed until the batch was nearly done.
-- Fairness between workspaces is already enforced by the per-workspace cap of ten running jobs,
-- so jobs are now taken furthest-along first: pitch phase, then research already under way,
-- then oldest. Shows complete steadily, about ten at a time.
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
   SELECT q.id INTO candidate FROM client_research_jobs q
   WHERE q.status='queued'
     AND (SELECT count(*) FROM client_research_jobs r WHERE r.status='running' AND r.workspace_id=q.workspace_id) < 10
   ORDER BY (q.phase='pitch') DESC,(q.continue_token IS NOT NULL) DESC,q.created_at,q.id
   FOR UPDATE SKIP LOCKED LIMIT 1;
   EXIT WHEN candidate IS NULL;
   UPDATE client_research_jobs SET status='running',lease=gen_random_uuid(),leased_at=now(),updated_at=now()
     WHERE id=candidate RETURNING * INTO claimed;
   RETURN NEXT claimed;
 END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.claim_client_research_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_client_research_jobs(integer) TO service_role;
