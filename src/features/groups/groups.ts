import type {
  Group, GroupAdminEventListing, GroupBanListing, GroupMemberListing, GroupRole, GroupViewerSummary, Profile,
} from '../../lib/database.types';

// Domain rules for groups: validation, cursors, pages and the wording of errors.
// No React and no network, so every rule here is covered by unit tests.

export const GROUP_NAME_MIN = 3;
export const GROUP_NAME_MAX = 60;
export const GROUP_DESCRIPTION_MAX = 500;
export const GROUP_PAGE_SIZE = 20;
export const GROUP_MEMBER_PAGE_SIZE = 30;
// Enforced by the database; repeated here only to word the messages.
export const GROUP_CREATION_LIMIT_PER_DAY = 3;
export const JOINED_GROUPS_LIMIT = 100;
export const GROUP_ADMIN_LIMIT = 10;
export const GROUP_REMOVALS_PER_HOUR = 20;

// What the app reads of a group directly: never who created it, and no count.
export type GroupRecord = Pick<Group, 'id' | 'name' | 'description' | 'status' | 'cover_url' | 'created_at'>;
// A group as shown: with its actual number of members, the same for every viewer.
export type GroupSummary = GroupRecord & { member_count: number };
// unavailable_member_count is how many of those members this viewer cannot see. It
// is only ever a number: nothing about an unavailable member reaches the app.
// roles_supported is false when the database predates roles: the app then offers
// no administration at all, instead of buttons that could only fail.
export type ViewerSummaries = Readonly<Record<string, {
  member_count: number; unavailable_member_count: number; my_role: GroupRole | null; roles_supported: boolean;
}>>;
// A group in the discovery list, with the viewer's own role in it (null: not a member).
export type DiscoverGroup = GroupSummary & { my_role: GroupRole | null };
export type MyGroup = { role: GroupRole; joined_at: string; group: GroupSummary };
// Presentation fields only, as in student search.
export type GroupMemberProfile = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'>;
export type GroupMemberRow = { user_id: string; role: GroupRole; joined_at: string; profile: GroupMemberProfile | null };

// --- Identifiers --------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isGroupUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

export function requireGroupUuid(value: unknown): string {
  if (!isGroupUuid(value)) throw new Error('Invalid group identifier.');
  return value.toLowerCase();
}

// --- Validation ---------------------------------------------------------------------

// The database stores names the same way: outer whitespace removed, inner runs
// collapsed to one space. Uniqueness then ignores letter case.
export function normalizeGroupName(input: string): string {
  return typeof input === 'string' ? input.replace(/\s+/gu, ' ').trim() : '';
}

export function normalizeGroupDescription(input: string | null | undefined): string | null {
  const value = typeof input === 'string' ? input.trim() : '';
  return value ? value : null;
}

// Control characters and invisible formatting characters, which the database
// refuses too: they would let two names look the same and still be different.
const INVISIBLE = /[\p{Cc}\u200B\u200E\u200F\u202A-\u202E\u2060-\u2069\uFEFF]/u;

export function groupNameError(input: string): string | null {
  const name = normalizeGroupName(input);
  const length = [...name].length;
  if (length === 0) return 'Give your group a name.';
  if (length < GROUP_NAME_MIN) return `Group names need at least ${GROUP_NAME_MIN} characters.`;
  if (length > GROUP_NAME_MAX) return `Group names can have up to ${GROUP_NAME_MAX} characters.`;
  if (INVISIBLE.test(name)) return 'Group names can’t contain invisible characters. Type the name again.';
  return null;
}

export function groupDescriptionError(input: string): string | null {
  const value = normalizeGroupDescription(input);
  return value && [...value].length > GROUP_DESCRIPTION_MAX
    ? `Descriptions can have up to ${GROUP_DESCRIPTION_MAX} characters.`
    : null;
}

// Whether leaving the form now would lose something.
export function hasGroupDraft(name: string, description: string) {
  return name.trim().length > 0 || description.trim().length > 0;
}

export type GroupCreateAttempt = { requestId: string; name: string; description: string | null };

