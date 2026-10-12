#!/usr/bin/env bash
# Sprint 7A database verification on a DISPOSABLE local container. Never touches the
# hosted Supabase project: it has no connection details for it and publishes no port.
#
#   bash tests/groups-db-verify.sh          # migrations + integration + concurrency + rollback
#
# Needs Docker and the Supabase Postgres image. The container is removed at the end.
set -euo pipefail
export MSYS_NO_PATHCONV=1

IMAGE="${PENGUIN_TEST_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.002}"
NAME=penguin-groups-test
# Git Bash needs a Windows-style path for docker cp.
ROOT="$(cd "$(dirname "$0")/.." && (pwd -W 2>/dev/null || pwd))"
psql_as() { docker exec -i "$NAME" psql -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -q "$@"; }

docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD=localonly "$IMAGE" >/dev/null
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true' EXIT
# The image answers queries from a temporary server while it is still initializing,
# then restarts. Wait for the final server, or migrations can be cut off halfway.
for _ in $(seq 1 90); do
  if docker logs "$NAME" 2>&1 | grep -q 'PostgreSQL init process complete' \
     && docker exec "$NAME" psql -U postgres -h localhost -d postgres -Atc 'select 1' >/dev/null 2>&1; then break; fi
  sleep 2
done
sleep 3

docker exec "$NAME" mkdir -p /work/supabase /work/tests
docker cp "$ROOT/supabase/migrations" "$NAME:/work/supabase/" >/dev/null
docker cp "$ROOT/tests/groups-integration.sql" "$NAME:/work/tests/" >/dev/null
docker cp "$ROOT/tests/groups-concurrency.sh" "$NAME:/work/tests/" >/dev/null
docker cp "$ROOT/tests/groups-rollback.sql" "$NAME:/work/tests/" >/dev/null
docker cp "$ROOT/tests/groups-roles-integration.sql" "$NAME:/work/tests/" >/dev/null
docker cp "$ROOT/tests/groups-roles-rollback.sql" "$NAME:/work/tests/" >/dev/null

echo "== migrations =="
for file in $(ls "$ROOT/supabase/migrations" | sort); do
  psql_as -f "/work/supabase/migrations/$file" >/dev/null
  echo "applied $file"
done

echo "== integration =="
if ! psql_as -f /work/tests/groups-integration.sql >/tmp/penguin-groups-integration.log 2>&1; then
  grep -E 'ERROR|NOTICE|assertion' /tmp/penguin-groups-integration.log | tail -20
  echo "groups integration: FAILED"
  exit 1
fi
grep -q 'groups integration: all assertions passed' /tmp/penguin-groups-integration.log
echo "assertions run: $(grep -c 'select public.test_assert(' "$ROOT/tests/groups-integration.sql")"
echo "groups integration: all assertions passed"

echo "== roles integration (Sprint 7B) =="
if ! psql_as -f /work/tests/groups-roles-integration.sql >/tmp/penguin-groups-roles.log 2>&1; then
  grep -E 'ERROR|NOTICE|assertion' /tmp/penguin-groups-roles.log | tail -20
  echo "groups roles integration: FAILED"
  exit 1
fi
grep -q 'groups roles integration: all assertions passed' /tmp/penguin-groups-roles.log
echo "assertions run: $(grep -c 'select public.test_assert(' "$ROOT/tests/groups-roles-integration.sql")"
echo "groups roles integration: all assertions passed"

echo "== concurrency =="
docker exec "$NAME" bash /work/tests/groups-concurrency.sh

# Rehearses the documented rollback on this throwaway database, then applies the
# migration again to prove it can be redeployed afterwards.
echo "== roles rollback rehearsal (Sprint 7B) =="
if ! psql_as -f /work/tests/groups-roles-rollback.sql >/tmp/penguin-groups-roles-rollback.log 2>&1; then
  grep -E 'ERROR|NOTICE|assertion' /tmp/penguin-groups-roles-rollback.log | tail -20
  echo "groups roles rollback: FAILED"
  exit 1
fi
grep -q 'groups roles rollback: all assertions passed' /tmp/penguin-groups-roles-rollback.log
echo "assertions run: $(grep -c 'select public.test_assert(' "$ROOT/tests/groups-roles-rollback.sql")"
echo "groups roles rollback: all assertions passed"

echo "== rollback rehearsal =="
if ! psql_as -f /work/tests/groups-rollback.sql >/tmp/penguin-groups-rollback.log 2>&1; then
  grep -E 'ERROR|NOTICE|assertion' /tmp/penguin-groups-rollback.log | tail -20
  echo "groups rollback: FAILED"
  exit 1
fi
grep -q 'groups rollback: all assertions passed' /tmp/penguin-groups-rollback.log
echo "assertions run: $(grep -c 'select public.test_assert(' "$ROOT/tests/groups-rollback.sql")"
echo "groups rollback: all assertions passed"
psql_as -f /work/supabase/migrations/20261012090000_groups_foundation.sql >/dev/null
[ "$(psql_as -Atc "select to_regclass('public.groups') is not null and to_regclass('public.group_members') is not null")" = "t" ]
echo "migration applied again after the rollback"
# The count-policy migration applies on top of it, as it will on the hosted project.
psql_as -f /work/supabase/migrations/20261013090000_groups_member_count_policy.sql >/dev/null
[ "$(psql_as -Atc "select proargnames[2:5]::text from pg_proc where proname = 'get_group_viewer_summaries'")" = "{group_id,member_count,unavailable_member_count,my_role}" ]
[ "$(psql_as -Atc "select has_function_privilege('authenticated', 'public.get_group_viewer_summaries(uuid[])', 'execute') and not has_function_privilege('anon', 'public.get_group_viewer_summaries(uuid[])', 'execute')")" = "t" ]
echo "count-policy migration applied on top, with the same access"
psql_as -f /work/supabase/migrations/20261014090000_groups_roles_and_moderation.sql >/dev/null
[ "$(psql_as -Atc "select to_regclass('public.group_bans') is not null and to_regclass('public.group_admin_events') is not null and (select count(*) from pg_proc where proname = 'transfer_group_ownership') = 1")" = "t" ]
echo "roles migration applied on top"
# Applying it a second time must fail and change nothing.
if psql_as -f /work/supabase/migrations/20261012090000_groups_foundation.sql >/dev/null 2>&1; then
  echo "applying the migration twice should fail"; exit 1
fi
echo "a second application is refused"
