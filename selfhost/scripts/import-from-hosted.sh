#!/bin/sh
# One-time data migration: hosted Supabase project -> local selfhost stack.
# Copies user accounts (auth.users + auth.identities, password hashes intact)
# and all game data. The local schema must already exist (apply-migrations.sh).
#
# Usage:
#   SOURCE_DB_URL='postgresql://postgres.<project-ref>:<db-password>@<pooler-host>:5432/postgres' \
#     ./scripts/import-from-hosted.sh
#
# Get the URL from the hosted dashboard: Connect -> Session pooler connection
# string. A paused project must be restored in the dashboard first.
#
# NOTE: rows are appended. Running against a non-empty local database with
# overlapping ids fails on primary keys; reset first if re-running
# (docker compose down && rm -rf volumes/db/data && ... full bootstrap).
set -eu
: "${SOURCE_DB_URL:?Set SOURCE_DB_URL to the hosted project connection string}"
cd "$(dirname "$0")/.."

DUMP=$(mktemp -t topologic-hosted-dump)
trap 'rm -f "$DUMP"' EXIT

echo "dumping hosted data (pg_dump 17 client in docker)..."
docker run --rm postgres:17 pg_dump "$SOURCE_DB_URL" \
  --data-only --disable-triggers --no-owner --no-privileges \
  -t auth.users -t auth.identities \
  -t public.profiles -t public.games -t public.moves \
  -t public.friendships -t public.snake_scores \
  > "$DUMP"
echo "dump size: $(wc -c < "$DUMP") bytes"

# supabase_admin (superuser) so the dump's DISABLE TRIGGER lines are allowed;
# this also skips the profiles signup trigger during the auth.users copy.
echo "importing into supabase-db..."
docker exec -i supabase-db psql -U supabase_admin -d postgres -v ON_ERROR_STOP=1 -1 -f - < "$DUMP"

echo "imported row counts:"
docker exec supabase-db psql -U postgres -d postgres -c \
  "select 'auth.users' as tbl, count(*) from auth.users
   union all select 'profiles', count(*) from public.profiles
   union all select 'games', count(*) from public.games
   union all select 'moves', count(*) from public.moves
   union all select 'friendships', count(*) from public.friendships
   union all select 'snake_scores', count(*) from public.snake_scores;"
echo "STATUS: import complete (sessions are not migrated - players sign in again)"
