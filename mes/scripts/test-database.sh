#!/usr/bin/env bash
set -euo pipefail
mes_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
container="th-mes-sql-test-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
# Disposable local test password, never used for any real project.
docker run -d --name "$container" -e POSTGRES_PASSWORD=local-test-only -e POSTGRES_DB=mes_test postgres:17-alpine >/dev/null
ready=false
for attempt in {1..30}; do
  if docker exec "$container" pg_isready -h 127.0.0.1 -U postgres -d mes_test >/dev/null 2>&1; then ready=true; break; fi
  sleep 1
done
if [[ "$ready" != true ]]; then docker logs "$container"; exit 1; fi
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 <<'SQL'
create schema extensions;
create role anon;
create role authenticated;
create role service_role;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
SQL
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/supabase/migrations/202610150001_mes.sql"
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/supabase/migrations/202610160001_tester.sql"
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/tests/supabase.sql"
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/tests/tester.sql"

docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/supabase/migrations/202610160002_feedback_experience.sql"
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/tests/feedback.sql"
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/supabase/migrations/202610160003_rich_feedback.sql"
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/tests/rich.sql"
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/supabase/migrations/202610160004_accounts.sql"
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/tests/accounts.sql"
# Prove SQL Editor installer upgrades an existing database and can be rerun.
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 <<'SQL'
insert into mes_private.records(collection,id,data) values('installer-check','preserved','{"keep":true}');
insert into mes_private.records(collection,id,data) values('users','installer-sentinel','{"username":"installer.sentinel","displayName":"Keep Profile","active":true}');
insert into mes_private.credentials(uid,password_hash,revision) values('installer-sentinel',extensions.crypt('sentinel-password',extensions.gen_salt('bf',10)),19);
insert into mes_private.sessions(hash,uid,username,expires_at,auth_method,credential_version) values('installer-sentinel-session','installer-sentinel','installer.sentinel',now()+interval '1 hour','password',19);
SQL
for attempt in 1 2; do
  docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/supabase/install-accounts.sql" > /dev/null
  docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 < "$mes_root/tests/accounts.sql"
done
docker exec -i "$container" psql -U postgres -d mes_test -v ON_ERROR_STOP=1 <<'SQL'
do $$ begin
 assert exists(select 1 from mes_private.records where collection='installer-check' and id='preserved' and data->>'keep'='true');
 assert exists(select 1 from mes_private.credentials where uid='installer-sentinel' and revision=19 and extensions.crypt('sentinel-password',password_hash)=password_hash);
 assert exists(select 1 from mes_private.records where collection='users' and id='installer-sentinel' and data->>'displayName'='Keep Profile');
 assert exists(select 1 from mes_private.sessions where hash='installer-sentinel-session' and credential_version=19);
end $$;
SQL
# The same consolidated installer must also work without any MES tables.
docker exec "$container" createdb -U postgres mes_fresh
docker exec -i "$container" psql -U postgres -d mes_fresh -v ON_ERROR_STOP=1 <<'SQL'
create schema extensions;
create schema storage;
create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
SQL
docker exec -i "$container" psql -U postgres -d mes_fresh -v ON_ERROR_STOP=1 < "$mes_root/supabase/install-accounts.sql" > /dev/null
docker exec -i "$container" psql -U postgres -d mes_fresh -v ON_ERROR_STOP=1 < "$mes_root/tests/accounts.sql"
