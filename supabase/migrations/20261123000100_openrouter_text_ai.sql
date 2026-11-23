-- OpenRouter as a third agency-owned text AI provider, beside Claude and OpenAI.
--
-- 1. A workspace may save an OpenRouter key and choose it as its provider.
-- 2. Model ids may take OpenRouter's shape: vendor/model, with an optional
--    :variant suffix and a ~ prefix for rolling aliases
--    (anthropic/claude-sonnet-5.5, x/y:free, ~anthropic/claude-sonnet-latest).
-- 3. OpenRouter tokens get their own cost columns, as OpenAI's did.
--
-- Credentials, privileges and policies are untouched. Existing rows satisfy every
-- widened check, so nothing is rewritten.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:openrouter-text-ai:v1', 0));

-- Saved keys: the named provider check is replaced with one that adds openrouter.
ALTER TABLE public.workspace_ai_credentials
  DROP CONSTRAINT IF EXISTS workspace_ai_credentials_provider_check;
ALTER TABLE public.workspace_ai_credentials
  ADD CONSTRAINT workspace_ai_credentials_provider_check
  CHECK (provider IN ('anthropic', 'openai', 'openrouter', 'winnr', 'blitz', 'podscan'));

-- The provider choice and the two model columns were declared with inline,
-- unnamed checks, so they are found by definition rather than guessed by name.
DO $$
DECLARE
  constraint_row RECORD;
BEGIN
  FOR constraint_row IN
    SELECT c.conrelid::regclass AS table_name, c.conname
    FROM pg_constraint c
    WHERE c.contype = 'c'
      AND (
        (c.conrelid = 'public.workspaces'::regclass
          AND pg_get_constraintdef(c.oid) ILIKE '%default_ai_provider%')
        OR (c.conrelid = 'public.workspace_ai_models'::regclass
          AND pg_get_constraintdef(c.oid) ILIKE '%model ~%')
        OR (c.conrelid = 'public.workspace_research_prompts'::regclass
          AND pg_get_constraintdef(c.oid) ILIKE '%model ~%')
      )
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', constraint_row.table_name, constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_default_ai_provider_check
  CHECK (default_ai_provider IN ('anthropic', 'openai', 'openrouter'));

ALTER TABLE public.workspace_ai_models
  ADD CONSTRAINT workspace_ai_models_model_shape
  CHECK (length(model) BETWEEN 1 AND 128 AND model ~ '^[a-zA-Z0-9._:/~-]+$');

ALTER TABLE public.workspace_research_prompts
  ADD CONSTRAINT workspace_research_prompts_model_shape
  CHECK (model IS NULL OR (length(model) BETWEEN 1 AND 128 AND model ~ '^[a-zA-Z0-9._:/~-]+$'));

COMMENT ON COLUMN public.workspaces.default_ai_provider IS
  'Selected text AI provider: anthropic, openai or openrouter. NULL uses the available workspace key, preferring Anthropic, then OpenAI, then OpenRouter. Managed by the owner-only Edge API.';

ALTER TABLE public.workspace_operation_costs
  ADD COLUMN IF NOT EXISTS openrouter_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (openrouter_input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS openrouter_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (openrouter_output_tokens >= 0);

COMMIT;