// One request identifier per distinct form content: a retry of the same name and
// description reuses it, so a lost response can never create the group twice.
export function prepareGroupCreateAttempt(
  current: GroupCreateAttempt | null,
  name: string,
  description: string,
  createId: () => string,
): GroupCreateAttempt {
  if (groupNameError(name) || groupDescriptionError(description)) throw new Error('Invalid group.');
  const next = { name: normalizeGroupName(name), description: normalizeGroupDescription(description) };
  return current && current.name === next.name && current.description === next.description
    ? current
    : { requestId: requireGroupUuid(createId()), ...next };
}

// --- Cursors and pages --------------------------------------------------------------

export type GroupCursor = { stamp: string; id: string };
// unavailableCount comes with the first page of a member list only.
export type GroupPage<T> = { items: T[]; nextCursor: GroupCursor | null; unavailableCount?: number };

const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

// A cursor is only ever a timestamp exactly as the database printed it and an
// identifier; anything else is refused before it reaches a request.
export function requireGroupCursor(cursor: GroupCursor): GroupCursor {
  const id = requireGroupUuid(cursor?.id);
  const stamp = cursor.stamp;
  if (typeof stamp !== 'string' || !STAMP.test(stamp) || !Number.isFinite(Date.parse(stamp))) {
    throw new Error('Invalid group cursor.');
  }
  return { stamp, id };
}

// Keyset filter for a list ordered by a timestamp and then an identifier, both in
// the same direction. Strict validation keeps filter syntax out of the request, and
// the timestamp is passed through unchanged so PostgreSQL microseconds survive.
export function groupCursorFilter(
  stampColumn: 'created_at' | 'joined_at',
  idColumn: 'id' | 'group_id' | 'user_id',
  cursor: GroupCursor,
  direction: 'asc' | 'desc',
) {
  const { stamp, id } = requireGroupCursor(cursor);
  const operator = direction === 'asc' ? 'gt' : 'lt';
  return `${stampColumn}.${operator}.${stamp},and(${stampColumn}.eq.${stamp},${idColumn}.${operator}.${id})`;
}

export function requireGroupPageSize(limit: number) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Group page size must be between 1 and 50.');
  return limit;
}

// `rows` holds one more than `limit` when another page exists.
function buildPage<T>(rows: T[], limit: number, cursorOf: (item: T) => GroupCursor): GroupPage<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? cursorOf(last) : null };
}

export function buildGroupPage<T extends Pick<GroupRecord, 'id' | 'created_at'>>(rows: T[], limit: number): GroupPage<T> {
  return buildPage(rows, limit, (group) => ({ stamp: group.created_at, id: group.id }));
}

// A membership whose group could not be read is dropped rather than shown empty.
export type MyGroupRow = { group_id: string; role: GroupRole; joined_at: string; group: GroupRecord | null };

// The cursor points at the last membership read, whether or not its group is shown.
export function buildMyGroupRowPage(rows: MyGroupRow[], limit: number): GroupPage<MyGroupRow> {
  return buildPage(rows, limit, (row) => ({ stamp: row.joined_at, id: row.group_id }));
}

// A membership whose group or count could not be read is dropped rather than shown
// with a number the app made up.
export function myGroupsWithCounts(rows: MyGroupRow[], summaries: ViewerSummaries): MyGroup[] {
  return rows.flatMap(({ role, joined_at, group }) => {
    const summary = group ? summaries[group.id] : undefined;
    return group && summary ? [{ role, joined_at, group: { ...group, member_count: summary.member_count } }] : [];
  });
}

export function viewerSummariesById(rows: readonly GroupViewerSummary[]): ViewerSummaries {
  return Object.fromEntries(rows.map((row) => [row.group_id, {
    member_count: row.member_count,
    unavailable_member_count: unavailableMemberCount(row.unavailable_member_count),
    my_role: fullGroupRole(row.my_role, row.my_group_role),
    roles_supported: row.my_group_role !== undefined,
  }]));
}

const ROLES: readonly GroupRole[] = ['owner', 'admin', 'member'];

// The database reports a role twice: once in the column earlier app code reads,
// where an admin appears as a member, and once in full. The full one wins; without
// it (a database that predates roles) the earlier one is the whole truth.
export function fullGroupRole(earlier: unknown, full: unknown): GroupRole | null {
  if (ROLES.includes(full as GroupRole)) return full as GroupRole;
  return ROLES.includes(earlier as GroupRole) ? earlier as GroupRole : null;
}

