#!/usr/bin/env bash
# Concurrency checks for the Sprint 7A group functions. Runs INSIDE the disposable
# test container (see tests/groups-db-verify.sh) after the migrations are applied.
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
uid() { printf '00000000-0000-4000-8000-0000000007%02d' "$1"; }
rid() { printf '00000000-0000-4000-8000-00000007%02d%02d' "$1" "$2"; }
counts_match() {
  admin "select coalesce(bool_and(g.member_count = (select count(*) from public.group_members m where m.group_id = g.id)), true) from public.groups g"
}

admin "insert into auth.users (id) select ('00000000-0000-4000-8000-0000000007' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 70) n;
  update public.profiles p set username = 'grp_' || right(replace(p.id::text, '-', ''), 6), display_name = 'Concurrent',
    institution_id = (select id from public.institutions order by slug limit 1),
    field_id = (select id from public.fields order by slug limit 1),
    study_level = 'undergraduate', onboarding_completed = true
  where p.id::text like '00000000-0000-4000-8000-0000000007%';" >/dev/null
work="$(mktemp -d)"

# --- 1. One request sent six times at once -------------------------------------------
a="$(uid 1)"
for n in 1 2 3 4 5 6; do
  as_user "$a" "select idempotent_replay from public.create_group_idempotent('$(rid 1 1)', 'Same Request', null);" | tail -1 >"$work/same.$n" &
done
wait
check "$(admin "select count(*) from public.groups where name = 'Same Request'")" "1" "six simultaneous sends of one request store one group"
check "$(cat "$work"/same.* | grep -c '^f$')" "1" "exactly one of them was the original"
check "$(cat "$work"/same.* | grep -c '^t$')" "5" "the other five were answered as replays"
check "$(admin "select count(*) from public.group_members m join public.groups g on g.id = m.group_id where g.name = 'Same Request'")" "1" \
  "the group has exactly one membership, the owner"

# --- 2. Six students create the same name at once ------------------------------------
for n in 2 3 4 5 6 7; do
  # Different letter case and spacing each time: they are all the same name.
  if [ $((n % 2)) = 0 ]; then name='Contested Name'; else name='  contested   NAME '; fi
  as_user "$(uid "$n")" "select id from public.create_group_idempotent('$(rid 2 "$n")', '$name', null);" >"$work/name.$n" &
done
wait
check "$(admin "select count(*) from public.groups where lower(name) = 'contested name'")" "1" "six simultaneous creations of one name store one group"
check "$(grep -l 'PG001' "$work"/name.* | wc -l | tr -d ' ')" "5" "the other five were refused with PG001"
check "$(admin "select count(*) from public.group_members m join public.groups g on g.id = m.group_id where lower(g.name) = 'contested name' and m.role = 'owner'")" "1" \
  "the surviving group has exactly one owner"

# --- 3. Creation limit under parallel requests ---------------------------------------
b="$(uid 8)"
for n in $(seq 1 8); do
  as_user "$b" "select id from public.create_group_idempotent('$(rid 3 "$n")', 'Limit Race $n', null);" >"$work/limit.$n" &
done
wait
check "$(admin "select count(*) from public.groups where creator_id = '$b'")" "3" "8 simultaneous creations leave exactly 3 groups"
check "$(grep -l 'PG002' "$work"/limit.* | wc -l | tr -d ' ')" "5" "the 5 over the limit were refused with PG002"

# --- 4. Twenty students join one group at once ---------------------------------------
crowd="$(as_user "$(uid 9)" "select id from public.create_group_idempotent('$(rid 4 1)', 'Crowded Group', null);" | tail -1)"
for n in $(seq 10 29); do
  as_user "$(uid "$n")" "select already_member from public.join_group('$crowd');" >"$work/join.$n" &
done
wait
check "$(admin "select count(*) from public.group_members where group_id = '$crowd'")" "21" "20 simultaneous joins store 20 members beside the owner"
check "$(admin "select member_count from public.groups where id = '$crowd'")" "21" "the stored count is exact"

