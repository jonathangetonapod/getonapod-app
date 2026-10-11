-- Billing hardening: refunds and disputes take credits back, automatic
-- top-ups remember their failures, and the tick visits profiles fairly.
--
-- 1. A refunded or disputed credit purchase used to leave its credits in
--    place: the webhook only listened for payments, so money could go back
--    to the customer while what it bought stayed spendable. A lot now records
--    the Stripe PaymentIntent that paid for it (stripe_payment_ref has been on
--    the table since it was created, and nothing ever wrote it), and
--    reverse_workspace_credit_lot_v1 removes the unspent part of that one lot.
--
-- 2. The refill tick forgot every failure the moment it logged it, so a
--    declined card was retried every hour for ever and nobody was told. The
--    profile now carries the failure count, the last error, and when the tick
--    last tried, which is also the fair order it pages through profiles in.

BEGIN;

SELECT pg_advisory_xact_lock(hashtextextended('goap:billing-refunds-and-refill-failures:v1', 0));

-- ---------------------------------------------------------------------------
-- Refill bookkeeping on the profile.
-- ---------------------------------------------------------------------------
ALTER TABLE public.workspace_billing_profiles
  ADD COLUMN IF NOT EXISTS last_refill_attempt_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS refill_failure_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refill_last_error TEXT,
  ADD COLUMN IF NOT EXISTS refill_last_failed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_billing_profiles_refill_failure_count_check'
  ) THEN
    ALTER TABLE public.workspace_billing_profiles
      ADD CONSTRAINT workspace_billing_profiles_refill_failure_count_check
      CHECK (refill_failure_count >= 0);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workspace_billing_profiles_refill_last_error_check'
  ) THEN
    ALTER TABLE public.workspace_billing_profiles
      ADD CONSTRAINT workspace_billing_profiles_refill_last_error_check
      CHECK (refill_last_error IS NULL OR char_length(refill_last_error) <= 300);
  END IF;
END;
$$;

-- The tick's page order: never-tried first, then longest since its last try.
CREATE INDEX IF NOT EXISTS workspace_billing_profiles_refill_queue_idx
  ON public.workspace_billing_profiles (last_refill_attempt_at ASC NULLS FIRST, workspace_id)
  WHERE refill_threshold_credits IS NOT NULL AND stripe_customer_id IS NOT NULL;

-- A subscription created in the Stripe dashboard carries none of our
-- metadata; the customer is the only thing that names the workspace.
CREATE INDEX IF NOT EXISTS workspace_billing_profiles_stripe_customer_idx
  ON public.workspace_billing_profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

-- One lot per payment. A refund names the payment, so two lots answering to
-- one PaymentIntent would leave it ambiguous which one to take back.
CREATE UNIQUE INDEX IF NOT EXISTS workspace_credit_lots_stripe_payment_ref_uidx
  ON public.workspace_credit_lots (stripe_payment_ref)
  WHERE stripe_payment_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Take back the unspent part of one purchased lot.