// A whole number of members, never negative; anything else counts as none.
export function unavailableMemberCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function groupMemberRow(listing: GroupMemberListing): GroupMemberRow {
  return {
    user_id: listing.user_id, role: fullGroupRole(listing.role, listing.group_role) ?? 'member', joined_at: listing.joined_at,
    profile: { id: listing.user_id, username: listing.username, display_name: listing.display_name, avatar_url: listing.avatar_url },
  };
}

export function buildGroupMemberPage(rows: GroupMemberRow[], limit: number): GroupPage<GroupMemberRow> {
  return buildPage(rows, limit, (member) => ({ stamp: member.joined_at, id: member.user_id }));
}

// Each discovered group with the viewer's count and role. A group with no summary
// (it disappeared between the two requests) is dropped.
export function withViewerSummaries(groups: GroupRecord[], summaries: ViewerSummaries): DiscoverGroup[] {
  return groups.flatMap((group) => {
    const summary = summaries[group.id];
    return summary ? [{ ...group, member_count: summary.member_count, my_role: summary.my_role }] : [];
  });
}

export const discoverGroupId = (group: GroupSummary) => group.id;
export const myGroupId = (item: MyGroup) => item.group.id;
export const groupMemberId = (member: GroupMemberRow) => member.user_id;

// --- Paged list state ---------------------------------------------------------------

// `token` identifies the account and query a result belongs to. A result with
// another token is stale and is never shown or updated.
export type PagedResult<T> = {
  token: string;
  failed: boolean;
  refreshFailed: boolean;
  items: T[];
  nextCursor: GroupCursor | null;
  loadingMore: boolean;
  loadMoreFailed: boolean;
  // Members of this list that exist but cannot be shown to the viewer.
  unavailableCount: number;
};
export type PagedStatus = 'idle' | 'loading' | 'error' | 'empty' | 'ready';

export function mergeById<T>(current: T[], next: T[], idOf: (item: T) => string) {
  const seen = new Set(current.map(idOf));
  const merged = [...current];
  for (const item of next) {
    const id = idOf(item);
    if (seen.has(id)) continue;
    seen.add(id);
    merged.push(item);
  }
  return merged;
}

export function completedPage<T>(token: string, page: GroupPage<T>): PagedResult<T> {
  return {
    token, failed: false, refreshFailed: false, items: page.items, nextCursor: page.nextCursor, loadingMore: false, loadMoreFailed: false,
    unavailableCount: unavailableMemberCount(page.unavailableCount),
  };
}

// A first load that fails is an error. A reload that fails keeps what is on screen
// and only says so.
export function failedPage<T>(current: PagedResult<T> | null, token: string): PagedResult<T> {
  if (current?.token === token && !current.failed) return { ...current, refreshFailed: true };
  return { token, failed: true, refreshFailed: false, items: [], nextCursor: null, loadingMore: false, loadMoreFailed: false, unavailableCount: 0 };
}

export function beginLoadMore<T>(current: PagedResult<T> | null, token: string) {
  return current?.token === token ? { ...current, loadingMore: true, loadMoreFailed: false } : current;
}

export function appendPage<T>(current: PagedResult<T> | null, token: string, page: GroupPage<T>, idOf: (item: T) => string) {
  if (current?.token !== token) return current;
  return { ...current, items: mergeById(current.items, page.items, idOf), nextCursor: page.nextCursor, loadingMore: false, loadMoreFailed: false };
}

export function failLoadMore<T>(current: PagedResult<T> | null, token: string) {
  return current?.token === token ? { ...current, loadingMore: false, loadMoreFailed: true } : current;
}

export function pagedStatus<T>(token: string | null, result: PagedResult<T> | null): PagedStatus {
  if (!token) return 'idle';
  if (result?.token !== token) return 'loading';
  if (result.failed) return 'error';
  return result.items.length ? 'ready' : 'empty';
}

// --- Unavailable members ------------------------------------------------------------

// Members who exist but cannot be shown to this viewer appear as one grouped entry.
// The wording never says why they are unavailable.
export const UNAVAILABLE_MEMBERS_CAPTION = 'Profile not available';

