#!/usr/bin/env python3
"""Exercise checkout locking/CAS and manual credit review SQL in isolated Postgres.

Requires Docker and postgres:16-alpine. No production credentials or ports.
Run: python3 scripts/test-checkout-attempts-database.py
"""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = f"goap-checkout-test-{uuid.uuid4().hex[:12]}"
WORKSPACE = "11111111-1111-4111-8111-111111111111"


def sql(statement, *, role="service_role", expect_error=None):
    prefix = f"SET ROLE {role}; " if role else ""
    result = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"],
        input=prefix + statement, text=True, capture_output=True,
    )
    if expect_error:
        assert result.returncode and expect_error in result.stderr, result.stderr
        return None
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def claim(replace=None, reason=None, price="price_current"):
    replacement = f"'{replace}'" if replace else "NULL"
    disposition = f"'{reason}'" if reason else "NULL"
    return f"""SELECT public.claim_workspace_checkout_attempt_v1(
      '{WORKSPACE}', 'cus_workspace', 'standard', '{price}',
      'https://app.example/success', 'https://app.example/cancel', {replacement}, {disposition});"""


def concurrent_claim(statement):
    with ThreadPoolExecutor(max_workers=12) as pool:
        results = list(pool.map(lambda _: json.loads(sql(statement)), range(12)))
    assert len({row["id"] for row in results}) == 1
    return results[0]


