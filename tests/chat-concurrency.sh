#!/usr/bin/env bash
# Concurrency checks for the Sprint 6A chat functions. Runs INSIDE the disposable
# test container (see tests/chat-db-verify.sh) after the migrations are applied.
# Every "session" is a separate psql process acting as one signed-in student.
set -uo pipefail

PSQL=(psql -U postgres -h localhost -d postgres -At -v VERBOSITY=verbose -v ON_ERROR_STOP=1)
failures=0
check() { if [ "$1" = "$2" ]; then echo "PASS  $3"; else echo "FAIL  $3 (expected '$2', got '$1')"; failures=$((failures + 1)); fi; }
admin() { "${PSQL[@]}" -c "$1" 2>&1; }
# Runs statements as a signed-in student in its own session.
as_user() {
  local user="$1"; shift
  "${PSQL[@]}" -c "set role authenticated;
    select set_config('request.jwt.claim.sub', '$user', false);
    select set_config('request.jwt.claims', json_build_object('sub', '$user', 'role', 'authenticated')::text, false);
    $*" 2>&1
}
uid() { printf '00000000-0000-4000-8000-0000000009%02d' "$1"; }
mid() { printf '00000000-0000-4000-8000-00000009%02d%02d' "$1" "$2"; }

admin "insert into auth.users (id) select ('00000000-0000-4000-8000-0000000009' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 12) n;
  update public.profiles p set username = 'conc_' || right(replace(p.id::text, '-', ''), 6), display_name = 'Concurrent',
    institution_id = (select id from public.institutions order by slug limit 1),
    field_id = (select id from public.fields order by slug limit 1),
    study_level = 'undergraduate', onboarding_completed = true
  where p.id::text like '00000000-0000-4000-8000-0000000009%';" >/dev/null
work="$(mktemp -d)"

# --- 1. Concurrent conversation creation --------------------------------------------
a="$(uid 1)"; b="$(uid 2)"
for n in 1 2 3 4 5 6; do
  if [ $((n % 2)) = 0 ]; then as_user "$a" "select public.get_or_create_conversation('$b');" | tail -1 >"$work/create.$n" &
  else as_user "$b" "select public.get_or_create_conversation('$a');" | tail -1 >"$work/create.$n" & fi
done
wait
check "$(cat "$work"/create.* | sort -u | wc -l | tr -d ' ')" "1" "six simultaneous creations from both sides return one conversation id"
check "$(admin "select count(*) from public.conversations where '$a' in (user_low, user_high) and '$b' in (user_low, user_high)")" "1" \
  "exactly one conversation row exists for the pair"

# --- 2. Concurrent sends with the same message identifier ---------------------------
conv="$(cat "$work/create.1")"
for n in 1 2 3 4 5 6; do
  as_user "$a" "select idempotent_replay from public.send_message_idempotent('$(mid 1 1)', '$conv', 'same message');" | tail -1 >"$work/same.$n" &
done
wait
check "$(admin "select count(*) from public.messages where id = '$(mid 1 1)'")" "1" "six simultaneous sends of one identifier store one message"
check "$(cat "$work"/same.* | grep -c '^f$')" "1" "exactly one of them was the original"
check "$(cat "$work"/same.* | grep -c '^t$')" "5" "the other five were answered as replays"

# --- 3. Rate limit under parallel requests ------------------------------------------
c="$(uid 3)"; d="$(uid 4)"
conv2="$(as_user "$c" "select public.get_or_create_conversation('$d');" | tail -1)"
as_user "$c" "select count(*) from generate_series(1, 25) n, lateral public.send_message_idempotent(
  ('00000000-0000-4000-8000-00000009' || '02' || lpad(n::text, 2, '0'))::uuid, '$conv2', 'warm up ' || n);" >/dev/null
for n in $(seq 1 20); do
  as_user "$c" "select id from public.send_message_idempotent('$(mid 3 "$n")', '$conv2', 'burst $n');" >"$work/burst.$n" &
