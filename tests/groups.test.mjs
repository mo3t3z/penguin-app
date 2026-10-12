import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { groupSearchFilters, searchKey, searchTerms, termsFromKey } from '../src/features/discover/search-query.ts';
import {
  appendPage,
  beginLoadMore,
  buildGroupMemberPage,
  buildGroupPage,
  buildMyGroupRowPage,
  completedPage,
  failLoadMore,
  failedPage,
  GROUP_CREATION_LIMIT_PER_DAY,
  GROUP_DESCRIPTION_MAX,
  GROUP_NAME_MAX,
  GROUP_NAME_MIN,
  GROUP_NAME_TAKEN,
  adminActionCopy,
  adminEventText,
  buildGroupBanPage,
  buildGroupEventPage,
  fullGroupRole,
  GROUP_ADMIN_LIMIT,
  GROUP_REMOVALS_PER_HOUR,
  groupAction,
  groupAdminErrors,
  groupBan,
  groupDetailsChanged,
  isGroupStaff,
  memberActions,
  memberRoleBadge,
  groupBadge,
  groupCreateErrors,
  groupCursorFilter,
  groupDescriptionError,
  groupErrorKind,
  groupJoinErrors,
  groupLeaveErrors,
  groupMemberRow,
  groupNameError,
  groupRowLabel,
  hasGroupDraft,
  isGroupUuid,
  JOINED_GROUPS_LIMIT,
  memberCountLabel,
  mergeById,
  myGroupsWithCounts,
  normalizeGroupDescription,
  normalizeGroupName,
  pagedStatus,
  prepareGroupCreateAttempt,
  requireGroupCursor,
  requireGroupPageSize,
  requireGroupUuid,
  showUnavailableMembers,
  UNAVAILABLE_MEMBERS_CAPTION,
  unavailableMemberCount,
  unavailableMembersLabel,
  viewerSummariesById,
  withViewerSummaries,
} from '../src/features/groups/groups.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => existsSync(new URL(path, import.meta.url));
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stamp = (n) => `2026-10-11T10:00:${String(n).padStart(2, '0')}.123456+00:00`;
const group = (n, overrides = {}) => ({
  id: uuid(n), name: `Group ${n}`, description: null, status: 'active', member_count: 1, created_at: stamp(n), ...overrides,
});
// A group as read directly from the table: no member count.
const record = (n, overrides = {}) => ({
  id: uuid(n), name: `Group ${n}`, description: null, status: 'active', created_at: stamp(n), ...overrides,
});
const idOf = (item) => item.id;

const migration = read('../supabase/migrations/20261012090000_groups_foundation.sql');
const countPolicy = read('../supabase/migrations/20261013090000_groups_member_count_policy.sql');
const featureFiles = readdirSync(new URL('../src/features/groups', import.meta.url));
const feature = Object.fromEntries(featureFiles.map((name) => [name, read(`../src/features/groups/${name}`)]));
const screens = [
  'groups-screen.tsx', 'group-screen.tsx', 'group-members-screen.tsx', 'create-group-screen.tsx',
  'edit-group-screen.tsx', 'group-bans-screen.tsx', 'group-history-screen.tsx',
];
const roles = read('../supabase/migrations/20261014090000_groups_roles_and_moderation.sql');

// --- Validation ---------------------------------------------------------------------

test('limits match the agreed rules and the database', () => {
  assert.equal(GROUP_NAME_MIN, 3);
  assert.equal(GROUP_NAME_MAX, 60);
  assert.equal(GROUP_DESCRIPTION_MAX, 500);
  assert.equal(GROUP_CREATION_LIMIT_PER_DAY, 3);
  assert.equal(JOINED_GROUPS_LIMIT, 100);
  assert.match(migration, /char_length\(name\) between 3 and 60/);
  assert.match(migration, /char_length\(description\) between 1 and 500/);
  assert.match(migration, /creation_limit_per_day\(\)\s+returns integer[^$]*\$\$ select 3 \$\$/);
  assert.match(migration, /joined_groups_limit\(\)\s+returns integer[^$]*\$\$ select 100 \$\$/);
});

test('names are trimmed and inner whitespace is collapsed, as the database does', () => {
  assert.equal(normalizeGroupName('  Study \t\n  Group  '), 'Study Group');
  assert.equal(normalizeGroupName('Chess'), 'Chess');
  assert.equal(normalizeGroupName('   '), '');
  assert.equal(normalizeGroupName(undefined), '');
});

test('name validation gives one clear message per problem', () => {
  assert.equal(groupNameError(''), 'Give your group a name.');
  assert.equal(groupNameError('  \n '), 'Give your group a name.');
  assert.match(groupNameError('ab'), /at least 3/);
  // Whitespace is collapsed before counting: "a   b" is "a b", three characters.
  assert.equal(groupNameError(' a   b'), null);
  assert.match(groupNameError(' a     '), /at least 3/);
  assert.equal(groupNameError('abc'), null);
  assert.equal(groupNameError('x'.repeat(60)), null);
  assert.match(groupNameError('x'.repeat(61)), /up to 60/);
  // Counted in characters, not UTF-16 units.
  assert.equal(groupNameError('😀'.repeat(60)), null);
  assert.equal(groupNameError('نادي الشطرنج'), null);
  // Emoji built with a zero-width joiner stay allowed.
  assert.equal(groupNameError('Dev 👩‍💻 club'), null);
});

test('a name cannot hide a character that makes it look like another group', () => {
  for (const hidden of ['\u200B', '\u200E', '\u202E', '\u2060', '\u2066', '\u0001', '\u007F']) {
    assert.match(groupNameError(`Study${hidden}Group`), /invisible characters/, `U+${hidden.codePointAt(0).toString(16)}`);
  }
  // The database refuses the same set.
  const hiddenClass = String.raw`'[\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]'`;
  assert.ok(migration.includes(`and name !~ '[[:cntrl:]]'\n    and name !~ ${hiddenClass}`));
  assert.ok(migration.includes(`if clean_name ~ '[[:cntrl:]]' or clean_name ~ ${hiddenClass} then\n    raise exception using errcode = '23514'`));
  // The migration is plain ASCII: the characters are written as escapes, never literally.
  assert.doesNotMatch(migration, /[^\x00-\x7F]/);
});

test('the description is optional and capped at 500 characters', () => {
  assert.equal(normalizeGroupDescription('   '), null);
  assert.equal(normalizeGroupDescription(null), null);
  assert.equal(normalizeGroupDescription('  For revision.  '), 'For revision.');
  assert.equal(groupDescriptionError(''), null);
  assert.equal(groupDescriptionError('d'.repeat(500)), null);
  assert.match(groupDescriptionError('d'.repeat(501)), /up to 500/);
});

test('a draft exists as soon as something other than spaces is typed', () => {
  assert.equal(hasGroupDraft('', ''), false);
  assert.equal(hasGroupDraft('   ', ' \n '), false);
  assert.equal(hasGroupDraft('C', ''), true);
  assert.equal(hasGroupDraft('', 'about'), true);
});

test('a retry of the same form reuses its request identifier; a changed form gets a new one', () => {
  let made = 0;
  const createId = () => uuid(++made);
  const first = prepareGroupCreateAttempt(null, '  Chess   Club ', '  Weekly games. ', createId);
  assert.deepEqual(first, { requestId: uuid(1), name: 'Chess Club', description: 'Weekly games.' });
  assert.equal(prepareGroupCreateAttempt(first, 'Chess Club', 'Weekly games.', createId), first);
  assert.equal(prepareGroupCreateAttempt(first, 'Chess  Club  ', ' Weekly games.', createId), first);
  assert.equal(made, 1);
  assert.equal(prepareGroupCreateAttempt(first, 'Chess Club 2', 'Weekly games.', createId).requestId, uuid(2));
  assert.equal(prepareGroupCreateAttempt(first, 'Chess Club', '', createId).description, null);
  assert.throws(() => prepareGroupCreateAttempt(null, 'ab', '', createId), /Invalid group/);
  assert.throws(() => prepareGroupCreateAttempt(null, 'Valid', 'd'.repeat(501), createId), /Invalid group/);
  assert.throws(() => prepareGroupCreateAttempt(null, 'Valid', '', () => 'not-a-uuid'), /Invalid group identifier/);
});

// --- Identifiers, cursors and pages -------------------------------------------------

test('identifiers are checked before they reach a query', () => {
  assert.equal(isGroupUuid(uuid(1)), true);
  assert.equal(requireGroupUuid(uuid(1).toUpperCase()), uuid(1));
  for (const bad of ['', 'abc', `${uuid(1)},id.neq.0`, `${uuid(1)})`, null, undefined, 7, [uuid(1)]]) {
    assert.equal(isGroupUuid(bad), false);
    assert.throws(() => requireGroupUuid(bad), /Invalid group identifier/);
  }
});

test('the cursor filter keeps microseconds and follows the list direction', () => {
  const cursor = { stamp: stamp(5), id: uuid(5) };
  assert.equal(groupCursorFilter('created_at', 'id', cursor, 'desc'),
    `created_at.lt.${stamp(5)},and(created_at.eq.${stamp(5)},id.lt.${uuid(5)})`);
  assert.equal(groupCursorFilter('joined_at', 'user_id', cursor, 'asc'),
    `joined_at.gt.${stamp(5)},and(joined_at.eq.${stamp(5)},user_id.gt.${uuid(5)})`);
});

