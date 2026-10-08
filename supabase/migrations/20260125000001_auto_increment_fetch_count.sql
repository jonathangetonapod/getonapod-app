-- =====================================================
-- AUTO-INCREMENT PODCAST FETCH COUNT
-- Automatically increments podscan_fetch_count when
-- podscan_last_fetched_at is updated
-- =====================================================

-- Create trigger function to auto-increment fetch count
CREATE OR REPLACE FUNCTION auto_increment_fetch_count()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment if this is an UPDATE and podscan_last_fetched_at changed
  IF (TG_OP = 'UPDATE' AND OLD.podscan_last_fetched_at IS DISTINCT FROM NEW.podscan_last_fetched_at) THEN
    NEW.podscan_fetch_count = OLD.podscan_fetch_count + 1;
  END IF;

  -- For INSERT, set to 1 if not already set
  IF (TG_OP = 'INSERT' AND NEW.podscan_fetch_count IS NULL) THEN
    NEW.podscan_fetch_count = 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- replay-safety: this file sorts before 20260125000002_centralized_podcasts_database.sql,
-- which creates the podcasts table this trigger belongs on (on a fresh
-- database, public.podcasts here is still the unrelated 20251227000006 shape).
-- Attach the trigger only when podcasts already has podscan_fetch_count;
-- 20260125000002 attaches it otherwise. Unchanged for production.
DO $replay$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'podcasts'
      AND column_name = 'podscan_fetch_count'
  ) THEN
    -- Drop existing trigger if it exists
    DROP TRIGGER IF EXISTS trigger_auto_increment_fetch_count ON public.podcasts;

    -- Create trigger on podcasts table
    CREATE TRIGGER trigger_auto_increment_fetch_count
      BEFORE INSERT OR UPDATE ON public.podcasts
      FOR EACH ROW
      EXECUTE FUNCTION auto_increment_fetch_count();
  END IF;
END
$replay$;

-- ==================== VERIFICATION ====================

DO $$
BEGIN
  RAISE NOTICE '✅ Auto-increment fetch count trigger created successfully!';
  RAISE NOTICE '📊 The trigger will automatically increment podscan_fetch_count';
  RAISE NOTICE '    whenever podscan_last_fetched_at is updated';
END $$;
