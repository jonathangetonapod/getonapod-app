#!/usr/bin/env python3
"""Actual operation SQL concurrency in disposable Postgres; no providers or live DB.

Existing domain/auth RPCs use minimal fixtures; operation reservation, dispatch,
completion, notification writers and scheduler are the actual migration006 code.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = 'goap-onboarding-op-test-' + uuid.uuid4().hex[:12]
WORKSPACE = '11111111-1111-4111-8111-111111111111'
INSTANCE = '22222222-2222-4222-8222-222222222222'
ACTOR = '33333333-3333-4333-8333-333333333333'


def sql(statement, role='service_role', error=None):
    prefix = f'SET ROLE {role}; ' if role else ''
    result = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'], input=prefix + statement, text=True, capture_output=True)
    if error:
        assert result.returncode and error in result.stderr, result.stderr
        return None
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def begin(operation, action='resend_invitation', request=None, mutation=None):
    return f"SELECT public.begin_workspace_onboarding_email_operation_v1('{operation}','{WORKSPACE}','{INSTANCE}',{literal(action)},{literal(json.dumps(request or {}))}::jsonb,{literal(json.dumps(mutation or {}))}::jsonb,'{ACTOR}',0);"


def dispatch(operation):
    return f"SELECT public.claim_workspace_onboarding_email_send_v1('{operation}', '{{\"recipient\":\"original@example.test\"}}');"


def complete(operation, outcome='sent'):
    return f"SELECT public.complete_workspace_onboarding_email_operation_v1('{operation}', '{{\"status\":\"{outcome}\",\"providerMessageId\":\"gmail-test\"}}');"


try:
    subprocess.run(['docker', 'run', '--rm', '-d', '--network', 'none', '--name', CONTAINER, '-e', 'POSTGRES_PASSWORD=local-onboarding-test', 'postgres:16-alpine'], check=True, stdout=subprocess.DEVNULL)
    for _ in range(100):
        if subprocess.run(['docker', 'exec', CONTAINER, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(.1)
    else:
        raise RuntimeError('Postgres did not start')
    sql(f"""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE public.workspaces(id uuid PRIMARY KEY,name text DEFAULT 'Agency',status text DEFAULT 'active',is_default boolean DEFAULT false);
      CREATE TABLE public.workspace_onboarding_instances(id uuid PRIMARY KEY, workspace_id uuid, status text DEFAULT 'invited',
        archived_at timestamptz,capability_generation integer DEFAULT 1,capability_expires_at timestamptz DEFAULT now()+interval '1 day',
        recipient_name text DEFAULT 'Client',recipient_email text DEFAULT 'client@example.test',mutation_count integer DEFAULT 0);
      CREATE TABLE public.workspace_onboarding_notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid,instance_id uuid,
        kind text,status text, schedule_offset_days integer DEFAULT 0,attempt_count integer DEFAULT 0, attempted_at timestamptz,sent_at timestamptz,
        provider_message_id text,last_error text,next_attempt_at timestamptz DEFAULT now());
      CREATE FUNCTION public.workspace_onboarding_actor_role_v1(uuid,uuid,bigint) RETURNS text LANGUAGE sql AS $$ SELECT CASE WHEN $2='{ACTOR}' THEN 'owner' ELSE 'member' END $$;
      CREATE FUNCTION public.workspace_onboarding_staff_detail_v1(uuid,uuid,uuid,bigint) RETURNS jsonb LANGUAGE sql AS $$ SELECT to_jsonb(i) FROM public.workspace_onboarding_instances i WHERE id=$2 $$;
      CREATE FUNCTION public.workspace_onboarding_instance_operation_v1(text,uuid,uuid,jsonb,uuid,bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
        DECLARE result jsonb; BEGIN UPDATE public.workspace_onboarding_instances SET mutation_count=mutation_count+1,
          capability_generation=COALESCE(($4->>'capability_generation')::integer,capability_generation)
          WHERE id=$3; SELECT to_jsonb(i) INTO result FROM public.workspace_onboarding_instances i WHERE id=$3; RETURN result; END $$;
      INSERT INTO public.workspaces(id) VALUES ('{WORKSPACE}');
      INSERT INTO public.workspace_onboarding_instances(id,workspace_id) VALUES ('{INSTANCE}','{WORKSPACE}');
      INSERT INTO public.workspace_onboarding_notifications(workspace_id,instance_id,kind,status) VALUES ('{WORKSPACE}','{INSTANCE}','invitation','pending');
      GRANT USAGE ON SCHEMA public TO service_role,anon,authenticated;""", role=None)
    operation_sql = (ROOT / 'supabase/migrations/20261031000700_onboarding_email_operations.sql').read_text()
    operation_sql = operation_sql.split('-- Fence direct/no-email mutations')[0] + '\nCOMMIT;'
    sql(operation_sql, role=None)
    first = str(uuid.uuid4())
    sql(begin(str(uuid.uuid4())), error='DELIVERY_UNCONFIRMED')  # Cannot race initial pending send.
    with ThreadPoolExecutor(max_workers=12) as pool:
        initial = list(pool.map(lambda _: json.loads(sql(begin(first, 'start'))), range(12)))
    assert {row['id'] for row in initial} == {first}
    with ThreadPoolExecutor(max_workers=12) as pool:
        dispatched = list(pool.map(lambda _: json.loads(sql(dispatch(first))), range(12)))
    assert sum(row['claimed'] is True for row in dispatched) == 1
    sql(begin(first, 'start', {'changed': True}), error='EMAIL_OPERATION_CONFLICT')
    sql(begin(str(uuid.uuid4())), error='DELIVERY_UNCONFIRMED')
    assert sql(complete(first)) == 't'
    assert sql(complete(first, 'failed')) == 'f'
    assert json.loads(sql(dispatch(first)))['result']['status'] == 'sent'
    sql(begin(str(uuid.uuid4())), error='ONBOARDING_RESEND_COOLDOWN')
    sql("UPDATE public.workspace_onboarding_notifications SET sent_at=now()-interval '1 hour';", role=None)
    # Distinct simultaneous intentional reminders still reserve one operation.
    ids = [str(uuid.uuid4()) for _ in range(12)]
    def race(operation):
        try:
            return json.loads(sql(begin(operation)))['id']
        except AssertionError as error:
            assert 'DELIVERY_UNCONFIRMED' in str(error)
            return None
    with ThreadPoolExecutor(max_workers=12) as pool:
        winners = [value for value in pool.map(race, ids) if value]
    assert len(winners) == 1
    second = winners[0]
    assert json.loads(sql(dispatch(second)))['claimed'] is True
    # A delayed old result cannot alter the new notification or receipt.
    assert sql(complete(first, 'unknown')) == 'f'
    assert sql('SELECT email_operation_id FROM public.workspace_onboarding_notifications;', role=None) == second
    assert sql(f"SELECT public.record_workspace_onboarding_invitation_v1('{INSTANCE}','failed',NULL,'late old worker');") == 'f'
    assert sql(complete(second)) == 't'
    # Rotate mutations and the frozen snapshot happen once across lost HTTP responses.
    rotation = str(uuid.uuid4())
    rotated = json.loads(sql(begin(rotation, 'rotate', {'expires_in_days': 14}, {'capability_generation': 2})))
    replay = json.loads(sql(begin(rotation, 'rotate', {'expires_in_days': 14}, {'capability_generation': 3})))
    assert rotated['instance_snapshot'] == replay['instance_snapshot']
    assert sql('SELECT mutation_count FROM public.workspace_onboarding_instances;', role=None) == '1'
    assert json.loads(sql(dispatch(rotation)))['claimed'] is True
    assert sql(complete(rotation, 'unknown')) == 't'
    sql("UPDATE public.workspace_onboarding_email_operations SET created_at=now()-interval '10 years';", role=None)
    sql(begin(str(uuid.uuid4())), error='DELIVERY_UNCONFIRMED')
    assert json.loads(sql(dispatch(rotation)))['result']['status'] == 'unknown'
    sql("UPDATE public.workspace_onboarding_notifications SET status='cancelled',last_error=NULL;", role=None)
    assert sql('SELECT status FROM public.workspace_onboarding_notifications;', role=None) == 'unknown'
    for role in ('anon', 'authenticated'):
        sql(begin(first, 'start'), role=role, error='permission denied')
        sql('SELECT * FROM public.workspace_onboarding_email_operations;', role=role, error='permission denied')
    sql('DELETE FROM public.workspace_onboarding_email_operations;', error='permission denied')
    sql(begin(first, 'start').replace(ACTOR, str(uuid.uuid4())), error='manager access required')
    print('PASS operation identity: initial/reminder races, one dispatch, frozen rotate mutation, stale result isolation, unknown hold, role denial.')
    # Scheduler must neither reclaim processing rows nor claim two per instance.
    sql("UPDATE public.workspace_onboarding_email_operations SET state='sent'; UPDATE public.workspace_onboarding_notifications SET status='sent';", role=None)
    sql(f"INSERT INTO public.workspace_onboarding_notifications(workspace_id,instance_id,kind,status,schedule_offset_days) VALUES ('{WORKSPACE}','{INSTANCE}','reminder','pending',3),('{WORKSPACE}','{INSTANCE}','reminder','pending',7);", role=None)
    reminders = json.loads(sql('SELECT public.claim_workspace_onboarding_reminders_v1(50);'))
    assert len(reminders) == 1
    assert reminders[0]['operation_id'] == reminders[0]['notification_id']
    assert reminders[0]['idempotency_key'] == 'onboarding:' + reminders[0]['notification_id']
    sql("UPDATE public.workspace_onboarding_notifications SET attempted_at=now()-interval '10 years' WHERE status='processing';", role=None)
    sql("UPDATE public.workspace_onboarding_notifications SET status='cancelled' WHERE status='processing';", role=None)
    assert sql("SELECT count(*) FROM public.workspace_onboarding_notifications WHERE status='processing';", role=None) == '1'
    assert json.loads(sql('SELECT public.claim_workspace_onboarding_reminders_v1(50);')) == []
    sql(begin(str(uuid.uuid4())), error='DELIVERY_UNCONFIRMED')
    print('PASS scheduler: durable notification identity, one outstanding reminder per instance, no age reclaim, manual-send exclusion.')
finally:
    subprocess.run(['docker', 'rm', '-f', CONTAINER], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