# --- 5. One student joins the same group eight times at once -------------------------
c="$(uid 30)"
for n in $(seq 1 8); do
  as_user "$c" "select already_member from public.join_group('$crowd');" | tail -1 >"$work/dup.$n" &
done
wait
check "$(admin "select count(*) from public.group_members where group_id = '$crowd' and user_id = '$c'")" "1" "8 simultaneous joins by one student store one membership"
check "$(cat "$work"/dup.* | grep -c '^f$')" "1" "exactly one of them was the real join"
check "$(admin "select member_count from public.groups where id = '$crowd'")" "22" "the count moved by exactly one"

# --- 6. Joined-groups limit under parallel requests ----------------------------------
d="$(uid 31)"
admin "insert into public.groups (name, client_request_id) select 'Many ' || lpad(n::text, 3, '0'), gen_random_uuid() from generate_series(1, 105) n;" >/dev/null
as_user "$d" "select count(*) from (select public.join_group(g.id) from public.groups g where g.name like 'Many %' and g.name <= 'Many 095') j;" >/dev/null
check "$(admin "select count(*) from public.group_members where user_id = '$d'")" "95" "the student starts in 95 groups"
for n in $(seq 96 105); do
  as_user "$d" "select already_member from public.join_group((select id from public.groups where name = 'Many $(printf '%03d' "$n")'));" >"$work/cap.$n" &
done
wait
check "$(admin "select count(*) from public.group_members where user_id = '$d'")" "100" "10 simultaneous joins from 95 stop at exactly 100"
check "$(grep -l 'PG003' "$work"/cap.* | wc -l | tr -d ' ')" "5" "the 5 over the limit were refused with PG003"

# --- 7. Joins and leaves interleaved --------------------------------------------------
for n in $(seq 32 46); do
  as_user "$(uid "$n")" "select public.join_group('$crowd'); select public.leave_group('$crowd'); select public.join_group('$crowd');" >/dev/null &
done
for n in $(seq 10 19); do
  as_user "$(uid "$n")" "select public.leave_group('$crowd');" >/dev/null &
done
wait
check "$(admin "select count(*) from public.group_members where group_id = '$crowd'")" "27" "after 15 join-leave-join students and 10 leaving, 27 members remain"
check "$(admin "select member_count from public.groups where id = '$crowd'")" "27" "the stored count is exact after the churn"

# --- 8. A join waiting while the owner's account is deleted --------------------------
owner="$(uid 47)"; late="$(uid 48)"
doomed="$(as_user "$owner" "select id from public.create_group_idempotent('$(rid 8 1)', 'Doomed Group', null);" | tail -1)"
admin "begin; delete from auth.users where id = '$owner'; select pg_sleep(4); commit;" >/dev/null &
sleep 1
started=$(date +%s)
as_user "$late" "select already_member from public.join_group('$doomed');" >"$work/race"
waited_s=$(( $(date +%s) - started ))
wait
check "$(grep -c 'PG005' "$work/race")" "1" "a join that waited for the owner's deletion is refused once the group is archived"
check "$([ "$waited_s" -ge 2 ] && echo waited || echo "returned after ${waited_s}s")" "waited" "that join waited for the deleting transaction"
check "$(admin "select status || ':' || member_count from public.groups where id = '$doomed'")" "archived:0" "the group is archived with no members"

# --- 9. A join committed while the owner's deletion waits ----------------------------
owner2="$(uid 49)"; early="$(uid 50)"
kept="$(as_user "$owner2" "select id from public.create_group_idempotent('$(rid 9 1)', 'Kept Group', null);" | tail -1)"
as_user "$early" "begin; select public.join_group('$kept'); select pg_sleep(4); commit;" >/dev/null &
sleep 1
admin "delete from auth.users where id = '$owner2';" >/dev/null
wait
check "$(admin "select status || ':' || member_count from public.groups where id = '$kept'")" "archived:1" \
  "the member who got there first is kept and the group is then archived"

