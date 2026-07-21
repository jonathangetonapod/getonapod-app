-- Normalize optional client-to-prospect capability links after the portal
-- capability rotation. Historical admin forms stored "no prospect selected"
-- as an empty string; that value is not a link and must be represented as
-- NULL before enforcing the capability format.

BEGIN;

SELECT pg_advisory_xact_lock(
  hashtextextended('goap:client-prospect-link-normalization:v1', 0)
);

LOCK TABLE public.clients IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'clients'
      AND column_name = 'prospect_dashboard_slug'
      AND data_type = 'text'
  ) THEN
    RAISE EXCEPTION
      'public.clients.prospect_dashboard_slug must be a text column';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_client_prospect_dashboard_slug()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.prospect_dashboard_slug := NULLIF(
    btrim(NEW.prospect_dashboard_slug),
    ''
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_client_prospect_dashboard_slug()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS clients_normalize_prospect_dashboard_slug
  ON public.clients;
CREATE TRIGGER clients_normalize_prospect_dashboard_slug
  BEFORE INSERT OR UPDATE OF prospect_dashboard_slug ON public.clients
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_client_prospect_dashboard_slug();

UPDATE public.clients
SET prospect_dashboard_slug = NULL
WHERE prospect_dashboard_slug IS NOT NULL
  AND btrim(prospect_dashboard_slug) = '';

ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_prospect_dashboard_slug_capability_check;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_prospect_dashboard_slug_capability_check
  CHECK (
    prospect_dashboard_slug IS NULL
    OR prospect_dashboard_slug ~ '^prospect-[0-9a-f]{24}$'
  ) NOT VALID;
ALTER TABLE public.clients
  VALIDATE CONSTRAINT clients_prospect_dashboard_slug_capability_check;

-- Strong-looking orphan values must also fail closed. Keep the relationship
-- synchronized when a capability rotates and clear it when a prospect is
-- intentionally deleted.
ALTER TABLE public.clients
  DROP CONSTRAINT IF EXISTS clients_prospect_dashboard_slug_fkey;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_prospect_dashboard_slug_fkey
  FOREIGN KEY (prospect_dashboard_slug)
  REFERENCES public.prospect_dashboards (slug)
  ON UPDATE CASCADE
  ON DELETE SET NULL
  NOT VALID;
ALTER TABLE public.clients
  VALIDATE CONSTRAINT clients_prospect_dashboard_slug_fkey;

COMMENT ON FUNCTION public.normalize_client_prospect_dashboard_slug() IS
  'Canonicalizes the optional client-to-prospect capability reference before validation.';
COMMENT ON CONSTRAINT clients_prospect_dashboard_slug_capability_check
  ON public.clients IS
  'Optional prospect references are NULL or a strong prospect capability slug.';
COMMENT ON CONSTRAINT clients_prospect_dashboard_slug_fkey
  ON public.clients IS
  'Keeps optional client-to-prospect capability references exact and non-orphaned.';

COMMIT;