export function unavailableMembersLabel(count: number) {
  const value = unavailableMemberCount(count);
  return value === 1 ? 'Penguin User' : `${value.toLocaleString('en-US')} Penguin Users`;
}

// The grouped entry belongs after the last visible member, so it is shown only once
// every page has been loaded: never while more members are loading, could still be
// loaded, or failed to load, and never when nobody is unavailable. It is rendered
// once, outside the paged rows, so loading pages can neither repeat it nor move it.
export function showUnavailableMembers(list: {
  status: PagedStatus; hasMore: boolean; loadingMore: boolean; loadMoreFailed: boolean; unavailableCount: number;
}) {
  return (list.status === 'ready' || list.status === 'empty')
    && !list.hasMore && !list.loadingMore && !list.loadMoreFailed
    && unavailableMemberCount(list.unavailableCount) > 0;
}

// --- Presentation -------------------------------------------------------------------

export function memberCountLabel(count: number) {
  const value = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `${value.toLocaleString('en-US')} ${value === 1 ? 'member' : 'members'}`;
}

// What the details screen offers. An owner never gets Leave; an archived group
// never gets Join; a member of an archived group can still leave.
export type GroupAction = 'join' | 'leave' | 'owner' | 'closed';

export function groupAction(status: Group['status'], role: GroupRole | null): GroupAction {
  if (role === 'owner') return 'owner';
  // An admin is a member with extra powers and leaves like one.
  if (role === 'admin' || role === 'member') return 'leave';
  return status === 'active' ? 'join' : 'closed';
}

export function groupBadge(status: Group['status'], role: GroupRole | null): 'Archived' | 'Owner' | 'Admin' | 'Joined' | null {
  if (status === 'archived') return 'Archived';
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  return role === 'member' ? 'Joined' : null;
}

// The badge beside a member in the list. Plain members have none.
export function memberRoleBadge(role: GroupRole): 'Owner' | 'Admin' | null {
  return role === 'owner' ? 'Owner' : role === 'admin' ? 'Admin' : null;
}

export function isGroupStaff(role: GroupRole | null) {
  return role === 'owner' || role === 'admin';
}

export function groupRowLabel(group: GroupSummary, role: GroupRole | null) {
  const badge = groupBadge(group.status, role);
  return [
    `Open ${group.name}`,
    memberCountLabel(group.member_count),
    badge === 'Owner' ? 'You own this group' : badge === 'Admin' ? 'You are an admin'
      : badge === 'Joined' ? 'You are a member' : badge,
    group.description,
  ].filter(Boolean).join('. ');
}

// --- Errors -------------------------------------------------------------------------

export type GroupErrorKind =
  | 'name-taken' | 'creation-limit' | 'joined-limit' | 'not-found' | 'archived'
  | 'owner-cannot-leave' | 'banned' | 'member-not-found' | 'not-allowed' | 'removal-limit'
  | 'admin-limit' | 'recipient-not-admin' | 'invalid' | 'forbidden' | 'network';

// Maps a database error code to what the app tells the student.
export function groupErrorKind(cause: unknown): GroupErrorKind {
  const code = cause && typeof cause === 'object' && 'code' in cause ? (cause as { code?: unknown }).code : null;
  if (code === 'PG001') return 'name-taken';
  if (code === 'PG002') return 'creation-limit';
  if (code === 'PG003') return 'joined-limit';
  if (code === 'PG004') return 'not-found';
  if (code === 'PG005') return 'archived';
  if (code === 'PG006') return 'owner-cannot-leave';
  if (code === 'PG007') return 'banned';
  if (code === 'PG008') return 'member-not-found';
  if (code === 'PG009') return 'not-allowed';
  if (code === 'PG010') return 'removal-limit';
  if (code === 'PG011') return 'admin-limit';
  if (code === 'PG012') return 'recipient-not-admin';
  if (code === '22023' || code === '23514') return 'invalid';
  if (code === '42501' || code === 'PGRST301') return 'forbidden';
  return 'network';
}

export const GROUP_NAME_TAKEN = 'A group with this name already exists. Try another name.';

const joinedLimit = `You can be in up to ${JOINED_GROUPS_LIMIT} groups. Leave one to join another.`;
const forbidden = 'Your session or profile is unavailable. Return to your profile and try again.';

