-- Finished previews survive page navigation. Only the authenticated Edge
-- Function can access them, after checking workspace and host permissions.
CREATE TABLE public.client_pitch_previews (
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  shortlist_podcast_id UUID NOT NULL REFERENCES public.client_dashboard_podcasts(id) ON DELETE CASCADE,
  angle_index INTEGER NOT NULL CHECK (angle_index BETWEEN 0 AND 4),
  input_hash TEXT NOT NULL,
  pitch JSONB NOT NULL CHECK (jsonb_typeof(pitch) = 'object'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, client_id, shortlist_podcast_id, angle_index),
  FOREIGN KEY (workspace_id, client_id)
    REFERENCES public.clients(workspace_id, id) ON DELETE CASCADE
);

ALTER TABLE public.client_pitch_previews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.client_pitch_previews FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.client_pitch_previews TO service_role;
