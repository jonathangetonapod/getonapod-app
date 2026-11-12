-- A booking outlives the campaign target it came from.
--
-- bookings_campaign_target_fk is a three-column key
-- (workspace_id, client_id, campaign_target_id). Its bare ON DELETE SET NULL
-- nulls all three columns, and bookings.client_id is NOT NULL, so deleting a
-- target that led to a booking failed outright instead of dropping the link.
-- Nothing deleted targets until client campaigns could be deleted; the
-- workspace-client-campaigns delete action also clears the link itself first,
-- so this is the schema saying the same thing.
--
-- Naming the column (Postgres 15+) nulls only the link and keeps the booking
-- in its workspace and with its client.

ALTER TABLE public.bookings
  DROP CONSTRAINT IF EXISTS bookings_campaign_target_fk;

ALTER TABLE public.bookings
  ADD CONSTRAINT bookings_campaign_target_fk
  FOREIGN KEY (workspace_id, client_id, campaign_target_id)
  REFERENCES public.workspace_client_campaign_targets(workspace_id, client_id, id)
  ON DELETE SET NULL (campaign_target_id);