# =====================================================================================
# Sprint 7B: roles, moderation and ownership under concurrent requests
# =====================================================================================
u4() { printf '00000000-0000-4000-8000-0000000004%02d' "$1"; }
admin "insert into auth.users (id) select ('00000000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid from generate_series(1, 99) n;
  update public.profiles p set username = 'adm_' || right(replace(p.id::text, '-', ''), 6), display_name = 'Admin Race',
    institution_id = (select id from public.institutions order by slug limit 1),
    field_id = (select id from public.fields order by slug limit 1),
    study_level = 'undergraduate', onboarding_completed = true
  where p.id::text like '00000000-0000-4000-8000-0000000004%';" >/dev/null
new_group() { as_user "$1" "select id from public.create_group_idempotent(gen_random_uuid(), '$2', null);" | tail -1; }
add_members() { # add_members <group> <role> <first> <last>
  admin "insert into public.group_members (group_id, user_id, role)
    select '$1', ('00000000-0000-4000-8000-0000000004' || lpad(n::text, 2, '0'))::uuid, '$2' from generate_series($3, $4) n;" >/dev/null
}
owners() { admin "select count(*) from public.group_members where group_id = '$1' and role = 'owner'"; }
role_of() { admin "select coalesce((select role from public.group_members where group_id = '$1' and user_id = '$2'), 'none')"; }
# Errors other than the ones a losing request is allowed to get.
unexpected() { grep -h 'ERROR' "$@" 2>/dev/null | grep -vcE "$EXPECTED" || true; }

# --- 10. Two transfers to different admins at once -----------------------------------
o="$(u4 1)"; g10="$(new_group "$o" 'Transfer Race')"; add_members "$g10" admin 2 3
as_user "$o" "select public.transfer_group_ownership('$g10', '$(u4 2)');" >"$work/tr.1" &
as_user "$o" "select public.transfer_group_ownership('$g10', '$(u4 3)');" >"$work/tr.2" &
wait
check "$(owners "$g10")" "1" "two simultaneous transfers leave exactly one owner"
check "$(cat "$work"/tr.* | grep -c '^t$')" "1" "exactly one transfer succeeded"
check "$(grep -l '42501' "$work"/tr.* | wc -l | tr -d ' ')" "1" "the other was refused: its caller was no longer the owner"
check "$(role_of "$g10" "$o")" "admin" "the previous owner is an admin"
check "$(admin "select count(*) from public.group_members where group_id = '$g10' and role = 'admin'")" "2" "and the admin who was not chosen is still an admin"

# --- 11. One transfer sent six times at once -----------------------------------------
o="$(u4 4)"; g11="$(new_group "$o" 'Transfer Repeat')"; add_members "$g11" admin 5 5
for n in 1 2 3 4 5 6; do
  as_user "$o" "select public.transfer_group_ownership('$g11', '$(u4 5)');" >"$work/rep.$n" &
done
wait
check "$(owners "$g11")" "1" "six simultaneous copies of one transfer leave exactly one owner"
check "$(role_of "$g11" "$(u4 5)"):$(role_of "$g11" "$o")" "owner:admin" "the roles were swapped once, not back and forth"
check "$(cat "$work"/rep.* | grep -c '^t$')" "1" "exactly one copy succeeded"
check "$(admin "select count(*) from public.group_admin_events where group_id = '$g11' and action = 'ownership_transferred'")" "1" "and it was logged once"

# --- 12. A transfer racing the demotion of its recipient -----------------------------
EXPECTED='42501|PG012'
for round in 1 2 3 4; do
  o="$(u4 $((5 + round)))"; g12="$(new_group "$o" "Transfer Demote $round")"; add_members "$g12" admin $((9 + round)) $((9 + round))
  as_user "$o" "select public.transfer_group_ownership('$g12', '$(u4 $((9 + round)))');" >"$work/td.$round.a" &
  as_user "$o" "select public.demote_group_admin('$g12', '$(u4 $((9 + round)))');" >"$work/td.$round.b" &
  wait
  check "$(owners "$g12")" "1" "round $round: transfer racing demotion leaves exactly one owner"