test('a forged cursor cannot add filter syntax', () => {
  for (const bad of [
    { stamp: `${stamp(1)},id.neq.0`, id: uuid(1) },
    { stamp: '2026-10-11', id: uuid(1) },
    { stamp: stamp(1), id: `${uuid(1)}),or(id.neq.0` },
    { stamp: 5, id: uuid(1) },
    null,
  ]) assert.throws(() => groupCursorFilter('created_at', 'id', bad, 'desc'), /Invalid group/);
});

test('page size is bounded', () => {
  assert.equal(requireGroupPageSize(20), 20);
  for (const bad of [0, 51, 1.5, NaN, '20']) assert.throws(() => requireGroupPageSize(bad), /between 1 and 50/);
});

test('a page shows `limit` groups and offers a cursor only when one more exists', () => {
  const rows = [group(3), group(2), group(1)];
  const page = buildGroupPage(rows, 2);
  assert.deepEqual(page.items.map(idOf), [uuid(3), uuid(2)]);
  assert.deepEqual(page.nextCursor, { stamp: stamp(2), id: uuid(2) });
  assert.equal(buildGroupPage(rows, 3).nextCursor, null);
  assert.deepEqual(buildGroupPage([], 20), { items: [], nextCursor: null });
});

test('my groups are paged by when they were joined', () => {
  const rows = [
    { group_id: uuid(3), role: 'member', joined_at: stamp(30), group: record(3) },
    { group_id: uuid(2), role: 'owner', joined_at: stamp(20), group: null },
    { group_id: uuid(1), role: 'member', joined_at: stamp(10), group: record(1) },
  ];
  const page = buildMyGroupRowPage(rows, 2);
  assert.deepEqual(page.items.map((row) => row.group_id), [uuid(3), uuid(2)]);
  // The cursor points at the last membership read, so no group is skipped.
  assert.deepEqual(page.nextCursor, { stamp: stamp(20), id: uuid(2) });
});

test('a group is shown only with a count the database gave for this viewer', () => {
  const summaries = viewerSummariesById([
    { group_id: uuid(3), member_count: 7, my_role: 'member' },
    { group_id: uuid(1), member_count: 1, my_role: 'owner' },
  ]);
  const rows = [
    { group_id: uuid(3), role: 'member', joined_at: stamp(30), group: record(3) },
    { group_id: uuid(2), role: 'member', joined_at: stamp(20), group: record(2) },
    { group_id: uuid(4), role: 'member', joined_at: stamp(15), group: null },
    { group_id: uuid(1), role: 'owner', joined_at: stamp(10), group: record(1) },
  ];
  // No summary for group 2 and no group for membership 4: both are dropped, and no
  // count is invented.
  assert.deepEqual(myGroupsWithCounts(rows, summaries), [
    { role: 'member', joined_at: stamp(30), group: { ...record(3), member_count: 7 } },
    { role: 'owner', joined_at: stamp(10), group: { ...record(1), member_count: 1 } },
  ]);
  assert.deepEqual(myGroupsWithCounts(rows, viewerSummariesById([])), []);
});

test('members are paged by when they joined', () => {
  const member = (n, role = 'member') => ({ user_id: uuid(n), role, joined_at: stamp(n), profile: null });
  const page = buildGroupMemberPage([member(1, 'owner'), member(2), member(3)], 2);
  assert.deepEqual(page.items.map((item) => item.role), ['owner', 'member']);
  assert.deepEqual(page.nextCursor, { stamp: stamp(2), id: uuid(2) });
});

test('each discovered group carries the viewer’s own count and role', () => {
  const summaries = viewerSummariesById([
    { group_id: uuid(1), member_count: 4, my_role: 'owner' },
    { group_id: uuid(2), member_count: 9, my_role: null },
  ]);
  const listed = withViewerSummaries([record(1), record(2), record(3)], summaries);
  assert.deepEqual(listed.map((item) => [item.id, item.member_count, item.my_role]), [[uuid(1), 4, 'owner'], [uuid(2), 9, null]]);
  // The directly readable record has no count of its own.
  assert.equal('member_count' in record(1), false);
});

test('a member from the database becomes a row with presentation fields only', () => {
  const row = groupMemberRow({
    user_id: uuid(7), role: 'owner', joined_at: stamp(1), username: 'maya_c', display_name: 'Maya Chen', avatar_url: null,
  });
  assert.deepEqual(row, {
    user_id: uuid(7), role: 'owner', joined_at: stamp(1),
    profile: { id: uuid(7), username: 'maya_c', display_name: 'Maya Chen', avatar_url: null },
  });
});

test('a member-list cursor is validated before it becomes function arguments', () => {
  assert.deepEqual(requireGroupCursor({ stamp: stamp(5), id: uuid(5).toUpperCase() }), { stamp: stamp(5), id: uuid(5) });
  assert.throws(() => requireGroupCursor({ stamp: 'yesterday', id: uuid(5) }), /Invalid group cursor/);
  assert.throws(() => requireGroupCursor({ stamp: stamp(5), id: 'someone' }), /Invalid group identifier/);
});

test('loading more never shows a group twice', () => {
  assert.deepEqual(mergeById([group(3), group(2)], [group(2), group(1)], idOf).map(idOf), [uuid(3), uuid(2), uuid(1)]);
});

// --- Paged list state: loading, empty, error, stale answers --------------------------

test('status covers idle, loading, empty, ready and error', () => {
  assert.equal(pagedStatus(null, null), 'idle');
  assert.equal(pagedStatus('a', null), 'loading');
  assert.equal(pagedStatus('a', completedPage('a', { items: [], nextCursor: null })), 'empty');
  assert.equal(pagedStatus('a', completedPage('a', buildGroupPage([group(1)], 20))), 'ready');
  assert.equal(pagedStatus('a', failedPage(null, 'a')), 'error');
});

test('an answer for another account or search is never shown', () => {
  const old = completedPage('user-1:chess', buildGroupPage([group(1)], 20));
  assert.equal(pagedStatus('user-2:chess', old), 'loading');
  assert.equal(pagedStatus('user-1:robots', old), 'loading');
  assert.equal(appendPage(old, 'user-2:chess', buildGroupPage([group(2)], 20), idOf), old);
  assert.equal(beginLoadMore(old, 'user-2:chess'), old);
  assert.equal(failLoadMore(old, 'user-2:chess'), old);
});

test('a failed first load is an error; a failed reload keeps the list and says so', () => {
  const first = failedPage(null, 'a');
  assert.equal(first.failed, true);
  assert.deepEqual(first.items, []);
  const shown = completedPage('a', buildGroupPage([group(1)], 20));
  const reloaded = failedPage(shown, 'a');
  assert.equal(reloaded.failed, false);
  assert.equal(reloaded.refreshFailed, true);
  assert.deepEqual(reloaded.items, shown.items);
  // A stale list from another search does not survive a failure.
  assert.equal(failedPage(shown, 'b').failed, true);
  // After an error, a second failure is still an error, not a "refresh failed".
  assert.equal(failedPage(first, 'a').failed, true);
});

test('loading more appends, and a failed page can be retried', () => {
  let state = completedPage('a', buildGroupPage([group(3), group(2), group(1)], 2));
  state = beginLoadMore(state, 'a');
  assert.equal(state.loadingMore, true);
  const failed = failLoadMore(state, 'a');
  assert.deepEqual([failed.loadingMore, failed.loadMoreFailed, failed.items.length], [false, true, 2]);
  assert.deepEqual(failed.nextCursor, { stamp: stamp(2), id: uuid(2) });
  const retried = appendPage(beginLoadMore(failed, 'a'), 'a', buildGroupPage([group(1)], 2), idOf);
  assert.deepEqual(retried.items.map(idOf), [uuid(3), uuid(2), uuid(1)]);
  assert.deepEqual([retried.loadingMore, retried.loadMoreFailed, retried.nextCursor], [false, false, null]);
});

// --- Search -------------------------------------------------------------------------

test('group search matches every word in the name or the description', () => {
  assert.deepEqual(groupSearchFilters(termsFromKey(searchKey('  Chess   CLUB '))), [
    'name.ilike.*chess*,description.ilike.*chess*',
    'name.ilike.*club*,description.ilike.*club*',
  ]);
  assert.equal(searchKey('c'), '');
});

test('no filter syntax or LIKE wildcard reaches a group search', () => {
  const hostile = 'a%,b_c),or(status.eq.archived).*:"\\\' x';
  for (const filter of groupSearchFilters(searchTerms(hostile))) {
    assert.match(filter, /^name\.ilike\.\*[\p{L}\p{N}\p{M}]+\*,description\.ilike\.\*[\p{L}\p{N}\p{M}]+\*$/u);
  }
  assert.throws(() => groupSearchFilters(['a,b']), /Invalid search/);
  assert.throws(() => groupSearchFilters([]), /Invalid search/);
});

// --- Presentation -------------------------------------------------------------------

test('member counts are worded truthfully', () => {
  assert.equal(memberCountLabel(0), '0 members');
  assert.equal(memberCountLabel(1), '1 member');
  assert.equal(memberCountLabel(2), '2 members');
  assert.equal(memberCountLabel(1234), '1,234 members');
  assert.equal(memberCountLabel(-3), '0 members');
  assert.equal(memberCountLabel(NaN), '0 members');
});

test('each viewer gets exactly one action, and an owner is never offered Leave', () => {
  assert.equal(groupAction('active', null), 'join');
  assert.equal(groupAction('active', 'member'), 'leave');
  assert.equal(groupAction('active', 'owner'), 'owner');
  assert.equal(groupAction('archived', null), 'closed');
  assert.equal(groupAction('archived', 'member'), 'leave');
  assert.equal(groupAction('archived', 'owner'), 'owner');
});

