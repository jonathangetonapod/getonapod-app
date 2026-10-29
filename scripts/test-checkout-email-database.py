#!/usr/bin/env python3
"""Exercise actual checkout email claims in isolated Postgres, no production access."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = f"goap-checkout-mail-test-{uuid.uuid4().hex[:12]}"
WORKSPACE = "11111111-1111-4111-8111-111111111111"
SCOPE = "a" * 64
PAYLOAD = "b" * 64


def sql(statement, *, role="service_role", error=None):
    prefix = f"SET ROLE {role}; " if role else ""
    result = subprocess.run(
        ["docker", "exec", "-i", CONTAINER, "psql", "-U", "postgres", "-qAt", "-v", "ON_ERROR_STOP=1"],
        input=prefix + statement, text=True, capture_output=True,
    )
    if error:
        assert result.returncode and error in result.stderr, result.stderr
        return None
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def claim(action, scope=SCOPE, payload=PAYLOAD):
    return f"SELECT public.claim_workspace_checkout_email_v1('{WORKSPACE}', '{action}', '{scope}', '{payload}');"


def complete(action, owner, status="sent", message="gmail-123"):
    return f"SELECT public.complete_workspace_checkout_email_v1('{WORKSPACE}', '{action}', '{owner}', '{status}', '{message}');"


def parallel(statements):
    with ThreadPoolExecutor(max_workers=12) as pool:
        return list(pool.map(lambda statement: json.loads(sql(statement)), statements))


try:
    subprocess.run(["docker", "run", "--rm", "-d", "--network", "none", "--name", CONTAINER,
                    "-e", "POSTGRES_PASSWORD=local-checkout-mail-test", "postgres:16-alpine"],
                   check=True, stdout=subprocess.DEVNULL)
    for _ in range(100):
        if subprocess.run(["docker", "exec", CONTAINER, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(0.1)
    else:
        raise RuntimeError("Postgres did not become ready")
    sql(f"""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.workspaces(id uuid PRIMARY KEY);
      INSERT INTO public.workspaces VALUES ('{WORKSPACE}');""", role=None)
    sql((ROOT / "supabase/migrations/20261031000800_workspace_checkout_email_operations.sql").read_text(), role=None)

    action = str(uuid.uuid4())
    receipts = parallel([claim(action)] * 12)
    owners = [r for r in receipts if r["outcome"] == "claimed"]
    assert len(owners) == 1
    assert all("owner_token" not in r for r in receipts if r["outcome"] != "claimed")
    owner = owners[0]["owner_token"]
    assert sql("SELECT count(*) FROM public.workspace_checkout_email_operations;", role=None) == "1"
    assert json.loads(sql(claim(action, payload="c" * 64))) == {"outcome": "conflict"}
    other_actions = [str(uuid.uuid4()) for _ in range(12)]
    assert all(r["outcome"] == "blocked" for r in parallel([claim(a) for a in other_actions]))
    sql(complete(action, str(uuid.uuid4())), error="CHECKOUT_EMAIL_RESULT_CONFLICT")
    sql(complete(action, owner, message=""), error="CHECKOUT_EMAIL_INVALID_RESULT")
    # Receipt failure must leave sending held, never release permission to resend.
    sql("""CREATE FUNCTION public.reject_mail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      RAISE EXCEPTION 'receipt unavailable'; END $$;
      CREATE TRIGGER reject_mail_receipt BEFORE UPDATE ON public.workspace_checkout_email_operations
      FOR EACH ROW EXECUTE FUNCTION public.reject_mail_receipt();""", role=None)
    sql(complete(action, owner), error="receipt unavailable")
    assert json.loads(sql(claim(other_actions[0])))["outcome"] == "blocked"
    sql("DROP TRIGGER reject_mail_receipt ON public.workspace_checkout_email_operations; DROP FUNCTION public.reject_mail_receipt();", role=None)
    assert json.loads(sql(complete(action, owner))) == {"status": "sent"}
    assert json.loads(sql(complete(action, owner))) == {"status": "sent"}
    sql(complete(action, owner, "failed"), error="CHECKOUT_EMAIL_RESULT_CONFLICT")
    assert json.loads(sql(claim(action)))["status"] == "sent"
    assert json.loads(sql(f"SELECT public.workspace_checkout_email_outcome_v1('{WORKSPACE}', '{action}');")) == {"status": "sent"}
    print("PASS: 12 concurrent same-action claims, immutable payload, owner-only completion, failed receipt hold, receipt replay.")

    # A known result permits a new deliberate send, but concurrent new actions
    # still compete for one scope and receive only one send owner.
    actions = [str(uuid.uuid4()) for _ in range(12)]
    receipts = parallel([claim(a) for a in actions])
    winners = [(a, r) for a, r in zip(actions, receipts) if r["outcome"] == "claimed"]
    assert len(winners) == 1
    held_action, held = winners[0]
    assert json.loads(sql(complete(held_action, held["owner_token"], "unknown"))) == {"status": "unknown"}
    sql("UPDATE public.workspace_checkout_email_operations SET created_at=now()-interval '90 days';", role=None)
    assert json.loads(sql(claim(str(uuid.uuid4()))))["outcome"] == "blocked"
    assert json.loads(sql(claim(held_action)))["status"] == "unknown"
    sql(complete(held_action, held["owner_token"], "sent"), error="CHECKOUT_EMAIL_RESULT_CONFLICT")
    new_url_action = str(uuid.uuid4())
    assert json.loads(sql(claim(new_url_action, scope="d" * 64)))["outcome"] == "claimed"
    print("PASS: intentional resend after confirmed send, 12 competing new actions, unknown hold after 90 days, no late overwrite, new checkout scope.")

    for terminal in ["failed", "skipped"]:
        scope = ("e" if terminal == "failed" else "f") * 64
        a = str(uuid.uuid4())
        receipt = json.loads(sql(claim(a, scope)))
        assert json.loads(sql(complete(a, receipt["owner_token"], terminal)))["status"] == terminal
        assert json.loads(sql(claim(str(uuid.uuid4()), scope)))["outcome"] == "claimed"
    for denied in ["anon", "authenticated"]:
        sql(claim(str(uuid.uuid4())), role=denied, error="permission denied")
        sql(f"SELECT public.workspace_checkout_email_outcome_v1('{WORKSPACE}', '{action}');", role=denied, error="permission denied")
    for denied in ["anon", "authenticated", "service_role"]:
        sql("SELECT * FROM public.workspace_checkout_email_operations;", role=denied, error="permission denied")
        sql("DELETE FROM public.workspace_checkout_email_operations;", role=denied, error="permission denied")
    columns = sql("SELECT column_name FROM information_schema.columns WHERE table_name='workspace_checkout_email_operations';", role=None)
    assert "recipient" not in columns and "url" not in columns
    print("PASS: known failure/skip permits deliberate new action; role isolation; no raw recipient or checkout URL columns.")
finally:
    subprocess.run(["docker", "rm", "-f", CONTAINER], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