done
check "$(unexpected "$work"/td.*)" "0" "the losing request was refused cleanly every time"

# --- 13. Admin cap under parallel promotions -------------------------------------------
o="$(u4 14)"; g13="$(new_group "$o" 'Cap Race')"; add_members "$g13" member 15 29
for n in $(seq 15 29); do
  as_user "$o" "select public.promote_group_member('$g13', '$(u4 "$n")');" >"$work/cap7b.$n" &
done
wait
check "$(admin "select count(*) from public.group_members where group_id = '$g13' and role = 'admin'")" "10" "15 simultaneous promotions leave exactly 10 admins"
check "$(grep -l 'PG011' "$work"/cap7b.* | wc -l | tr -d ' ')" "5" "the 5 over the limit were refused with PG011"

# --- 14. Removal limit under parallel removals -----------------------------------------
o="$(u4 30)"; g14="$(new_group "$o" 'Limit Race 7B')"; add_members "$g14" member 31 60
for n in $(seq 31 60); do
  as_user "$o" "select public.remove_group_member('$g14', '$(u4 "$n")');" >"$work/rm.$n" &
done
wait
check "$(admin "select count(*) from public.group_members where group_id = '$g14'")" "11" "30 simultaneous removals by one actor remove exactly 20"
check "$(grep -l 'PG010' "$work"/rm.* | wc -l | tr -d ' ')" "10" "the 10 over the limit were refused with PG010"
check "$(admin "select member_count from public.groups where id = '$g14'")" "11" "the stored count is exact"
check "$(admin "select count(*) from public.group_admin_events where group_id = '$g14' and action = 'member_removed'")" "20" "exactly 20 removals were logged"

# --- 15. A join waiting while that student is banned -----------------------------------
o="$(u4 61)"; s="$(u4 62)"; g15="$(new_group "$o" 'Ban Then Join')"; add_members "$g15" member 62 62
as_user "$o" "begin; select public.ban_group_member('$g15', '$s'); select pg_sleep(4); commit;" >/dev/null &
sleep 1
started=$(date +%s)
as_user "$s" "select already_member from public.join_group('$g15');" >"$work/banjoin"
waited_s=$(( $(date +%s) - started ))
wait
check "$(grep -c 'PG007' "$work/banjoin")" "1" "a join that waited for an uncommitted ban is refused once the ban commits"
check "$([ "$waited_s" -ge 2 ] && echo waited || echo "returned after ${waited_s}s")" "waited" "that join waited for the banning transaction"
check "$(role_of "$g15" "$s"):$(admin "select count(*) from public.group_bans where group_id = '$g15' and user_id = '$s'")" "none:1" "the student is banned and not a member"

# --- 16. A ban waiting while that student joins ----------------------------------------
o="$(u4 63)"; s="$(u4 64)"; g16="$(new_group "$o" 'Join Then Ban')"
as_user "$s" "begin; select public.join_group('$g16'); select pg_sleep(4); commit;" >/dev/null &
sleep 1
started=$(date +%s)
as_user "$o" "select public.ban_group_member('$g16', '$s');" >"$work/joinban"
waited_s=$(( $(date +%s) - started ))
wait
check "$([ "$waited_s" -ge 2 ] && echo waited || echo "returned after ${waited_s}s")" "waited" "a ban waits for a join already in progress in that group"
check "$(tail -1 "$work/joinban")" "t" "and then bans the student, who by then is a member"
check "$(role_of "$g16" "$s"):$(admin "select count(*) from public.group_bans where group_id = '$g16' and user_id = '$s'"):$(admin "select member_count from public.groups where id = '$g16'")" "none:1:1" \
  "a join and a ban of one student never both stand: banned, not a member, count exact"

# --- 17. Removal racing the member leaving (the lock-order fix) -------------------------
o="$(u4 65)"; g17="$(new_group "$o" 'Remove Or Leave')"; add_members "$g17" member 66 75
for n in $(seq 66 75); do
  as_user "$o" "select public.remove_group_member('$g17', '$(u4 "$n")');" >"$work/rl.$n.a" &
  as_user "$(u4 "$n")" "select public.leave_group('$g17');" >"$work/rl.$n.b" &