test('the badge and the screen-reader label state membership in words', () => {
  assert.equal(groupBadge('active', null), null);
  assert.equal(groupBadge('active', 'member'), 'Joined');
  assert.equal(groupBadge('active', 'owner'), 'Owner');
  assert.equal(groupBadge('archived', 'member'), 'Archived');
  assert.equal(groupRowLabel(group(1, { name: 'Chess Club', member_count: 12, description: 'Weekly games' }), 'member'),
    'Open Chess Club. 12 members. You are a member. Weekly games');
  assert.equal(groupRowLabel(group(1, { name: 'Chess Club' }), null), 'Open Chess Club. 1 member');
  assert.equal(groupRowLabel(group(1, { name: 'Chess Club' }), 'owner'), 'Open Chess Club. 1 member. You own this group');
  assert.equal(groupRowLabel(group(1, { name: 'Chess Club', status: 'archived' }), null), 'Open Chess Club. 1 member. Archived');
});

// --- Errors -------------------------------------------------------------------------

test('database error codes map to what the student is told', () => {
  const kind = (code) => groupErrorKind({ code });
  assert.equal(kind('PG001'), 'name-taken');
  assert.equal(kind('PG002'), 'creation-limit');
  assert.equal(kind('PG003'), 'joined-limit');
  assert.equal(kind('PG004'), 'not-found');
  assert.equal(kind('PG005'), 'archived');
  assert.equal(kind('PG006'), 'owner-cannot-leave');
  assert.equal(kind('23514'), 'invalid');
  assert.equal(kind('22023'), 'invalid');
  assert.equal(kind('42501'), 'forbidden');
  assert.equal(groupErrorKind(new Error('Network request failed')), 'network');
  assert.equal(groupErrorKind(null), 'network');
  // Every code the migration documents is one the app understands.
  for (const code of migration.match(/errcode = '([A-Z0-9]+)'/g).map((match) => match.slice(11, -1))) {
    assert.notEqual(kind(code), 'network', `unmapped code ${code}`);
  }
});

test('every error has wording for every action and none shows server text', () => {
  // Sprint 7B added six kinds (a ban and the administration errors).
  const kinds = [
    'name-taken', 'creation-limit', 'joined-limit', 'not-found', 'archived', 'owner-cannot-leave', 'banned', 'member-not-found',
    'not-allowed', 'removal-limit', 'admin-limit', 'recipient-not-admin', 'invalid', 'forbidden', 'network',
  ];
  for (const messages of [groupCreateErrors, groupJoinErrors, groupLeaveErrors, groupAdminErrors]) {
    assert.deepEqual(Object.keys(messages).sort(), [...kinds].sort());
    for (const message of Object.values(messages)) {
      assert.ok(message.length > 10);
      assert.doesNotMatch(message, /PG00|errcode|undefined|null/);
    }
  }
  assert.equal(groupCreateErrors['name-taken'], GROUP_NAME_TAKEN);
  assert.match(GROUP_NAME_TAKEN, /already exists/);
  assert.match(groupCreateErrors['creation-limit'], /3 groups a day/);
  assert.match(groupJoinErrors['joined-limit'], /100 groups/);
  assert.match(groupJoinErrors.archived, /archived/);
  assert.match(groupLeaveErrors['owner-cannot-leave'], /own this group/);
  assert.match(groupCreateErrors.network, /still here/);
});

// --- Migration: security shape -------------------------------------------------------

test('the migration is marked as not applied and only adds objects', () => {
  assert.match(migration, /NOT APPLIED to the hosted project/);
  assert.doesNotMatch(migration, /\b(drop|truncate)\b/i);
  assert.doesNotMatch(migration, /create or replace/i);
  assert.doesNotMatch(migration, /alter table public\.(profiles|posts|conversations|messages|user_blocks|conversation_reads)/);
  assert.doesNotMatch(migration, /alter publication/i);
});