--
-- The amount is cumulative, because Stripe's charge.refunded carries the
-- total refunded so far rather than this refund's share: the target is the
-- part of the lot those refunded cents bought, less what earlier refunds and
-- disputes on the same lot already removed. A NULL p_refunded_cents means the
-- whole lot (a dispute withdraws the payment in full).
--
-- Only this lot is touched, and never below zero: credits already spent are
-- gone, and taking them from another lot would charge the customer for a
-- different purchase. The shortfall is reported so the caller can say so.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_workspace_credit_lot_v1(
  p_payment_ref TEXT,
  p_refunded_cents BIGINT,
  p_charged_cents BIGINT,
  p_reference_kind TEXT,
  p_reference_id TEXT,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  lot public.workspace_credit_lots%ROWTYPE;
  existing_entry public.workspace_credit_ledger%ROWTYPE;
  target INTEGER;
  already_reversed INTEGER;
  wanted INTEGER;
  taken INTEGER;
  new_entry_id UUID;
  new_balance BIGINT;
BEGIN
  IF p_payment_ref IS NULL OR char_length(btrim(p_payment_ref)) = 0 THEN
    RAISE EXCEPTION 'payment reference is required';
  END IF;
  IF p_reference_kind IS NULL OR p_reference_kind NOT IN ('stripe_refund', 'stripe_dispute') THEN
    RAISE EXCEPTION 'reference kind is invalid';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(btrim(p_idempotency_key)) = 0 THEN
    RAISE EXCEPTION 'idempotency key is required';
  END IF;
  IF p_refunded_cents IS NOT NULL AND p_refunded_cents < 0 THEN
    RAISE EXCEPTION 'refunded amount is invalid';
  END IF;

  SELECT * INTO lot
  FROM public.workspace_credit_lots
  WHERE stripe_payment_ref = p_payment_ref
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  SELECT * INTO existing_entry
  FROM public.workspace_credit_ledger
  WHERE workspace_id = lot.workspace_id
    AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'found', true,
      'idempotent', true,
      'workspace_id', lot.workspace_id,
      'lot_id', lot.id,
      'removed', abs(existing_entry.amount),
      'already_spent', 0
    );
  END IF;

  IF p_refunded_cents IS NULL
    OR p_charged_cents IS NULL
    OR p_charged_cents <= 0
    OR p_refunded_cents >= p_charged_cents THEN
    target := lot.granted;
  ELSE
    -- Rounded down: a partial refund never takes back more than it paid for.
    target := floor(lot.granted::numeric * p_refunded_cents / p_charged_cents)::INTEGER;
  END IF;

  SELECT COALESCE(SUM(-amount), 0)::INTEGER INTO already_reversed
  FROM public.workspace_credit_ledger
  WHERE workspace_id = lot.workspace_id
    AND lot_id = lot.id
    AND entry_type = 'adjustment'
    AND reference_kind IN ('stripe_refund', 'stripe_dispute');

  wanted := GREATEST(target - already_reversed, 0);
  taken := LEAST(wanted, lot.remaining);

  IF taken > 0 THEN
    UPDATE public.workspace_credit_lots
    SET remaining = remaining - taken
    WHERE id = lot.id;

    INSERT INTO public.workspace_credit_ledger (
      workspace_id, entry_type, amount, lot_id,
      reference_kind, reference_id, actor_user_id,
      idempotency_key, lot_breakdown
    )
    VALUES (
      lot.workspace_id, 'adjustment', -taken, lot.id,
      p_reference_kind, left(p_reference_id, 120), NULL,
      p_idempotency_key, jsonb_build_array(jsonb_build_object('lot_id', lot.id, 'removed', taken))
    )
    RETURNING id INTO new_entry_id;
  END IF;

  SELECT COALESCE(SUM(remaining), 0) INTO new_balance
  FROM public.workspace_credit_lots
  WHERE workspace_id = lot.workspace_id
    AND remaining > 0
    AND (expires_at IS NULL OR expires_at > now());

  RETURN jsonb_build_object(
    'found', true,
    'idempotent', false,
    'workspace_id', lot.workspace_id,
    'lot_id', lot.id,
    'entry_id', new_entry_id,
    'removed', taken,
    'already_spent', wanted - taken,
    'balance', new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_workspace_credit_lot_v1(TEXT, BIGINT, BIGINT, TEXT, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_workspace_credit_lot_v1(TEXT, BIGINT, BIGINT, TEXT, TEXT, TEXT)
  TO service_role;

COMMENT ON FUNCTION public.reverse_workspace_credit_lot_v1 IS
  'Removes the unspent part of the credit lot a Stripe payment bought, proportional to the cumulative amount refunded (NULL = all). Never below zero, never from another lot. Idempotent per (workspace, idempotency_key).';

COMMIT;
