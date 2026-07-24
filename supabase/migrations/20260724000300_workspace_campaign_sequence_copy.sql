-- Store the complete per-podcast outreach package prepared in the approval
-- dashboard. These fields become Instantly lead variables only when a manager
-- explicitly starts outreach from Client Campaigns.

ALTER TABLE public.workspace_client_campaign_targets
  ADD COLUMN research_notes TEXT,
  ADD COLUMN follow_up_1_subject TEXT,
  ADD COLUMN follow_up_1_body TEXT,
  ADD COLUMN follow_up_2_subject TEXT,
  ADD COLUMN follow_up_2_body TEXT,
  ADD CONSTRAINT workspace_campaign_target_research_notes_length
    CHECK (research_notes IS NULL OR char_length(research_notes) <= 10000),
  ADD CONSTRAINT workspace_campaign_target_follow_up_1_subject_length
    CHECK (follow_up_1_subject IS NULL OR char_length(follow_up_1_subject) <= 300),
  ADD CONSTRAINT workspace_campaign_target_follow_up_1_body_length
    CHECK (follow_up_1_body IS NULL OR char_length(follow_up_1_body) <= 20000),
  ADD CONSTRAINT workspace_campaign_target_follow_up_2_subject_length
    CHECK (follow_up_2_subject IS NULL OR char_length(follow_up_2_subject) <= 300),
  ADD CONSTRAINT workspace_campaign_target_follow_up_2_body_length
    CHECK (follow_up_2_body IS NULL OR char_length(follow_up_2_body) <= 20000);

COMMENT ON COLUMN public.workspace_client_campaign_targets.research_notes IS
  'Workspace-only research used to prepare this podcast outreach sequence.';
COMMENT ON COLUMN public.workspace_client_campaign_targets.follow_up_1_subject IS
  'Reviewed subject for the first per-podcast follow-up.';
COMMENT ON COLUMN public.workspace_client_campaign_targets.follow_up_1_body IS
  'Reviewed body for the first per-podcast follow-up.';
COMMENT ON COLUMN public.workspace_client_campaign_targets.follow_up_2_subject IS
  'Reviewed subject for the final per-podcast follow-up.';
COMMENT ON COLUMN public.workspace_client_campaign_targets.follow_up_2_body IS
  'Reviewed body for the final per-podcast follow-up.';

NOTIFY pgrst, 'reload schema';