done
wait
check "$(admin "select count(*) from public.group_members where group_id = '$g17'")" "1" "ten members each removed and leaving at once are all gone, exactly once"
check "$(admin "select member_count from public.groups where id = '$g17'")" "1" "the stored count is exact"
check "$(cat "$work"/rl.* | grep -ci 'deadlock')" "0" "no removal and leave deadlocked"
EXPECTED='PG008'
check "$(unexpected "$work"/rl.*)" "0" "a removal that lost the race just found nobody"

# --- 18. Removal racing the member's account deletion -----------------------------------
o="$(u4 76)"; g18="$(new_group "$o" 'Remove Or Delete')"; add_members "$g18" member 77 81
for n in $(seq 77 81); do
  as_user "$o" "select public.remove_group_member('$g18', '$(u4 "$n")');" >"$work/rd.$n" 2>&1 &
  admin "delete from auth.users where id = '$(u4 "$n")';" >"$work/rd.$n.del" 2>&1 &
done
wait
# A deadlock here is possible and is cancelled by PostgreSQL; repeat what was cancelled.
for n in $(seq 77 81); do admin "delete from auth.users where id = '$(u4 "$n")';" >/dev/null 2>&1; done
check "$(admin "select count(*) from public.group_members where group_id = '$g18'")" "1" "after removals racing account deletions only the owner is left"
check "$(admin "select member_count from public.groups where id = '$g18'")" "1" "the stored count is exact"
check "$(admin "select count(*) from public.profiles where id in ('$(u4 77)', '$(u4 78)', '$(u4 79)', '$(u4 80)', '$(u4 81)')")" "0" "the accounts are gone"

# --- 19. A transfer waiting while the owner's account is deleted ------------------------
o="$(u4 82)"; a="$(u4 83)"; g19="$(new_group "$o" 'Owner Gone First')"; add_members "$g19" admin 83 83
admin "begin; delete from auth.users where id = '$o'; select pg_sleep(4); commit;" >/dev/null &
sleep 1
as_user "$o" "select public.transfer_group_ownership('$g19', '$a');" >"$work/gone" 2>&1
wait
check "$(admin "select status from public.groups where id = '$g19'"):$(owners "$g19"):$(role_of "$g19" "$a")" "archived:0:admin" \
  "the group is archived with no owner, and the admin was not made owner"
check "$(grep -c '^t$' "$work/gone")" "0" "the transfer did not succeed"

# --- 20. The owner's account deletion waiting while a transfer commits -------------------
o="$(u4 84)"; a="$(u4 85)"; g20="$(new_group "$o" 'Transfer First')"; add_members "$g20" admin 85 85
as_user "$o" "begin; select public.transfer_group_ownership('$g20', '$a'); select pg_sleep(4); commit;" >/dev/null &
sleep 1
admin "delete from auth.users where id = '$o';" >/dev/null 2>&1
wait
admin "delete from auth.users where id = '$o';" >/dev/null 2>&1
check "$(admin "select status from public.groups where id = '$g20'"):$(owners "$g20"):$(role_of "$g20" "$a")" "active:1:owner" \
  "a transfer that committed first keeps the group active under its new owner"
check "$(admin "select member_count from public.groups where id = '$g20'")" "1" "and the previous owner's membership is gone with their account"

check "$(admin "select coalesce(bool_and((select count(*) from public.group_members m where m.group_id = g.id and m.role = 'owner') <= 1), true) from public.groups g")" "t" "no group has two owners"
check "$(admin "select count(*) from public.group_bans b join public.group_members m on m.group_id = b.group_id and m.user_id = b.user_id")" "0" "nobody is both banned from and a member of a group"

check "$(counts_match)" "t" "every stored count equals the real number of members"

rm -rf "$work"
if [ "$failures" -gt 0 ]; then echo "groups concurrency: $failures check(s) FAILED"; exit 1; fi
echo "groups concurrency: all checks passed"