test('clients get no write privilege and anonymous users get nothing', () => {
  const grants = migration.match(/^grant[^;]+;/gim);
  for (const grant of grants) {
    assert.doesNotMatch(grant, /\banon\b/);
    if (/to authenticated/.test(grant)) assert.match(grant, /^grant (select \(|execute on function|usage on schema)/i);
  }
  assert.doesNotMatch(migration, /grant (insert|update|delete|all)[^;]*to authenticated/i);
  assert.match(migration, /revoke all on public\.groups, public\.group_members from public, anon, authenticated;/);
  assert.match(migration, /alter table public\.groups enable row level security;/);
  assert.match(migration, /alter table public\.group_members enable row level security;/);
  // The creator, the request identifier and the stored member count are not readable.
  assert.match(migration, /grant select \(id, name, description, visibility, status, created_at, updated_at\)\s+on public\.groups to authenticated;/);
  // The helper schema is closed to every client role.
  assert.doesNotMatch(migration, /grant usage on schema/i);
  assert.match(migration, /revoke all on schema penguin_groups_private from public, anon, authenticated, service_role;/);
});

test('every function pins its search path and takes identity only from the session', () => {
  const functions = migration.match(/create function [\s\S]*?\$\$;/g);
  assert.equal(functions.length, 10);
  for (const definition of functions) assert.match(definition, /set search_path = ''/);
  for (const name of ['create_group_idempotent', 'join_group', 'leave_group']) {
    const definition = functions.find((item) => item.startsWith(`create function public.${name}(`));
    assert.match(definition, /security definer/);
    assert.match(definition, /caller uuid := \(select auth\.uid\(\)\);/);
    assert.match(definition, /if caller is null then\s+raise exception using errcode = '42501'/);
    assert.match(definition, /perform penguin_groups_private\.lock_user\(caller\);/);
    // No parameter names a user or a role.
    const parameters = definition.slice(0, definition.indexOf('returns'));
    assert.doesNotMatch(parameters, /user|role|creator|owner/i);
  }
  assert.match(migration, /revoke all on function public\.create_group_idempotent\(uuid, text, text\) from public, anon, authenticated;/);
  assert.match(migration, /revoke all on function public\.join_group\(uuid\) from public, anon, authenticated;/);
  assert.match(migration, /revoke all on function public\.leave_group\(uuid\) from public, anon, authenticated;/);
});

test('other members are readable only one group at a time, never by student', () => {
  // Direct reads of memberships are limited to the caller's own rows.
  assert.match(migration, /create policy group_members_own_read on public\.group_members\s+for select to authenticated\s+using \(user_id = \(select auth\.uid\(\)\)\);/);
  assert.equal([...migration.matchAll(/create policy \w+ on public\.group_members/g)].length, 1);
  const functions = migration.match(/create function [\s\S]*?\$\$;/g);
  const summaries = functions.find((item) => item.startsWith('create function public.get_group_viewer_summaries('));
  const members = functions.find((item) => item.startsWith('create function public.list_group_members('));
  for (const definition of [summaries, members]) {
    assert.match(definition, /security definer/);
    assert.match(definition, /caller uuid := \(select auth\.uid\(\)\);/);
    assert.match(definition, /if caller is null then\s+raise exception using errcode = '42501'/);
    // Anyone with a block between them and the caller is left out, by one shared rule.
    assert.match(definition, /m\.user_id (not )?in \(select hidden from penguin_groups_private\.hidden_from\(caller\) hidden\)/);
  }
  // The only inputs: a list of groups; or one group, a page position and a page size.
  assert.match(summaries, /^create function public\.get_group_viewer_summaries\(p_group_ids uuid\[\]\)/);
  assert.match(members, /^create function public\.list_group_members\(\s+p_group_id uuid,\s+p_after_joined_at timestamptz default null,\s+p_after_user_id uuid default null,\s+p_limit integer default 31\s+\)/);
  assert.match(members, /where m\.group_id = p_group_id/);
  // The page position cannot be used as a filter: it is refused without its timestamp.
  assert.match(members, /\(p_after_joined_at is null\) <> \(p_after_user_id is null\)/);
  assert.match(members, /p_limit not between 1 and 51/);
  assert.match(summaries, /cardinality\(p_group_ids\) > 50/);
  // The count a viewer is told is the stored total minus the members hidden from them.
  assert.match(summaries, /g\.member_count - \(\s+select count\(\*\) from public\.group_members m\s+where m\.group_id = g\.id/);
  // The summary reports a role for the caller only.
  assert.match(summaries, /select m\.role from public\.group_members m where m\.group_id = g\.id and m\.user_id = caller/);
  assert.match(migration, /revoke all on function public\.get_group_viewer_summaries\(uuid\[\]\) from public, anon, authenticated;/);
  assert.match(migration, /revoke all on function public\.list_group_members\(uuid, timestamptz, uuid, integer\) from public, anon, authenticated;/);
});

test('roles are fixed by the functions and the policies cannot recurse', () => {
  assert.match(migration, /values \(stored\.id, caller, 'owner', stored\.created_at\)/);
  assert.match(migration, /values \(p_group_id, caller, 'member', pg_catalog\.clock_timestamp\(\)\)/);
  assert.match(migration, /constraint groups_visibility_values check \(visibility = 'public'\)/);
  assert.match(migration, /create unique index groups_name_unique_idx on public\.groups \(lower\(name\)\);/);
  assert.match(migration, /create unique index group_members_one_owner_idx on public\.group_members \(group_id\) where role = 'owner';/);
  const policies = migration.match(/create policy [\s\S]*?;/g);
  assert.equal(policies.length, 2);
  for (const policy of policies) {
    assert.match(policy, /for select to authenticated/);
    assert.doesNotMatch(policy, /from public\.(groups|group_members)/);
  }
});

// --- Service -------------------------------------------------------------------------

test('the service never sends a creator, an owner or a role, and never reads hidden columns', () => {
  const service = feature['service.ts'];
  assert.match(service, /rpc\('create_group_idempotent', \{\s+p_request_id: requireGroupUuid\(requestId\),\s+p_name: name,\s+p_description: description,\s+\}\)/);
  assert.match(service, /rpc\('join_group', \{ p_group_id: requireGroupUuid\(groupId\) \}\)/);
  assert.match(service, /rpc\('leave_group', \{ p_group_id: requireGroupUuid\(groupId\) \}\)/);
  assert.doesNotMatch(service, /creator_id|client_request_id|p_user|p_role|service_role/);
  assert.doesNotMatch(service, /\.(insert|update|upsert|delete)\(/);
  // The stored member count is never requested; counts come from the per-viewer function.
  assert.match(service, /const GROUP = 'id,name,description,status,created_at' as const;/);
  assert.match(service, /rpc\('get_group_viewer_summaries', \{ p_group_ids: groupIds\.map\(requireGroupUuid\) \}\)/);
});

test('the app reads other members only through the per-group function', () => {
  const service = feature['service.ts'];
  assert.match(service, /rpc\('list_group_members', \{\s+p_group_id: requireGroupUuid\(groupId\),\s+p_after_joined_at: after\?\.stamp \?\? null,\s+p_after_user_id: after\?\.id \?\? null,\s+p_limit: requireGroupPageSize\(limit\) \+ 1,\s+\}\)/);
  // The membership table is read directly in one place only, for the caller's own groups.
  assert.equal([...service.matchAll(/from\('group_members'\)/g)].length, 1);
  assert.match(service, /from\('group_members'\)\s+\.select\(`group_id,role,joined_at,group:groups!group_members_group_id_fkey\(\$\{GROUP\}\)`\)\s+\.eq\('user_id', requireGroupUuid\(userId\)\)/);
  assert.doesNotMatch(service, /profiles!|from\('profiles'\)/);
  // No screen or hook asks for the groups of another student.
  for (const [name, source] of Object.entries(feature)) {
    if (name === 'service.ts') continue;
    assert.doesNotMatch(source, /from\('group|\.rpc\(/, name);
  }
  assert.match(feature['use-groups.ts'], /listMyGroups\(\{ userId: userId \?\? '', cursor, signal \}\)/);
});

test('discovery lists active groups newest first, with no ranking, one page at a time', () => {
  const service = feature['service.ts'];
  assert.match(service, /from\('groups'\)\.select\(GROUP\)\.eq\('status', 'active'\)/);
  assert.match(service, /order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)\s+\.limit\(requireGroupPageSize\(limit\) \+ 1\)/);
  assert.doesNotMatch(service, /member_count', \{ ascending/);
});

test('Sprint 7A opens no realtime channel and adds no group chat, posts or notifications', () => {
  for (const [name, source] of Object.entries(feature)) {
    assert.doesNotMatch(source, /\.channel\(|realtime|subscribe\(/i, name);
    assert.doesNotMatch(source, /sendMessage|createPost|expo-notifications/, name);
  }
});

// --- Navigation ----------------------------------------------------------------------

test('the bottom bar still has exactly five destinations and Groups is not one', () => {
  const bar = read('../src/components/navigation/tab-bar.tsx');
  const names = [...bar.matchAll(/\{ kind: '(?:tab|action)', name: '([a-z]+)'/g)].map((match) => match[1]);
  assert.deepEqual(names, ['home', 'discover', 'create', 'messages', 'account']);
  const tabs = read('../src/app/(protected)/(tabs)/_layout.tsx');
  assert.equal([...tabs.matchAll(/<Tabs\.Screen /g)].length, 4);
  assert.doesNotMatch(tabs, /groups/);
  assert.equal(exists('../src/app/(protected)/(tabs)/groups.tsx'), false);
});

test('Groups routes sit above the tabs and are reached from Discover', () => {
  for (const route of ['index.tsx', 'new.tsx', '[id]/index.tsx', '[id]/members.tsx']) {
    assert.equal(exists(`../src/app/(protected)/groups/${route}`), true, route);
  }
  const discover = read('../src/features/discover/discover-screen.tsx');
  assert.match(discover, /router\.push\('\/groups'\)/);
  assert.match(discover, /accessibilityLabel="Groups\. Find, join and create student groups"/);
  const list = feature['groups-screen.tsx'];
  assert.match(list, /router\.push\(\{ pathname: '\/groups\/\[id\]', params: \{ id: groupId \} \}\)/);
  assert.match(list, /router\.push\('\/groups\/new'\)/);
  assert.match(feature['group-screen.tsx'], /router\.push\(\{ pathname: '\/groups\/\[id\]\/members', params: \{ id: group\.id \} \}\)/);
});

test('every Groups route waits for the profile, is keyed by account and checks its id', () => {
  for (const route of ['index.tsx', 'new.tsx', '[id]/index.tsx', '[id]/members.tsx']) {
    const source = read(`../src/app/(protected)/groups/${route}`);
    assert.match(source, /if \(state\.status !== 'ready'\) return <ProfileStatus \/>;/, route);
    assert.match(source, /key=\{[^}]*state\.profile\.id/, route);
  }
  for (const route of ['[id]/index.tsx', '[id]/members.tsx']) {
    assert.match(read(`../src/app/(protected)/groups/${route}`),
      /const groupId = isGroupUuid\(params\.id\) \? params\.id\.toLowerCase\(\) : null;/, route);
  }
});

test('Back always has somewhere to go, and a new group replaces the form', () => {
  assert.match(feature['groups-screen.tsx'], /if \(router\.canGoBack\(\)\) router\.back\(\);\s+else router\.replace\('\/discover'\);/);
  for (const name of ['group-screen.tsx', 'group-members-screen.tsx', 'create-group-screen.tsx']) {
    assert.match(feature[name], /if \(router\.canGoBack\(\)\) router\.back\(\);\s+else router\.replace\('\/groups'\);/, name);
  }
  assert.match(feature['create-group-screen.tsx'], /router\.replace\(\{ pathname: '\/groups\/\[id\]', params: \{ id: groupId \} \}\)/);
  assert.match(read('../src/app/(protected)/_layout.tsx'), /<Stack\.Screen name="groups\/new" options=\{\{ gestureEnabled: false \}\} \/>/);
});

// --- Screens -------------------------------------------------------------------------

test('the list has loading, empty, error, retry and paging states for both sections', () => {
  const list = feature['groups-screen.tsx'];
  for (const text of [
    'My groups', 'Discover groups', 'Results', 'Search groups', 'Create a group',
    'Loading your groups', 'You haven’t joined a group yet.', 'Your groups couldn’t load.',
    'Groups couldn’t load', 'No groups match', 'No groups yet', 'Retry loading more', 'Clear search',
  ]) assert.ok(list.includes(text), text);
  assert.match(list, /onEndReached=\{onEndReached\}/);
  assert.match(list, /if \(hasMore && !loadingMore && !loadMoreFailed\) loadMore\(\);/);
  // Returning to the list reloads both sections.
  assert.match(list, /refreshMine\(\);\s+refreshDiscover\(\);/);
});

test('the details screen shows one truthful action and never Leave for the owner', () => {
  const details = feature['group-screen.tsx'];
  assert.match(details, /const action = groupAction\(group\.status, role\);/);
  assert.match(details, /action === 'join' \? <Button/);
  assert.match(details, /action === 'leave' \? <Button variant="outline"/);
  // Sprint 7B: an owner can leave after transferring ownership, and the screen says how.
  assert.match(details, /action === 'owner' \? <Text[^>]*>\s+\{rolesSupported\s+\? 'You own this group\. To leave, first make an admin the owner from the member list\.'/);
  assert.ok(details.includes('This group is archived because it no longer has an owner. New members can’t join.'));
  // The count on screen is the stored one, read again after every change.
  assert.match(details, /memberCountLabel\(group\.member_count\)/);
  assert.match(details, /await reload\(\);\s+inFlight\.current = false;/);
  assert.match(details, /if \(inFlight\.current\) return;\s+inFlight\.current = true;/);
  assert.match(details, /title="Leave this group\?"/);
  // Sprint 7B added editing and ownership transfer; these are still not offered.
  for (const unsupported of ['Delete group', 'Invite', 'Group chat', 'Group post']) {
    assert.ok(!details.includes(unsupported), unsupported);
    assert.ok(!feature['group-members-screen.tsx'].includes(unsupported), unsupported);
  }
});

test('creating a group validates, guards against a second submission and asks before discarding', () => {
  const create = feature['create-group-screen.tsx'];
  assert.match(create, /if \(inFlight\.current\) return;\s+setSubmitted\(true\);\s+if \(groupNameError\(name\) \|\| groupDescriptionError\(description\)\) return;/);
  assert.match(create, /prepareGroupCreateAttempt\(attempt\.current, name, description, Crypto\.randomUUID\)/);
  assert.match(create, /if \(kind === 'name-taken'\) setTakenName\(name\);/);
  assert.match(create, /title="Discard this group\?"/);
  assert.match(create, /BackHandler\.addEventListener\('hardwareBackPress'/);
  assert.match(create, /if \(inFlight\.current\) return true;\s+if \(!draftRef\.current\) return false;/);
  assert.match(create, /<Button size="sm" className="mr-1" loading=\{busy\} accessibilityLabel="Create group"/);
  assert.match(create, /accessibilityLabel="Cancel creating group"/);
  assert.match(create, /<KeyboardAvoidingView className="flex-1" behavior="padding">/);
  // No image upload in this sprint.
  assert.doesNotMatch(create, /ImagePicker|expo-image/);
});

test('screens use design tokens only, so Light and Dark both work', () => {
  for (const [name, source] of Object.entries(feature)) {
    assert.doesNotMatch(source, /#[0-9a-fA-F]{3,8}\b/, `${name} has a literal colour`);
    assert.doesNotMatch(source, /rgba?\(/, `${name} has a literal colour`);
    assert.doesNotMatch(source, /\b(bg|text|border)-(white|black|gray|slate|zinc|orange|red|green|blue)-?\d*\b/, `${name} uses a palette colour`);
  }
  for (const name of screens) {
    assert.match(feature[name], /<SafeAreaView className="flex-1 bg-background" edges=\{\['top', 'left', 'right'\]\}>/, name);
    assert.match(feature[name], /insets\.bottom \+ 24/, name);
  }
});

test('pressable controls are labelled and async results are announced', () => {
  for (const name of [...screens, 'group-row.tsx']) {
    const source = feature[name];
    const pressables = [...source.matchAll(/<Pressable\b[\s\S]*?>/g)].map((match) => match[0]);
    for (const pressable of pressables) {
      assert.match(pressable, /accessibilityLabel=/, `${name}: ${pressable.slice(0, 60)}`);
      assert.match(pressable, /role="button"/, `${name}: ${pressable.slice(0, 60)}`);
    }
  }
  for (const name of screens) assert.match(feature[name], /accessibilityLiveRegion="polite"|\blive\b/, name);
  assert.match(feature['group-row.tsx'], /min-h-18/);
  assert.match(feature['group-avatar.tsx'], /aria-hidden/);
});

// --- Member count policy: the real count, and one grouped entry ---------------------

test('the count-policy migration changes one function and returns only an aggregate', () => {
  assert.match(countPolicy, /NOT APPLIED to the hosted project/);
  assert.doesNotMatch(countPolicy, /[^\x00-\x7F]/);
  // One drop, one function, inside one transaction.
  assert.match(countPolicy, /^begin;$/m);
  assert.match(countPolicy, /^commit;$/m);
  assert.deepEqual(countPolicy.match(/^drop [^;]+;/gim), ['drop function public.get_group_viewer_summaries(uuid[]);']);
  assert.equal(countPolicy.match(/create function /g).length, 1);
  assert.doesNotMatch(countPolicy, /create (table|policy|trigger|schema|index)|alter (table|policy|publication)|create or replace/i);
  assert.doesNotMatch(countPolicy, /\b(insert|update|delete|truncate)\b/i);
  const definition = countPolicy.match(/create function [\s\S]*?\$\$;/)[0];
  assert.match(definition, /returns table \(\s+group_id uuid,\s+member_count integer,\s+unavailable_member_count integer,\s+my_role text\s+\)/);
  assert.match(definition, /security definer\s+set search_path = ''/);
  assert.match(definition, /caller uuid := \(select auth\.uid\(\)\);/);
  assert.match(definition, /if caller is null then\s+raise exception using errcode = '42501'/);
  assert.match(definition, /cardinality\(p_group_ids\) > 50/);
  // The count is the stored total, with nothing subtracted from it.
  assert.match(definition, /select g\.id,\s+g\.member_count,\s+\(\s+select count\(\*\) from public\.group_members m/);
  assert.doesNotMatch(definition, /g\.member_count\s*-/);
  // The unavailable number uses the one shared rule, and the role is the caller's own.
  assert.match(definition, /m\.user_id in \(select hidden from penguin_groups_private\.hidden_from\(caller\) hidden\)/);
  assert.match(definition, /select m\.role from public\.group_members m where m\.group_id = g\.id and m\.user_id = caller/);
  // Same access as before: signed-in students only.
  assert.match(countPolicy, /revoke all on function public\.get_group_viewer_summaries\(uuid\[\]\) from public, anon, authenticated;/);
  const grants = countPolicy.match(/^grant[^;]+;/gim);
  assert.deepEqual(grants, ['grant execute on function public.get_group_viewer_summaries(uuid[]) to authenticated;']);
});

test('the deployed Sprint 7A migration is left as it was applied', () => {
  // Its summaries function still subtracts; the new migration replaces it afterwards.
  assert.match(migration, /\(g\.member_count - \(/);
  assert.ok('20261012090000_groups_foundation.sql' < '20261013090000_groups_member_count_policy.sql');
  assert.doesNotMatch(migration, /unavailable_member_count/);
});

test('summaries carry the actual count and a number of unavailable members, nothing else', () => {
  const summaries = viewerSummariesById([
    { group_id: uuid(1), member_count: 5, unavailable_member_count: 2, my_role: 'member' },
    // An answer from the earlier function has no such number: it counts as none.
    { group_id: uuid(2), member_count: 3, my_role: null },
  ]);
  assert.deepEqual(summaries[uuid(1)], { member_count: 5, unavailable_member_count: 2, my_role: 'member', roles_supported: false });
  assert.deepEqual(summaries[uuid(2)], { member_count: 3, unavailable_member_count: 0, my_role: null, roles_supported: false });
  // A shown group carries the actual count, whatever is unavailable.
  assert.equal(withViewerSummaries([record(1)], summaries)[0].member_count, 5);
  assert.deepEqual(Object.keys(withViewerSummaries([record(1)], summaries)[0]).sort(),
    ['created_at', 'description', 'id', 'member_count', 'my_role', 'name', 'status']);
});

test('an unavailable count is a whole number of members or nothing', () => {
  assert.equal(unavailableMemberCount(3), 3);
  assert.equal(unavailableMemberCount(2.9), 2);
  for (const bad of [0, -1, NaN, Infinity, '3', null, undefined, {}]) assert.equal(unavailableMemberCount(bad), 0);
});

test('unavailable members are worded neutrally, never by reason', () => {
  assert.equal(unavailableMembersLabel(1), 'Penguin User');
  assert.equal(unavailableMembersLabel(2), '2 Penguin Users');
  assert.equal(unavailableMembersLabel(1234), '1,234 Penguin Users');
  assert.equal(UNAVAILABLE_MEMBERS_CAPTION, 'Profile not available');
  for (const [name, source] of Object.entries(feature)) {
    if (!name.endsWith('.tsx')) continue;
    // No screen tells a student about blocking.
    const visible = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
    assert.doesNotMatch(visible, /block/i, name);
  }
});

test('the grouped entry appears once, only after the last page of visible members', () => {
  const list = (overrides) => ({ status: 'ready', hasMore: false, loadingMore: false, loadMoreFailed: false, unavailableCount: 2, ...overrides });
  assert.equal(showUnavailableMembers(list()), true);
  // Not while more members can still be loaded, are loading, or failed to load.
  assert.equal(showUnavailableMembers(list({ hasMore: true })), false);
  assert.equal(showUnavailableMembers(list({ loadingMore: true })), false);
  assert.equal(showUnavailableMembers(list({ loadMoreFailed: true })), false);
  // Not before the first page, and not on an error.
  assert.equal(showUnavailableMembers(list({ status: 'loading' })), false);
  assert.equal(showUnavailableMembers(list({ status: 'idle' })), false);
  assert.equal(showUnavailableMembers(list({ status: 'error' })), false);
  // Not when everybody is visible.
  assert.equal(showUnavailableMembers(list({ unavailableCount: 0 })), false);
  // A viewer who can see nobody still gets the entry, not "no members".
  assert.equal(showUnavailableMembers(list({ status: 'empty' })), true);
});

test('the number of unavailable members arrives with the first page and survives later pages', () => {
  const member = (n) => ({ user_id: uuid(n), role: n === 1 ? 'owner' : 'member', joined_at: stamp(n), profile: null });
  const first = { ...buildGroupMemberPage([member(1), member(2), member(3)], 2), unavailableCount: 2 };
  let state = completedPage('members', first);
  assert.equal(state.unavailableCount, 2);
  assert.equal(showUnavailableMembers({ status: pagedStatus('members', state), hasMore: Boolean(state.nextCursor), ...state }), false);
  state = beginLoadMore(state, 'members');
  assert.equal(showUnavailableMembers({ status: 'ready', hasMore: true, ...state }), false);
  // A later page carries no number and must not reset it; a repeated member is not added twice.
  state = appendPage(state, 'members', buildGroupMemberPage([member(2), member(3)], 2), (item) => item.user_id);
  assert.deepEqual(state.items.map((item) => item.user_id), [uuid(1), uuid(2), uuid(3)]);
  assert.equal(state.unavailableCount, 2);
  assert.equal(showUnavailableMembers({ status: 'ready', hasMore: Boolean(state.nextCursor), ...state }), true);
  // A page with no number, and a failed load, mean nobody is unavailable.
  assert.equal(completedPage('members', buildGroupMemberPage([member(1)], 2)).unavailableCount, 0);
  assert.equal(failedPage(null, 'members').unavailableCount, 0);
});

test('the service asks for the unavailable number with the first page only, and never for who', () => {
  const service = feature['service.ts'];
  assert.match(service, /after \? null : viewerSummaries\(\[requireGroupUuid\(groupId\)\], signal\),/);
  assert.match(service, /unavailableCount: summaries\[requireGroupUuid\(groupId\)\]\?\.unavailable_member_count \?\? 0/);
  // The count shown for a group is the one the database returns, unadjusted.
  assert.match(service, /member_count: summary\.member_count \}, role: summary\.my_role, owner,/);
  assert.doesNotMatch(service, /member_count\s*-|-\s*\w*unavailable/);
  // The owner is still only ever the first listed member; nothing stands in for a missing one.
  assert.match(service, /const owner = first\.items\[0\]\?\.role === 'owner' \? first\.items\[0\] : null;/);
});

test('the grouped entry is not a student: no link, no action, no identifier', () => {
  const screen = feature['group-members-screen.tsx'];
  const entry = screen.slice(screen.indexOf('function UnavailableMembers('), screen.indexOf('// The members of one group'));
  assert.ok(entry.length > 200);
  assert.doesNotMatch(entry, /Pressable|onPress|router\.|role="button"|user_id|userId|username|UserAvatar|Message/);
  assert.match(entry, /accessibilityLabel=\{`\$\{label\}\. \$\{UNAVAILABLE_MEMBERS_CAPTION\}`\}/);
  assert.match(entry, /<Icon as=\{UserRound\} size=\{24\} color="muted-foreground" \/>/);
  // Rendered once, as the list footer, and only when the rule above allows it.
  assert.match(screen, /const unavailable = showUnavailableMembers\(\{ status, hasMore, loadingMore, loadMoreFailed, unavailableCount \}\);/);
  assert.equal([...screen.matchAll(/<UnavailableMembers /g)].length, 1);
  assert.match(screen, /: unavailable \? <UnavailableMembers count=\{unavailableCount\} \/> : null;/);
  // With nobody visible but someone unavailable, "No members" is not shown.
  assert.match(screen, /\/> : unavailable \? null : <StatePanel/);
  // The owner section is unchanged: present only for a visible owner.
  assert.match(feature['group-screen.tsx'], /\{owner\?\.profile && ownerName \? <View className="gap-2">/);
  assert.doesNotMatch(feature['group-screen.tsx'], /Penguin User/);
});

// =====================================================================================
// Sprint 7B: roles, moderation, bans, ownership and the administration history
// =====================================================================================

test('the roles migration is forward-only and leaves the deployed migrations alone', () => {
  assert.match(roles, /NOT APPLIED to the hosted project/);
  assert.doesNotMatch(roles, /[^\x00-\x7F]/);
  assert.ok('20261013090000_groups_member_count_policy.sql' < '20261014090000_groups_roles_and_moderation.sql');
  assert.match(roles, /^begin;$/m);
  assert.match(roles, /^commit;$/m);
  // It drops only what it recreates in the same transaction: one constraint, two functions.
  assert.deepEqual(roles.match(/^drop [^;]+;/gim), [
    'drop function public.get_group_viewer_summaries(uuid[]);',
    'drop function public.list_group_members(uuid, timestamptz, uuid, integer);',
  ]);
  assert.deepEqual(roles.match(/^alter table [^;]+;/gim).map((line) => line.replace(/\s+/g, ' ')), [
    'alter table public.group_members drop constraint group_members_role_values;',
    "alter table public.group_members add constraint group_members_role_values check (role in ('owner', 'admin', 'member'));",
    'alter table public.group_bans enable row level security;',
    'alter table public.group_admin_events enable row level security;',
  ]);
  assert.doesNotMatch(roles, /\b(truncate|alter publication|create policy)\b/i);
  // Nothing in messaging, posts or profiles is altered.
  assert.doesNotMatch(roles, /(alter|drop|create or replace)[^;]*(conversations|messages|user_blocks|conversation_reads|posts|profiles\b)/i);
  assert.doesNotMatch(roles, /function public\.(block_user|unblock_user|send_message_idempotent|get_or_create_conversation)/);
});

test('bans and the administration log have no client access at all', () => {
  assert.match(roles, /revoke all on public\.group_bans, public\.group_admin_events from public, anon, authenticated;/);
  assert.match(roles, /grant all on public\.group_bans, public\.group_admin_events to service_role;/);
  for (const grant of roles.match(/^grant[^;]+;/gim)) {
    assert.doesNotMatch(grant, /\banon\b/);
    if (/to authenticated/.test(grant)) assert.match(grant, /^grant execute on function public\./i);
  }
  assert.doesNotMatch(roles, /grant usage on schema/i);
  // Every helper in the private schema is revoked from every client role.
  const helpers = [...roles.matchAll(/create function penguin_groups_private\.(\w+)\(/g)].map((match) => match[1]);
  assert.deepEqual(helpers.sort(), ['admin_limit', 'begin_staff_action', 'recent_removals', 'record_event', 'removal_limit_per_hour', 'visible_role']);
  for (const helper of helpers) {
    assert.match(roles, new RegExp(`revoke all on function penguin_groups_private\\.${helper}\\([^)]*\\) from public, anon, authenticated, service_role;`));
  }
});

test('no administrative function takes a role, and each takes the caller from the session', () => {
  const functions = roles.match(/create (or replace )?function public\.[\s\S]*?\$\$;/g);
  assert.equal(functions.length, 13);
  const named = (name) => functions.find((item) => new RegExp(`function public\\.${name}\\(`).test(item));
  for (const name of ['promote_group_member', 'demote_group_admin', 'transfer_group_ownership', 'remove_group_member',
    'ban_group_member', 'unban_group_member', 'update_group_details']) {
    const definition = named(name);
    assert.match(definition, /security definer\s+set search_path = ''/, name);
    assert.match(definition, /caller uuid := \(select auth\.uid\(\)\);/, name);
    assert.match(definition, /if caller is null then\s+raise exception using errcode = '42501'/, name);
    // The locks and the staff check come from one shared start.
    assert.match(definition, /penguin_groups_private\.begin_staff_action\(p_group_id, caller, (true|false)\)/, name);
    assert.doesNotMatch(definition.slice(0, definition.indexOf('returns')), /role/i, name);
    assert.match(roles, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon, authenticated;`), name);
  }
  // Owner-only actions say so to the shared start; moderation is open to admins.
  for (const name of ['promote_group_member', 'demote_group_admin', 'transfer_group_ownership', 'update_group_details']) {
    assert.match(named(name), /begin_staff_action\(p_group_id, caller, true\)/, name);
  }
  for (const name of ['remove_group_member', 'ban_group_member', 'unban_group_member']) {
    assert.match(named(name), /begin_staff_action\(p_group_id, caller, false\)/, name);
  }
  // The roles a function gives are written in its body.
  assert.match(named('promote_group_member'), /update public\.group_members m set role = 'admin'/);
  assert.match(named('demote_group_admin'), /update public\.group_members m set role = 'member'/);
  // Transfer demotes the caller before it promotes the recipient.
  assert.match(named('transfer_group_ownership'),
    /set role = 'admin'\s+where m\.group_id = p_group_id and m\.user_id = caller;\s+update public\.group_members m set role = 'owner'\s+where m\.group_id = p_group_id and m\.user_id = p_new_owner_id;/);
  assert.match(named('transfer_group_ownership'), /if target_role <> 'admin' then\s+raise exception using errcode = 'PG012'/);
});

test('one shared start locks in one order and checks staff before anything else', () => {
  const start = roles.match(/create function penguin_groups_private\.begin_staff_action[\s\S]*?\$\$;/)[0];
  const order = ['lock_user(p_caller_id)', 'for update', "errcode = 'PG004'", "errcode = '42501'", "errcode = 'PG005'"].map((part) => start.indexOf(part));
  assert.ok(order.every((position) => position > 0));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  // leave_group now takes the group row before it reads the membership.
  const leave = roles.match(/create or replace function public\.leave_group[\s\S]*?\$\$;/)[0];
  assert.ok(leave.indexOf('lock_user(caller)') < leave.indexOf('for update'));
  assert.ok(leave.indexOf('for update') < leave.indexOf('select m.role into member_role'));
  assert.match(leave, /if member_role = 'owner' then\s+raise exception using errcode = 'PG006'/);
});

test('an unavailable target is answered like a non-member, before any role rule', () => {
  const visible = roles.match(/create function penguin_groups_private\.visible_role[\s\S]*?\$\$;/)[0];
  assert.match(visible, /m\.user_id not in \(select hidden from penguin_groups_private\.hidden_from\(p_viewer_id\) hidden\)/);
  for (const name of ['promote_group_member', 'demote_group_admin', 'transfer_group_ownership', 'remove_group_member', 'ban_group_member']) {
    const definition = roles.match(new RegExp(`create function public\\.${name}[\\s\\S]*?\\$\\$;`))[0];
    const notFound = definition.indexOf("errcode = 'PG008'");
    assert.ok(notFound > 0, name);
    for (const later of ["errcode = 'PG009'", "errcode = 'PG010'", "errcode = 'PG011'", "errcode = 'PG012'"]) {
      const position = definition.indexOf(later);
      if (position > 0) assert.ok(notFound < position, `${name}: ${later} must come after the not-found check`);
    }
    assert.match(definition, /target_role := penguin_groups_private\.visible_role\(p_group_id, caller, p_(member|new_owner)_id\);\s+if target_role is null then\s+raise exception using errcode = 'PG008'/, name);
  }
  // The ban list, unban and the history leave unavailable students out the same way.
  for (const name of ['unban_group_member', 'list_group_bans', 'list_group_admin_events']) {
    const definition = roles.match(new RegExp(`create function public\\.${name}[\\s\\S]*?\\$\\$;`))[0];
    assert.match(definition, /not in \(select hidden from penguin_groups_private\.hidden_from\(caller\) hidden\)/, name);
  }
});

test('limits, bans and the join check are enforced in the database', () => {
  assert.match(roles, /admin_limit\(\)\s+returns integer[^$]*\$\$ select 10 \$\$/);
  assert.match(roles, /removal_limit_per_hour\(\)\s+returns integer[^$]*\$\$ select 20 \$\$/);
  assert.equal(GROUP_ADMIN_LIMIT, 10);
  assert.equal(GROUP_REMOVALS_PER_HOUR, 20);
  // The window is the last hour of the actor's own removals and bans, in any group.
  const recent = roles.match(/create function penguin_groups_private\.recent_removals[\s\S]*?\$\$;/)[0];
  assert.match(recent, /e\.actor_id = p_actor_id\s+and e\.action in \('member_removed', 'member_banned'\)\s+and e\.created_at > pg_catalog\.clock_timestamp\(\) - interval '1 hour'/);
  assert.doesNotMatch(recent, /group_id/);
  for (const name of ['remove_group_member', 'ban_group_member']) {
    const definition = roles.match(new RegExp(`create function public\\.${name}[\\s\\S]*?\\$\\$;`))[0];
    assert.match(definition, /recent_removals\(caller\) >= penguin_groups_private\.removal_limit_per_hour\(\)/, name);
    assert.match(definition, /p_member_id = caller or target_role = 'owner' or \(caller_role = 'admin' and target_role <> 'member'\)/, name);
  }
  const join = roles.match(/create or replace function public\.join_group[\s\S]*?\$\$;/)[0];
  assert.match(join, /if exists \(select 1 from public\.group_bans b where b\.group_id = p_group_id and b\.user_id = caller\) then\s+raise exception using errcode = 'PG007'/);
  assert.ok(join.indexOf('for update') < join.indexOf('public.group_bans'));
  assert.match(join, /values \(p_group_id, caller, 'member', pg_catalog\.clock_timestamp\(\)\)/);
  // An admin may lift only a ban they placed on an ordinary member.
  assert.match(roles, /caller_role = 'admin' and \(ban\.banned_by is distinct from caller or ban\.banned_role <> 'member'\)/);
  assert.match(roles, /constraint group_bans_banned_role_values check \(banned_role in \('admin', 'member'\)\)/);
});

test('earlier app code never meets the admin role', () => {
  const summaries = roles.match(/create function public\.get_group_viewer_summaries[\s\S]*?\$\$;/)[0];
  const members = roles.match(/create function public\.list_group_members[\s\S]*?\$\$;/)[0];
  assert.match(summaries, /returns table \(\s+group_id uuid,\s+member_count integer,\s+unavailable_member_count integer,\s+my_role text,\s+my_group_role text\s+\)/);
  assert.match(members, /avatar_url text,\s+group_role text\s+\)/);
  // The earlier columns report an admin as a member; the new ones hold the full role.
  assert.match(summaries, /select case when m\.role = 'admin' then 'member' else m\.role end\s+from public\.group_members m where m\.group_id = g\.id and m\.user_id = caller/);
  assert.match(members, /select m\.user_id, case when m\.role = 'admin' then 'member' else m\.role end,/);
  // The count is still the actual one and unavailable members are still left out.
  assert.match(summaries, /select g\.id,\s+g\.member_count,/);
  assert.match(members, /m\.user_id not in \(select hidden from penguin_groups_private\.hidden_from\(caller\) hidden\)/);
});

test('the app reads the full role, and falls back to the earlier one', () => {
  assert.equal(fullGroupRole('member', 'admin'), 'admin');
  assert.equal(fullGroupRole('owner', 'owner'), 'owner');
  assert.equal(fullGroupRole('member', undefined), 'member');
  assert.equal(fullGroupRole(null, null), null);
  assert.equal(fullGroupRole('member', 'superuser'), 'member');
  assert.equal(fullGroupRole('root', undefined), null);
  const summaries = viewerSummariesById([
    { group_id: uuid(1), member_count: 4, unavailable_member_count: 0, my_role: 'member', my_group_role: 'admin' },
    { group_id: uuid(2), member_count: 4, unavailable_member_count: 0, my_role: 'member' },
    { group_id: uuid(3), member_count: 4, unavailable_member_count: 0, my_role: null, my_group_role: null },
  ]);
  assert.deepEqual([summaries[uuid(1)].my_role, summaries[uuid(1)].roles_supported], ['admin', true]);
  // A database that predates roles: the earlier role is used and administration is off.
  assert.deepEqual([summaries[uuid(2)].my_role, summaries[uuid(2)].roles_supported], ['member', false]);
  assert.deepEqual([summaries[uuid(3)].my_role, summaries[uuid(3)].roles_supported], [null, true]);
  assert.equal(groupMemberRow({ user_id: uuid(1), role: 'member', group_role: 'admin', joined_at: stamp(1), username: 'a', display_name: 'A', avatar_url: null }).role, 'admin');
  assert.equal(groupMemberRow({ user_id: uuid(1), role: 'member', joined_at: stamp(1), username: 'a', display_name: 'A', avatar_url: null }).role, 'member');
});

test('an admin is a member with a badge: they leave like a member and never see Join', () => {
  assert.equal(groupAction('active', 'admin'), 'leave');
  assert.equal(groupAction('archived', 'admin'), 'leave');
  assert.equal(groupBadge('active', 'admin'), 'Admin');
  assert.equal(groupBadge('archived', 'admin'), 'Archived');
  assert.equal(memberRoleBadge('owner'), 'Owner');
  assert.equal(memberRoleBadge('admin'), 'Admin');
  assert.equal(memberRoleBadge('member'), null);
  assert.deepEqual([isGroupStaff('owner'), isGroupStaff('admin'), isGroupStaff('member'), isGroupStaff(null)], [true, true, false, false]);
  assert.equal(groupRowLabel(group(1, { name: 'Chess Club' }), 'admin'), 'Open Chess Club. 1 member. You are an admin');
});

test('the permission matrix: what each role is offered for each member', () => {
  const offer = (viewerRole, targetRole, overrides = {}) => memberActions({
    viewerRole, targetRole, self: false, status: 'active', rolesSupported: true, ...overrides,
  });
  assert.deepEqual(offer('owner', 'member'), ['promote', 'remove', 'ban']);
  assert.deepEqual(offer('owner', 'admin'), ['transfer', 'demote', 'remove', 'ban']);
  assert.deepEqual(offer('admin', 'member'), ['remove', 'ban']);
  // An admin has nothing to offer on another admin, and nobody on the owner.
  assert.deepEqual(offer('admin', 'admin'), []);
  assert.deepEqual(offer('admin', 'owner'), []);
  assert.deepEqual(offer('owner', 'owner'), []);
  for (const target of ['owner', 'admin', 'member']) {
    assert.deepEqual(offer('member', target), [], `member on ${target}`);
    assert.deepEqual(offer(null, target), [], `non-member on ${target}`);
  }
  // Never on yourself, never in an archived group, never without server support.
  for (const viewer of ['owner', 'admin']) {
    assert.deepEqual(offer(viewer, viewer === 'owner' ? 'owner' : 'admin', { self: true }), []);
    assert.deepEqual(offer(viewer, 'member', { self: true }), []);
    assert.deepEqual(offer(viewer, 'member', { status: 'archived' }), []);
    assert.deepEqual(offer(viewer, 'member', { rolesSupported: false }), []);
  }
  // Promotion, demotion and transfer are never offered to an admin.
  for (const target of ['owner', 'admin', 'member']) {
    for (const action of offer('admin', target)) assert.ok(action === 'remove' || action === 'ban');
  }
});

test('Remove and Ban are worded as different actions, and every action asks first', () => {
  assert.deepEqual(Object.keys(adminActionCopy).sort(), ['ban', 'demote', 'promote', 'remove', 'transfer']);
  for (const copy of Object.values(adminActionCopy)) {
    assert.ok(copy.label.length > 3 && copy.confirm.length > 2 && copy.description.length > 10);
    assert.match(copy.title('Maya'), /Maya.*\?$/);
    assert.match(copy.done('Maya'), /Maya/);
    assert.doesNotMatch(`${copy.label} ${copy.description} ${copy.title('x')} ${copy.done('x')}`, /block/i);
  }
  assert.notEqual(adminActionCopy.remove.label, adminActionCopy.ban.label);
  assert.match(adminActionCopy.remove.description, /can join again/);
  assert.match(adminActionCopy.ban.description, /can’t join again/);
  // The risky ones are destructive; a transfer says what the owner gives up.
  assert.deepEqual(Object.entries(adminActionCopy).filter(([, copy]) => copy.destructive).map(([action]) => action).sort(), ['ban', 'remove', 'transfer']);
  assert.match(adminActionCopy.transfer.description, /become an admin and lose your owner powers/);
});

test('administration errors are neutral and reveal nothing about who is unavailable', () => {
  const kind = (code) => groupErrorKind({ code });
  assert.deepEqual(['PG007', 'PG008', 'PG009', 'PG010', 'PG011', 'PG012'].map(kind),
    ['banned', 'member-not-found', 'not-allowed', 'removal-limit', 'admin-limit', 'recipient-not-admin']);
  for (const code of roles.match(/errcode = '([A-Z0-9]+)'/g).map((match) => match.slice(11, -1))) {
    assert.notEqual(kind(code), 'network', `unmapped code ${code}`);
  }
  assert.equal(groupJoinErrors.banned, 'You can’t join this group.');
  assert.equal(groupAdminErrors['member-not-found'], 'That student isn’t in this group any more.');
  assert.match(groupAdminErrors['removal-limit'], /20 members in the last hour/);
  assert.match(groupAdminErrors['admin-limit'], /10 admins/);
  assert.match(groupAdminErrors.archived, /archived/);
  assert.equal(groupAdminErrors['name-taken'], GROUP_NAME_TAKEN);
  for (const message of Object.values(groupAdminErrors)) assert.doesNotMatch(message, /block|hidden|unavailable|PG0/i);
});

test('bans and history are paged newest first, and a ban never says who placed it', () => {
  const ban = groupBan({ banned_id: uuid(7), username: 'maya_c', display_name: 'Maya Chen', avatar_url: null, banned_at: stamp(9), can_unban: true });
  assert.deepEqual(ban, {
    banned_id: uuid(7), banned_at: stamp(9), can_unban: true,
    profile: { id: uuid(7), username: 'maya_c', display_name: 'Maya Chen', avatar_url: null },
  });
  assert.equal(groupBan({ banned_id: uuid(7), username: null, display_name: null, avatar_url: null, banned_at: stamp(9) }).can_unban, false);
  const bans = [3, 2, 1].map((n) => groupBan({ banned_id: uuid(n), username: 'u', display_name: 'U', avatar_url: null, banned_at: stamp(n), can_unban: false }));
  assert.deepEqual(buildGroupBanPage(bans, 2).nextCursor, { stamp: stamp(2), id: uuid(2) });
  assert.equal(buildGroupBanPage(bans, 3).nextCursor, null);
  const events = [3, 2, 1].map((n) => ({ id: uuid(n), action: 'member_removed', created_at: stamp(n) }));
  assert.deepEqual(buildGroupEventPage(events, 2).nextCursor, { stamp: stamp(2), id: uuid(2) });
});

test('the history reads as plain sentences, with deleted accounts named as such', () => {
  const event = (action, overrides = {}) => ({
    id: uuid(1), action, created_at: stamp(1),
    actor_username: 'maya_c', actor_display_name: 'Maya Chen', actor_missing: false,
    target_username: 'omar_k', target_display_name: 'Omar Khalil', target_missing: false, detail: null, ...overrides,
  });
  assert.equal(adminEventText(event('member_promoted')), 'Maya Chen made Omar Khalil an admin.');
  assert.equal(adminEventText(event('admin_demoted')), 'Maya Chen removed Omar Khalil’s admin role.');
  assert.equal(adminEventText(event('member_removed')), 'Maya Chen removed Omar Khalil from the group.');
  assert.equal(adminEventText(event('member_banned')), 'Maya Chen banned Omar Khalil.');
  assert.equal(adminEventText(event('member_unbanned')), 'Maya Chen lifted the ban on Omar Khalil.');
  assert.equal(adminEventText(event('ownership_transferred')), 'Maya Chen made Omar Khalil the owner.');
  assert.equal(adminEventText(event('details_updated', { detail: 'Chess Club' })), 'Maya Chen renamed the group to “Chess Club”.');
  assert.equal(adminEventText(event('details_updated', { target_display_name: null, target_username: null })), 'Maya Chen edited the group description.');
  assert.equal(adminEventText(event('member_removed', { actor_missing: true, actor_display_name: null, actor_username: null })),
    'A deleted student removed Omar Khalil from the group.');
  assert.equal(adminEventText(event('member_banned', { target_missing: true, target_display_name: null, target_username: null })),
    'Maya Chen banned a deleted student.');
  assert.equal(adminEventText(event('member_removed', { actor_display_name: '  ' })), '@maya_c removed Omar Khalil from the group.');
});

test('saving an edit is offered only when something would change', () => {
  const current = { name: 'Chess Club', description: 'Weekly games.' };
  assert.equal(groupDetailsChanged(current, '  Chess   Club ', ' Weekly games. '), false);
  assert.equal(groupDetailsChanged(current, 'Chess Club 2', 'Weekly games.'), true);
  assert.equal(groupDetailsChanged(current, 'Chess Club', ''), true);
  assert.equal(groupDetailsChanged({ name: 'Chess Club', description: null }, 'Chess Club', '   '), false);
});

test('the service sends a group and a student for each action, and never a role', () => {
  const service = feature['service.ts'];
  assert.match(service, /promote: 'promote_group_member',\s+demote: 'demote_group_admin',\s+remove: 'remove_group_member',\s+ban: 'ban_group_member',/);
  assert.match(service, /rpc\('transfer_group_ownership', \{ p_group_id: group, p_new_owner_id: member \}\)/);
  assert.match(service, /rpc\(adminFunctions\[action\], \{ p_group_id: group, p_member_id: member \}\)/);
  assert.match(service, /rpc\('unban_group_member', \{\s+p_group_id: requireGroupUuid\(groupId\), p_banned_id: requireGroupUuid\(bannedId\),\s+\}\)/);
  assert.match(service, /rpc\('update_group_details', \{\s+p_group_id: requireGroupUuid\(groupId\), p_name: name, p_description: description,\s+\}\)/);
  assert.match(service, /const group = requireGroupUuid\(groupId\);\s+const member = requireGroupUuid\(memberId\);/);
  assert.doesNotMatch(service, /p_role|role:\s*'(owner|admin)'|from\('group_bans'\)|from\('group_admin_events'\)/);
  // Both staff lists validate their cursor before it becomes arguments.
  assert.equal([...service.matchAll(/const before = cursor \? requireGroupCursor\(cursor\) : null;/g)].length, 2);
});

test('the member list offers management only through the rules, one action at a time', () => {
  const screen = feature['group-members-screen.tsx'];
  assert.match(screen, /manageable=\{actionsFor\(item\)\.length > 0\}/);
  assert.match(screen, /memberActions\(\{\s+viewerRole: details\.role, targetRole: member\.role, self: member\.user_id === userId,\s+status: details\.group\.status, rolesSupported: details\.rolesSupported,\s+\}\)/);
  assert.match(screen, /if \(!pending \|\| !groupId \|\| inFlight\.current\) return;/);
  assert.match(screen, /await runMemberAction\(action, groupId, member\.user_id\);/);
  // After any outcome the list and the viewer's own role come from the server again.
  assert.match(screen, /refresh\(\);\s+await reloadGroup\(\);\s+inFlight\.current = false;/);
  assert.match(screen, /accessibilityLabel=\{`Manage \$\{name\}`\}/);
  // The grouped entry for unavailable members has no Manage button.
  const entry = screen.slice(screen.indexOf('function UnavailableMembers('), screen.indexOf('// The members of one group'));
  assert.doesNotMatch(entry, /IconButton|onManage|Pressable|onPress/);
  // Nothing happens from the sheet itself: choosing only opens the confirmation.
  const sheet = feature['member-actions-sheet.tsx'];
  assert.doesNotMatch(sheet, /runMemberAction|\.rpc\(/);
  assert.match(sheet, /accessibilityLabel=\{`\$\{copy\.label\}: \$\{name\}`\}/);
  assert.match(screen, /onChoose=\{\(action\) => \{ if \(managing\) setPending\(\{ action, member: managing \}\); setManaging\(null\); \}\}/);
});

test('staff screens are reached from the group, hold their own states, and say when access is refused', () => {
  const details = feature['group-screen.tsx'];
  assert.match(details, /const staff = rolesSupported && isGroupStaff\(role\);/);
  assert.match(details, /const canEdit = rolesSupported && role === 'owner' && group\.status === 'active';/);
  assert.match(details, /\{canEdit \? <LinkRow icon=\{Pencil\} label="Edit group"/);
  assert.match(details, /\{staff \? <LinkRow icon=\{Ban\} label="Banned students"/);
  assert.match(details, /\{staff \? <LinkRow icon=\{History\} label="Admin history"/);
  for (const route of ['edit', 'bans', 'history']) {
    assert.ok(details.includes(`pathname: '/groups/[id]/${route}'`), route);
    const source = read(`../src/app/(protected)/groups/[id]/${route}.tsx`);
    assert.match(source, /if \(state\.status !== 'ready'\) return <ProfileStatus \/>;/, route);
    assert.match(source, /const groupId = isGroupUuid\(params\.id\) \? params\.id\.toLowerCase\(\) : null;/, route);
    assert.match(source, /key=\{`\$\{state\.profile\.id\}:\$\{groupId\}`\}/, route);
  }
  const bans = feature['group-bans-screen.tsx'];
  for (const text of ['Nobody is banned', 'Banned students aren’t available', 'Lift ban', 'They are not added back to the group.', 'Retry loading more']) {
    assert.ok(bans.includes(text), text);
  }
  assert.match(bans, /\{ban\.can_unban \? <Button variant="outline" size="sm"/);
  assert.match(bans, /if \(!pending \|\| !groupId \|\| inFlight\.current\) return;/);
  const history = feature['group-history-screen.tsx'];
  for (const text of ['Nothing yet', 'Admin history isn’t available', 'Retry loading more']) assert.ok(history.includes(text), text);
  assert.doesNotMatch(history, /Pressable|onPress=\{\(\) => (open|router)/);
  const edit = feature['edit-group-screen.tsx'];
  assert.match(edit, /state\.details\.role === 'owner' && state\.details\.rolesSupported && state\.details\.group\.status === 'active'/);
  assert.match(edit, /if \(inFlight\.current \|\| !changed \|\| groupNameError\(name\) \|\| groupDescriptionError\(description\)\) return;/);
  assert.match(edit, /title="Discard your changes\?"/);
  assert.ok(edit.includes('Only the owner can change a group’s name and description.'));
  assert.match(read('../src/app/(protected)/_layout.tsx'), /<Stack\.Screen name="groups\/\[id\]\/edit" options=\{\{ gestureEnabled: false \}\} \/>/);
});

test('the bottom bar is still exactly five destinations after Sprint 7B', () => {
  const bar = read('../src/components/navigation/tab-bar.tsx');
  const names = [...bar.matchAll(/\{ kind: '(?:tab|action)', name: '([a-z]+)'/g)].map((match) => match[1]);
  assert.deepEqual(names, ['home', 'discover', 'create', 'messages', 'account']);
  assert.equal([...read('../src/app/(protected)/(tabs)/_layout.tsx').matchAll(/<Tabs\.Screen /g)].length, 4);
});
