from pathlib import Path
import subprocess
import os
import uuid
os.chdir(Path(__file__).resolve().parents[1])
name='goap-contact-save-test-'+uuid.uuid4().hex[:10]
subprocess.run(['docker','run','--rm','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:16'],check=True,capture_output=True)
try:
 import time
 for _ in range(30):
  if subprocess.run(['docker','exec',name,'pg_isready','-U','postgres'],capture_output=True).returncode==0:break
  time.sleep(.2)
 base=Path('supabase/migrations/20260725000300_global_podcast_catalog.sql').read_text();table=base[base.index('CREATE TABLE public.podcast_direct_contacts'):base.index('COMMENT ON TABLE public.podcast_catalog_contributions')]
 setup="""CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE TABLE public.workspaces(id uuid PRIMARY KEY,status text);
 CREATE TABLE public.podcasts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),podscan_id text UNIQUE);
 """+table
 migration=Path('supabase/migrations/20261028000300_podcast_contact_identity.sql').read_text()
 checks="""
 INSERT INTO public.workspaces VALUES('00000000-0000-0000-0000-000000000001','active');
 INSERT INTO auth.users VALUES('00000000-0000-0000-0000-000000000002');
 INSERT INTO public.podcasts(podscan_id) VALUES('show_a'),('show_b');
 DO $$
 DECLARE w uuid := '00000000-0000-0000-0000-000000000001'; u uuid := '00000000-0000-0000-0000-000000000002'; r jsonb;
 BEGIN
 PERFORM record_global_podcast_direct_contact_v1('show_a','host@example.com','Old Host','blitz',w,u,'https://www.linkedin.com/in/same-host','2026-10-01');
 PERFORM record_global_podcast_direct_contact_v1('show_b','host@example.com','Old Host','blitz',w,u,'https://www.linkedin.com/in/same-host','2026-10-01');
 IF (SELECT count(*) FROM podcast_direct_contacts) <> 2 THEN RAISE EXCEPTION 'Same host must save on both podcasts'; END IF;
 r:=record_global_podcast_direct_contact_v1('show_a','new@example.com',NULL,'blitz',w,u,'https://www.linkedin.com/in/new-host','2026-10-02');
 IF r->>'host_name' IS NOT NULL OR r->>'provider_reference' <> 'https://www.linkedin.com/in/new-host' THEN RAISE EXCEPTION 'New contact inherited old identity'; END IF;
 r:=record_global_podcast_direct_contact_v1('show_a','old@example.com','Stale name','blitz',w,u,'https://www.linkedin.com/in/stale','2026-09-01');
 IF r->>'email' <> 'new@example.com' OR r->>'host_name' IS NOT NULL OR r->>'provider_reference' <> 'https://www.linkedin.com/in/new-host' THEN RAISE EXCEPTION 'Older lookup overwrote fresh contact'; END IF;
 IF has_function_privilege('authenticated','record_global_podcast_direct_contact_v1(text,text,text,text,uuid,uuid,text,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'Authenticated role can write globally'; END IF;
 END $$;
 """
 p=subprocess.run(['docker','exec','-i',name,'psql','-U','postgres','-v','ON_ERROR_STOP=1'],input=setup+migration+migration+checks,text=True,capture_output=True)
 if p.returncode: print(p.stdout,p.stderr);raise SystemExit(p.returncode)
 print('PASS: migration retry, same-host/multiple-podcast saves, identity replacement, stale result protection, service-only RPC.')
finally:subprocess.run(['docker','stop',name],capture_output=True)
