#!/bin/sh
# Applies ../supabase/migrations/*.sql (filename order) to the local stack's
# Postgres. Idempotent: applied versions are recorded in
# supabase_migrations.schema_migrations, the same bookkeeping table the
# Supabase CLI uses, so `supabase db push` tooling stays compatible.
#
# Runs as `supabase_admin` (superuser in the image): the init migration
# creates a trigger on auth.users (owned by supabase_auth_admin, so the
# non-superuser `postgres` role cannot), and the image's ALTER DEFAULT
# PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public still grant
# anon/authenticated/service_role on every created table, so PostgREST works.
set -eu
cd "$(dirname "$0")/.."
MIGRATIONS_DIR=../supabase/migrations

pg() { docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 "$@"; }

pg <<'SQL'
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
-- The realtime service reads from this publication; the migrations add tables
-- to it and fail if it does not exist yet.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
SQL

for f in "$MIGRATIONS_DIR"/*.sql; do
  base=$(basename "$f" .sql)
  version=${base%%_*}
  name=${base#*_}
  applied=$(pg -tAc "select 1 from supabase_migrations.schema_migrations where version = '$version'")
  if [ "$applied" = "1" ]; then
    echo "skip  $base (already applied)"
    continue
  fi
  echo "apply $base"
  pg -1 -f - < "$f"
  pg -q -c "insert into supabase_migrations.schema_migrations (version, name) values ('$version', '$name')"
done
echo "STATUS: migrations complete"
