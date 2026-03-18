-- Allow authenticated users (admins) to insert and update podcasts
-- Needed for auto-save from Podcast Finder page

CREATE POLICY "Authenticated users can insert podcasts"
  ON public.podcasts
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update podcasts"
  ON public.podcasts
  FOR UPDATE
  TO authenticated
  USING (true);
