#!/usr/bin/env bash
# Sprint 6A database verification on a DISPOSABLE local container. Never touches the
# hosted Supabase project: it has no connection details for it and publishes no port.
#
#   bash tests/chat-db-verify.sh            # migrations + integration + concurrency
#
# Needs Docker and the Supabase Postgres image. The container is removed at the end.
set -euo pipefail
export MSYS_NO_PATHCONV=1

IMAGE="${PENGUIN_TEST_PG_IMAGE:-public.ecr.aws/supabase/postgres:17.11.0.002}"
NAME=penguin-chat-test
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
docker cp "$ROOT/tests/chat-integration.sql" "$NAME:/work/tests/" >/dev/null
docker cp "$ROOT/tests/chat-realtime-integration.sql" "$NAME:/work/tests/" >/dev/null
docker cp "$ROOT/tests/chat-concurrency.sh" "$NAME:/work/tests/" >/dev/null

echo "== migrations =="
for file in $(ls "$ROOT/supabase/migrations" | sort); do
  psql_as -f "/work/supabase/migrations/$file" >/dev/null
  echo "applied $file"
done

echo "== integration =="
if ! psql_as -f /work/tests/chat-integration.sql >/tmp/penguin-chat-integration.log 2>&1; then
  grep -E 'ERROR|NOTICE|assertion' /tmp/penguin-chat-integration.log | tail -20
  echo "chat integration: FAILED"
  exit 1
fi
grep -q 'chat integration: all assertions passed' /tmp/penguin-chat-integration.log
echo "assertions run: $(grep -c 'select public.test_assert(' "$ROOT/tests/chat-integration.sql")"
echo "chat integration: all assertions passed"

echo "== realtime integration (Sprint 6B) =="
if ! psql_as -f /work/tests/chat-realtime-integration.sql >/tmp/penguin-chat-realtime.log 2>&1; then
  grep -E 'ERROR|NOTICE|assertion' /tmp/penguin-chat-realtime.log | tail -20
  echo "chat realtime integration: FAILED"
  exit 1
fi
grep -q 'chat realtime integration: all assertions passed' /tmp/penguin-chat-realtime.log
echo "assertions run: $(grep -c 'select public.test_assert(' "$ROOT/tests/chat-realtime-integration.sql")"
echo "chat realtime integration: all assertions passed"

echo "== concurrency =="
docker exec "$NAME" bash /work/tests/chat-concurrency.sh
