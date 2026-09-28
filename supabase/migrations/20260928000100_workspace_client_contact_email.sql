-- The address clients reply to.
--
-- Every client-facing email went out with no reply-to, while the prospect page
-- told people to reply to the email that brought them here. The agency now
-- names the mailbox its clients should reach; it is optional, and when unset
-- the emails keep going out as before.

BEGIN;

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS client_contact_email TEXT;

DO $workspace_client_contact_email_constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.workspaces'::regclass
      AND conname = 'workspaces_client_contact_email_check'
  ) THEN
    ALTER TABLE public.workspaces
      ADD CONSTRAINT workspaces_client_contact_email_check
      CHECK (
        client_contact_email IS NULL
        OR (
          char_length(client_contact_email) <= 254
          AND client_contact_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
        )
      );
  END IF;
END;
$workspace_client_contact_email_constraints$;

COMMIT;