const KINDS: readonly GroupErrorKind[] = [
  'name-taken', 'creation-limit', 'joined-limit', 'not-found', 'archived', 'owner-cannot-leave', 'banned',
  'member-not-found', 'not-allowed', 'removal-limit', 'admin-limit', 'recipient-not-admin', 'invalid', 'forbidden', 'network',
];

// Every kind gets wording for every action: the specific ones given here, and a
// plain "couldn't do that" for a code that should never reach this action.
function wording(fallback: string, specific: Partial<Record<GroupErrorKind, string>>): Record<GroupErrorKind, string> {
  return Object.fromEntries(KINDS.map((kind) => [kind, specific[kind] ?? fallback])) as Record<GroupErrorKind, string>;
}

const invalidDetails = `Group names need ${GROUP_NAME_MIN} to ${GROUP_NAME_MAX} characters, and descriptions up to ${GROUP_DESCRIPTION_MAX}.`;

export const groupCreateErrors = wording('Penguin couldn’t create the group. Try again.', {
  'name-taken': GROUP_NAME_TAKEN,
  'creation-limit': `You can create up to ${GROUP_CREATION_LIMIT_PER_DAY} groups a day. Try again tomorrow.`,
  'joined-limit': joinedLimit,
  invalid: invalidDetails,
  forbidden,
  network: 'Penguin couldn’t create the group. Check your connection and try again. What you wrote is still here.',
});

export const groupJoinErrors = wording('Penguin couldn’t join the group. Try again.', {
  'joined-limit': joinedLimit,
  'not-found': 'This group is no longer available.',
  archived: 'This group is archived and can’t take new members.',
  // Deliberately says nothing about why, or by whom.
  banned: 'You can’t join this group.',
  forbidden,
  network: 'Penguin couldn’t join the group. Check your connection and try again.',
});

export const groupLeaveErrors = wording('Penguin couldn’t leave the group. Try again.', {
  'not-found': 'This group is no longer available.',
  'owner-cannot-leave': 'You own this group. Make an admin the owner before you leave.',
  forbidden,
  network: 'Penguin couldn’t leave the group. Check your connection and try again.',
});

// Promote, demote, transfer, remove, ban, unban and edit. "member-not-found" is one
// neutral sentence on purpose: the database gives the same answer for a student who
// left and for one who is unavailable to the caller, and so does the app.
export const groupAdminErrors = wording('Penguin couldn’t do that. Try again.', {
  'name-taken': GROUP_NAME_TAKEN,
  'not-found': 'This group is no longer available.',
  archived: 'This group is archived and can’t be changed.',
  'member-not-found': 'That student isn’t in this group any more.',
  'not-allowed': 'You can’t do that to this member.',
  'removal-limit': `You’ve removed ${GROUP_REMOVALS_PER_HOUR} members in the last hour. Try again later.`,
  'admin-limit': `A group can have up to ${GROUP_ADMIN_LIMIT} admins.`,
  'recipient-not-admin': 'Make them an admin first.',
  invalid: invalidDetails,
  forbidden: 'You don’t have permission to do that any more.',
  network: 'Penguin couldn’t do that. Check your connection and try again.',
});

// --- Administration -----------------------------------------------------------------

export type GroupAdminAction = 'promote' | 'demote' | 'transfer' | 'remove' | 'ban';

// What the viewer may do to one listed member. The database enforces the same
// rules; this only decides which choices are offered. Nobody acts on themselves or
// on the owner, an admin acts on plain members only, and an archived group or a
// database without roles offers nothing.
export function memberActions(input: {
  viewerRole: GroupRole | null; targetRole: GroupRole; self: boolean; status: Group['status']; rolesSupported: boolean;
}): GroupAdminAction[] {
  const { viewerRole, targetRole, self, status, rolesSupported } = input;
  if (!rolesSupported || status !== 'active' || self || targetRole === 'owner') return [];
  if (viewerRole === 'owner') {
    return targetRole === 'admin' ? ['transfer', 'demote', 'remove', 'ban'] : ['promote', 'remove', 'ban'];
  }
  return viewerRole === 'admin' && targetRole === 'member' ? ['remove', 'ban'] : [];
}