done
wait
check "$(admin "select count(*) from public.messages where sender_id = '$c'")" "30" "25 stored + 20 simultaneous sends leave exactly 30 messages"
check "$(grep -l 'PC002' "$work"/burst.* | wc -l | tr -d ' ')" "15" "the 15 over the limit were refused with PC002"
check "$(admin "select last_message_at = (select max(created_at) from public.messages where conversation_id = '$conv2') from public.conversations where id = '$conv2'")" "t" \
  "the summary matches the newest stored message"
check "$(admin "select count(distinct created_at) from public.messages where conversation_id = '$conv2'")" "30" "every message in the conversation has its own timestamp"

# --- 4. Block committed while a send is waiting --------------------------------------
e="$(uid 5)"; f="$(uid 6)"
conv3="$(as_user "$e" "select public.get_or_create_conversation('$f');" | tail -1)"
as_user "$e" "begin; select public.block_user('$f'); select pg_sleep(4); commit;" >/dev/null &
sleep 1
started=$(date +%s)
as_user "$f" "select id from public.send_message_idempotent('$(mid 4 1)', '$conv3', 'racing the block');" >"$work/race1"
waited_s=$(( $(date +%s) - started ))
wait
check "$(grep -c 'PC001' "$work/race1")" "1" "a send that waited for an uncommitted block is refused once the block commits"
check "$([ "$waited_s" -ge 2 ] && echo waited || echo "returned after ${waited_s}s")" "waited" "that send waited for the blocker's transaction"
check "$(admin "select count(*) from public.messages where conversation_id = '$conv3'")" "0" "no message was stored"

# --- 5. Send committed while a block is waiting --------------------------------------
g="$(uid 7)"; h="$(uid 8)"
conv4="$(as_user "$g" "select public.get_or_create_conversation('$h');" | tail -1)"
as_user "$h" "begin; select id from public.send_message_idempotent('$(mid 5 1)', '$conv4', 'sent first'); select pg_sleep(4); commit;" >/dev/null &
sleep 1
started=$(date +%s)
as_user "$g" "select public.block_user('$h');" >/dev/null
waited_s=$(( $(date +%s) - started ))
wait
check "$([ "$waited_s" -ge 2 ] && echo waited || echo "returned after ${waited_s}s")" "waited" "a block waits for a send already in progress for the pair"
check "$(admin "select count(*) from public.messages where conversation_id = '$conv4'")" "1" "the message that got there first is stored"
as_user "$h" "select id from public.send_message_idempotent('$(mid 5 2)', '$conv4', 'after the block');" >"$work/race2"
check "$(grep -c 'PC001' "$work/race2")" "1" "every later send is refused"
as_user "$g" "select id from public.send_message_idempotent('$(mid 5 3)', '$conv4', 'blocker tries');" >"$work/race3"
check "$(grep -c 'PC001' "$work/race3")" "1" "the blocker cannot send either"

# --- 6. Conversation limit under parallel requests -----------------------------------
i="$(uid 9)"
admin "insert into auth.users (id) select ('00000000-0000-4000-8000-0000000008' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 30) n;
  update public.profiles p set username = 'tgt_' || right(replace(p.id::text, '-', ''), 6), display_name = 'Target',
    institution_id = (select id from public.institutions order by slug limit 1),
    field_id = (select id from public.fields order by slug limit 1),
    study_level = 'undergraduate', onboarding_completed = true
  where p.id::text like '00000000-0000-4000-8000-0000000008%';" >/dev/null
for n in $(seq 1 30); do
  as_user "$i" "select public.get_or_create_conversation('$(printf '00000000-0000-4000-8000-0000000008%02d' "$n")');" >"$work/limit.$n" &
done
wait
check "$(admin "select count(*) from public.conversations where created_by = '$i'")" "20" "30 simultaneous new conversations leave exactly 20"
check "$(grep -l 'PC002' "$work"/limit.* | wc -l | tr -d ' ')" "10" "the 10 over the limit were refused with PC002"

rm -rf "$work"
if [ "$failures" -gt 0 ]; then echo "chat concurrency: $failures check(s) FAILED"; exit 1; fi
echo "chat concurrency: all checks passed"
