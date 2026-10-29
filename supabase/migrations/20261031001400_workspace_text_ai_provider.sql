-- Agency-owned text AI: either Claude or OpenAI, independently of platform embeddings.
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS default_ai_provider TEXT
  CHECK (default_ai_provider IN ('anthropic', 'openai'));
COMMENT ON COLUMN public.workspaces.default_ai_provider IS
  'Selected text AI provider. NULL uses the available workspace key, preferring Anthropic when both exist. Managed by the owner-only Edge API.';

ALTER TABLE public.workspace_operation_costs
  ADD COLUMN IF NOT EXISTS openai_input_tokens BIGINT NOT NULL DEFAULT 0 CHECK (openai_input_tokens >= 0),
  ADD COLUMN IF NOT EXISTS openai_output_tokens BIGINT NOT NULL DEFAULT 0 CHECK (openai_output_tokens >= 0);