type AdminActionCopy = {
  label: string; title: (name: string) => string; description: string; confirm: string;
  destructive: boolean; done: (name: string) => string;
};

// Remove and Ban are worded so they cannot be confused: one lets the student come
// back, the other does not.
export const adminActionCopy: Record<GroupAdminAction, AdminActionCopy> = {
  promote: {
    label: 'Make admin',
    title: (name) => `Make ${name} an admin?`,
    description: 'Admins can remove and ban members. They can’t manage other admins or edit the group.',
    confirm: 'Make admin', destructive: false,
    done: (name) => `${name} is now an admin.`,
  },
  demote: {
    label: 'Remove admin role',
    title: (name) => `Remove ${name}’s admin role?`,
    description: 'They stay in the group as a member.',
    confirm: 'Remove role', destructive: false,
    done: (name) => `${name} is a member again.`,
  },
  transfer: {
    label: 'Make owner',
    title: (name) => `Make ${name} the owner?`,
    description: 'You will become an admin and lose your owner powers at once. Only the new owner can give ownership back.',
    confirm: 'Transfer ownership', destructive: true,
    done: (name) => `${name} now owns this group. You are an admin.`,
  },
  remove: {
    label: 'Remove from group',
    title: (name) => `Remove ${name} from this group?`,
    description: 'They can join again whenever they like. To stop that, ban them instead.',
    confirm: 'Remove', destructive: true,
    done: (name) => `${name} was removed.`,
  },
  ban: {
    label: 'Ban from group',
    title: (name) => `Ban ${name} from this group?`,
    description: 'They are removed and can’t join again unless the ban is lifted.',
    confirm: 'Ban', destructive: true,
    done: (name) => `${name} was banned.`,
  },
};

export type GroupBan = { banned_id: string; banned_at: string; can_unban: boolean; profile: GroupMemberProfile };

export function groupBan(listing: GroupBanListing): GroupBan {
  return {
    banned_id: listing.banned_id, banned_at: listing.banned_at, can_unban: listing.can_unban === true,
    profile: { id: listing.banned_id, username: listing.username, display_name: listing.display_name, avatar_url: listing.avatar_url },
  };
}

export function buildGroupBanPage(rows: GroupBan[], limit: number): GroupPage<GroupBan> {
  return buildPage(rows, limit, (ban) => ({ stamp: ban.banned_at, id: ban.banned_id }));
}

export function buildGroupEventPage(rows: GroupAdminEventListing[], limit: number): GroupPage<GroupAdminEventListing> {
  return buildPage(rows, limit, (event) => ({ stamp: event.created_at, id: event.id }));
}

export const groupBanId = (ban: GroupBan) => ban.banned_id;
export const groupEventId = (event: GroupAdminEventListing) => event.id;

function eventName(displayName: string | null, username: string | null, missing: boolean, fallback: string) {
  if (missing) return fallback;
  return displayName?.trim() || (username ? `@${username}` : fallback);
}

// One line of the administration history, in plain words.
export function adminEventText(event: GroupAdminEventListing) {
  const actor = eventName(event.actor_display_name, event.actor_username, event.actor_missing, 'A deleted student');
  const target = eventName(event.target_display_name, event.target_username, event.target_missing, 'a deleted student');
  switch (event.action) {
    case 'member_promoted': return `${actor} made ${target} an admin.`;
    case 'admin_demoted': return `${actor} removed ${target}’s admin role.`;
    case 'member_removed': return `${actor} removed ${target} from the group.`;
    case 'member_banned': return `${actor} banned ${target}.`;
    case 'member_unbanned': return `${actor} lifted the ban on ${target}.`;
    case 'ownership_transferred': return `${actor} made ${target} the owner.`;
    case 'details_updated': return event.detail
      ? `${actor} renamed the group to “${event.detail}”.`
      : `${actor} edited the group description.`;
    default: return `${actor} changed the group.`;
  }
}

// Whether saving the edit form would change anything.
export function groupDetailsChanged(current: Pick<Group, 'name' | 'description'>, name: string, description: string) {
  return normalizeGroupName(name) !== current.name || normalizeGroupDescription(description) !== (current.description ?? null);
}
