"""Print a rollback-only SQL probe; execute against an authorized database.
Uses temporary rows/functions; never creates real research work.
"""
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
source=(ROOT / 'supabase/migrations/20261031000600_parallel_bulk_research.sql').read_text()
function=source.split('REVOKE ALL')[0].replace('FUNCTION public.claim_client_research_jobs','FUNCTION pg_temp.claim_client_research_jobs').replace('SET search_path = public','SET search_path = pg_temp')
query='''BEGIN;
CREATE TEMP TABLE client_research_jobs (LIKE public.client_research_jobs INCLUDING DEFAULTS);
'''+function+'''
INSERT INTO pg_temp.client_research_jobs(id,batch_id,workspace_id,client_id,shortlist_podcast_id,podcast_name,actor_id,actor_issued_at,actor_metadata,created_at,updated_at)
SELECT gen_random_uuid(),gen_random_uuid(), ('00000000-0000-4000-8000-'||lpad(((i-1)/4+1)::text,12,'0'))::uuid,
 gen_random_uuid(),gen_random_uuid(),'Parallel claim fixture',gen_random_uuid(),0,'{}',now()+i*interval '1 second',now()+i*interval '1 second'
FROM generate_series(1,12) AS i;
DO $$ BEGIN
 IF (SELECT count(*) FROM pg_temp.claim_client_research_jobs(99)) <> 4 THEN RAISE EXCEPTION 'per-tick cap failed'; END IF;
 IF (SELECT count(*) FROM pg_temp.claim_client_research_jobs(4)) <> 4 THEN RAISE EXCEPTION 'second workspace claim failed'; END IF;
 IF (SELECT count(*) FROM pg_temp.claim_client_research_jobs(4)) <> 0 THEN RAISE EXCEPTION 'global cap failed'; END IF;
 IF EXISTS (SELECT 1 FROM pg_temp.client_research_jobs WHERE status='running' GROUP BY workspace_id HAVING count(*)>4) THEN RAISE EXCEPTION 'workspace cap failed'; END IF;
 IF (SELECT count(distinct lease) FROM pg_temp.client_research_jobs WHERE status='running') <> 8 THEN RAISE EXCEPTION 'leases not unique'; END IF;
 UPDATE pg_temp.client_research_jobs SET status='completed' WHERE id IN (SELECT id FROM pg_temp.client_research_jobs WHERE status='running' ORDER BY created_at LIMIT 2);
 IF (SELECT count(*) FROM pg_temp.claim_client_research_jobs(4)) <> 2 THEN RAISE EXCEPTION 'freed slots not reused'; END IF;
 IF (SELECT count(*) FROM pg_temp.claim_client_research_jobs(0)) <> 0 THEN RAISE EXCEPTION 'zero limit failed'; END IF;
END $$;
ROLLBACK;'''
print(query)