try:
    subprocess.run(
        ["docker", "run", "--rm", "-d", "--network", "none", "--name", CONTAINER,
         "-e", "POSTGRES_PASSWORD=local-checkout-test", "postgres:16-alpine"],
        check=True, stdout=subprocess.DEVNULL,
    )
    for _ in range(100):
        ready = subprocess.run(["docker", "exec", CONTAINER, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if ready.returncode == 0:
            break
        time.sleep(0.1)
    else:
        raise RuntimeError("Postgres did not become ready")
    sql(f"""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
      CREATE TABLE public.workspace_billing_profiles(
        workspace_id uuid PRIMARY KEY REFERENCES public.workspaces,
        stripe_customer_id text, updated_at timestamptz DEFAULT now());
      INSERT INTO public.workspaces VALUES ('{WORKSPACE}');""", role=None)
    sql((ROOT / "supabase/migrations/20261031000300_workspace_checkout_attempts.sql").read_text(), role=None)

    first = concurrent_claim(claim())
    assert sql("SELECT count(*) FROM public.workspace_checkout_attempts;") == "1"
    frozen = json.loads(sql(claim(price="price_changed")))
    assert frozen["id"] == first["id"] and frozen["price_id"] == "price_current"
    sql(f"SELECT public.record_workspace_checkout_session_v1('{WORKSPACE}', '{first['id']}', 'cs_first');")
    sql(f"SELECT public.record_workspace_checkout_session_v1('{WORKSPACE}', '{first['id']}', 'cs_conflict');",
        expect_error="CHECKOUT_SESSION_CONFLICT")
    sql(claim(first["id"], "absent_after_expiry"), expect_error="CHECKOUT_NOT_EXPIRED")

    second = concurrent_claim(claim(first["id"], "expired"))
    assert second["id"] != first["id"]
    assert sql("SELECT count(*) FROM public.workspace_checkout_attempts WHERE retired_at IS NULL;") == "1"
    assert sql("SELECT count(*) FROM public.workspace_checkout_attempts WHERE retired_at IS NOT NULL;") == "1"
    # A late old worker may neither overwrite the session nor rotate the successor.
    sql(f"SELECT public.record_workspace_checkout_session_v1('{WORKSPACE}', '{first['id']}', 'cs_late');",
        expect_error="CHECKOUT_ATTEMPT_UNAVAILABLE")
    assert json.loads(sql(claim(first["id"], "expired")))["id"] == second["id"]
    # Retiring and replacing are atomic: a failed insert preserves the old active row.
    sql(claim(second["id"], "expired", price=""), expect_error="check constraint")
    assert json.loads(sql(claim()))["id"] == second["id"]
    sql("UPDATE public.workspace_checkout_attempts SET created_at=now()-interval '2 hours', expires_at=now()-interval '2 minutes' WHERE retired_at IS NULL;", role=None)
    third = concurrent_claim(claim(second["id"], "absent_after_expiry"))
    assert third["id"] != second["id"]

    assert sql(f"SELECT public.record_workspace_billing_customer_v1('{WORKSPACE}', 'cus_first');") == "cus_first"
    assert sql(f"SELECT public.record_workspace_billing_customer_v1('{WORKSPACE}', 'cus_late');") == "cus_first"
    for denied_role in ("anon", "authenticated"):
        sql(claim(), role=denied_role, expect_error="permission denied")
        sql("SELECT * FROM public.workspace_checkout_attempts;", role=denied_role, expect_error="permission denied")
    sql("DELETE FROM public.workspace_checkout_attempts;", expect_error="permission denied")
    print("Checkout database checks passed: concurrent claims/rotation, frozen params, CAS, atomic rollback, customer identity, role denial.")

    # The manual review records have no financial effect. Exercise the actual
    # migration, not a duplicate model, including more than one API page of lots.
    sql("""CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE public.workspace_credit_lots(workspace_id uuid, source text, remaining bigint);
      GRANT USAGE ON SCHEMA public TO service_role, anon, authenticated;""", role=None)
    sql((ROOT / "supabase/migrations/20261031000400_legacy_credit_reviews.sql").read_text(), role=None)
    sql(f"""INSERT INTO public.workspace_credit_lots
      SELECT '{WORKSPACE}', 'purchase', 1 FROM generate_series(1, 1500);
      INSERT INTO public.workspace_credit_lots VALUES ('{WORKSPACE}', 'promo', 999),
        ('22222222-2222-4222-8222-222222222222', 'purchase', 100);""", role=None)
    balance = f"SELECT public.workspace_purchased_credit_balance_v1('{WORKSPACE}');"
    assert sql(balance) == "1500"
    assert sql("SELECT public.workspace_purchased_credit_balance_v1('33333333-3333-4333-8333-333333333333');") == "0"
    sql(f"INSERT INTO public.workspace_credit_reviews(workspace_id,purchased_remaining_at_request) VALUES ('{WORKSPACE}',1500);")
    sql(f"UPDATE public.workspace_credit_reviews SET status='resolved' WHERE workspace_id='{WORKSPACE}';", expect_error="credit_review_resolution_note")
    sql(f"UPDATE public.workspace_credit_reviews SET status='resolved',resolution_note='short' WHERE workspace_id='{WORKSPACE}';", expect_error="check constraint")
    sql(f"UPDATE public.workspace_credit_reviews SET status='resolved',resolution_note='Manual review completed' WHERE workspace_id='{WORKSPACE}' AND status<>'resolved';")
    sql(f"INSERT INTO public.workspace_credit_reviews(workspace_id,purchased_remaining_at_request) VALUES ('{WORKSPACE}',42) ON CONFLICT (workspace_id) DO NOTHING;")
    assert sql(f"UPDATE public.workspace_credit_reviews SET status='reviewing',resolution_note=NULL WHERE workspace_id='{WORKSPACE}' AND status<>'resolved' RETURNING workspace_id;") == ""
    assert sql(f"SELECT status || ':' || purchased_remaining_at_request || ':' || resolution_note FROM public.workspace_credit_reviews WHERE workspace_id='{WORKSPACE}';") == "resolved:1500:Manual review completed"
    assert sql(balance) == "1500"
    assert sql("SELECT count(*) || ':' || sum(remaining) FROM public.workspace_credit_lots;", role=None) == "1502:2599"
    for denied_role in ("anon", "authenticated"):
        sql(balance, role=denied_role, expect_error="permission denied")
        sql("SELECT * FROM public.workspace_credit_reviews;", role=denied_role, expect_error="permission denied")
    sql("DELETE FROM public.workspace_credit_reviews;", expect_error="permission denied")
    print("Legacy review database checks passed: 1500-lot tenant aggregate, role denial, required resolution, retry preservation, conditional completion, no financial mutation.")
finally:
    subprocess.run(["docker", "rm", "-f", CONTAINER], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
