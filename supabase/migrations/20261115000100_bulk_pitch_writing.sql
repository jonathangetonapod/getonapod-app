-- Bulk pitch writing reuses the research queue: a job that starts in the pitch phase.
-- Research jobs also finish in the pitch phase, so the phase cannot say what a batch was
-- started to do. The kind records it, for the status line and the batch history.
ALTER TABLE public.client_research_jobs
  ADD COLUMN kind text NOT NULL DEFAULT 'research' CHECK (kind IN ('research','pitch')),
  -- The shortlist polls the queue while a batch runs. It needs how many pitch steps are saved,
  -- not the saved model outputs themselves, which run to several kilobytes per show.
  ADD COLUMN pitch_steps integer GENERATED ALWAYS AS (
    CASE WHEN jsonb_typeof(pitch_outputs) = 'array' THEN jsonb_array_length(pitch_outputs) ELSE 0 END
  ) STORED;
