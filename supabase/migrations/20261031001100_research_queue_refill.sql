-- Refill available slots promptly; claim RPC still caps all overlapping ticks.
DO $$
DECLARE tick_id bigint;
BEGIN
 SELECT jobid INTO tick_id FROM cron.job WHERE jobname='client-research-tick';
 IF tick_id IS NULL THEN RAISE EXCEPTION 'Install the bulk research schedule first'; END IF;
 PERFORM cron.alter_job(tick_id, schedule := '15 seconds');
END $$;
