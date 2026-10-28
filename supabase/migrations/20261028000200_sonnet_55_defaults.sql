BEGIN;

-- Move saved legacy selections with the shipped defaults. Preserve selections
-- of the current Fable/Opus/Haiku family and leave prompt text untouched.
UPDATE public.workspace_research_prompts
SET model = 'claude-sonnet-5-5', updated_at = NOW()
WHERE model ~ '^claude-(sonnet|opus|haiku)-(3|4)(-|$)'
   OR model IN ('claude-sonnet-5', 'claude-opus-5', 'claude-haiku-5');

COMMIT;
