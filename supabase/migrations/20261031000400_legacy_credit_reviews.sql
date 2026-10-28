-- Preserve purchased-credit history and record manual settlement reviews.
-- This queue neither refunds payments nor converts or consumes credit lots.
BEGIN;
CREATE TABLE public.workspace_credit_reviews (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'reviewing', 'resolved')),
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  purchased_remaining_at_request bigint NOT NULL CHECK (purchased_remaining_at_request >= 0),
  resolution_note text CHECK (resolution_note IS NULL OR char_length(resolution_note) BETWEEN 10 AND 1000),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credit_review_resolution_note CHECK (status <> 'resolved' OR resolution_note IS NOT NULL)
);
ALTER TABLE public.workspace_credit_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_credit_reviews FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.workspace_credit_reviews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.workspace_credit_reviews TO service_role;
CREATE INDEX workspace_credit_reviews_queue_idx ON public.workspace_credit_reviews(status, requested_at);
CREATE FUNCTION public.workspace_purchased_credit_balance_v1(p_workspace_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT COALESCE(sum(remaining), 0) FROM public.workspace_credit_lots
  WHERE workspace_id = p_workspace_id AND source = 'purchase'; $$;
REVOKE ALL ON FUNCTION public.workspace_purchased_credit_balance_v1(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.workspace_purchased_credit_balance_v1(uuid) TO service_role;
COMMIT;
