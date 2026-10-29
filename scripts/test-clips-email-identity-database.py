#!/usr/bin/env python3
"""Check persisted clips mail IDs and the existing rate limits in isolated Postgres."""
from concurrent.futures import ThreadPoolExecutor
import json
from pathlib import Path
import subprocess
import time
import uuid

ROOT = Path(__file__).resolve().parents[1]
CONTAINER = 'goap-clips-mail-test-' + uuid.uuid4().hex[:10]


def sql(statement, role='service_role', denied=False):
    result = subprocess.run(['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-qAt', '-v', 'ON_ERROR_STOP=1'],
                            input=(f'SET ROLE {role};' if role else '') + statement, text=True, capture_output=True)
    if denied:
        assert result.returncode and 'permission denied' in result.stderr, result.stderr
        return None
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def submit(index):
    # All callers share an inbox and source, exercising both advisory locks.
    return json.loads(sql("SELECT public.record_clips_lead_with_receipt_v1('Client', 'same@example.test',"
                          "'https://youtube.com/@show',NULL,NULL,NULL,NULL,NULL,NULL,'shared-ip',5);"))


try:
    subprocess.run(['docker', 'run', '--rm', '-d', '--network', 'none', '--name', CONTAINER,
                    '-e', 'POSTGRES_PASSWORD=local-mail-test', 'postgres:16-alpine'], check=True, stdout=subprocess.DEVNULL)
    for _ in range(100):
        if subprocess.run(['docker', 'exec', CONTAINER, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres'],
                          stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
            break
        time.sleep(0.1)
    else:
        raise RuntimeError('Postgres did not become ready')
    original = (ROOT / 'supabase/migrations/20261024000100_clips_leads.sql').read_text()
    start = original.index('CREATE TABLE IF NOT EXISTS public.clips_leads (')
    table = original[start:original.index('\n);', start) + 3]
    sql('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;' + table, role=None)
    sql((ROOT / 'supabase/migrations/20261031000900_clips_email_operation_identity.sql').read_text(), role=None)
    with ThreadPoolExecutor(max_workers=8) as pool:
        responses = list(pool.map(submit, range(8)))
    saved = [r for r in responses if r['outcome'] != 'rate_limited']
    assert len(saved) == 5
    assert len({r['id'] for r in saved}) == 5, 'distinct saved leads must not share a mail key'
    assert sum(r['outcome'] == 'recorded' for r in saved) == 1, 'one customer confirmation per inbox window'
    assert sum(r['outcome'] == 'recorded_repeat' for r in saved) == 4
    for receipt in saved:
        row = json.loads(sql(f"SELECT row_to_json(c) FROM public.clips_leads c WHERE id='{receipt['id']}';", role=None))
        assert row['created_at'] == receipt['created_at']
        assert row['email'] == 'same@example.test'
    for role in ['anon', 'authenticated']:
        sql("SELECT public.record_clips_lead_with_receipt_v1('X','x@example.test','https://youtube.com/@x',NULL,NULL,NULL,NULL,NULL,NULL,'ip',5);", role=role, denied=True)
    print('Clips email identity SQL passed: unique saved IDs, timestamp provenance, concurrency/rate limits, service-only access.')
finally:
    subprocess.run(['docker', 'rm', '-f', CONTAINER], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
