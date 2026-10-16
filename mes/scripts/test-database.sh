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
