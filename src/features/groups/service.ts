import { supabase } from '@/lib/supabase';
import type { GroupRole } from '@/lib/database.types';
import { groupSearchFilters } from '@/features/discover/search-query';
import {
  buildGroupBanPage,
  buildGroupEventPage,
  buildGroupMemberPage,
  buildGroupPage,
  buildMyGroupRowPage,
  GROUP_MEMBER_PAGE_SIZE,
  GROUP_PAGE_SIZE,
  groupBan,
  groupCursorFilter,
  groupMemberRow,
  myGroupsWithCounts,
  requireGroupCursor,
  requireGroupPageSize,
  requireGroupUuid,
  viewerSummariesById,
  withViewerSummaries,
  type GroupAdminAction,
  type GroupCreateAttempt,
  type GroupCursor,
  type GroupMemberRow,
  type GroupRecord,
  type GroupSummary,
  type MyGroupRow,
} from './groups';

function client() {
  if (!supabase) throw new Error('Groups are not configured.');
  return supabase;
}

// No member count here: it comes from viewerSummaries, with the viewer's role.
const GROUP = 'id,name,description,status,created_at' as const;

// For these groups: the actual member count, how many members are unavailable to
// the signed-in student, and their own role. The database works all three out for
// the caller; no user is sent, and nothing about an unavailable member comes back.
async function viewerSummaries(groupIds: readonly string[], signal?: AbortSignal) {
  if (!groupIds.length) return viewerSummariesById([]);
  let request = client().rpc('get_group_viewer_summaries', { p_group_ids: groupIds.map(requireGroupUuid) });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return viewerSummariesById(data);
}

// Active groups, newest first, optionally narrowed to those whose name or
// description contains every search term. There is no ranking. Each group carries
// the viewer's count and role, so the list can say "Joined" truthfully.
export async function listGroups({ terms = [], cursor, limit = GROUP_PAGE_SIZE, signal }: {
  terms?: readonly string[];
  cursor?: GroupCursor;
  limit?: number;
  signal?: AbortSignal;
} = {}) {
  let query = client().from('groups').select(GROUP).eq('status', 'active');
  if (terms.length) for (const filter of groupSearchFilters(terms)) query = query.or(filter);
  if (cursor) query = query.or(groupCursorFilter('created_at', 'id', cursor, 'desc'));
  let request = query.order('created_at', { ascending: false }).order('id', { ascending: false })
    .limit(requireGroupPageSize(limit) + 1);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  const page = buildGroupPage(data as GroupRecord[], limit);
  const summaries = await viewerSummaries(page.items.map(({ id }) => id), signal);
  return { items: withViewerSummaries(page.items, summaries), nextCursor: page.nextCursor };
}

// The groups the signed-in student is in, most recently joined first, including
// archived ones. Row-level security returns only the caller's own memberships; the
// user id narrows nothing more than that.
export async function listMyGroups({ userId, cursor, limit = GROUP_PAGE_SIZE, signal }: {
  userId: string;
  cursor?: GroupCursor;
  limit?: number;
  signal?: AbortSignal;
}) {
  let query = client().from('group_members')
    .select(`group_id,role,joined_at,group:groups!group_members_group_id_fkey(${GROUP})`)
    .eq('user_id', requireGroupUuid(userId));
  if (cursor) query = query.or(groupCursorFilter('joined_at', 'group_id', cursor, 'desc'));
  let request = query.order('joined_at', { ascending: false }).order('group_id', { ascending: false })
    .limit(requireGroupPageSize(limit) + 1);
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  const page = buildMyGroupRowPage(data as unknown as MyGroupRow[], limit);
  const summaries = await viewerSummaries(page.items.map((row) => row.group_id), signal);
  return { items: myGroupsWithCounts(page.items, summaries), nextCursor: page.nextCursor };
}

// Members of one group in the order they joined, so the owner comes first. The
// database leaves out anyone who is unavailable to the caller and never sends their
// identity. The first page also carries how many members were left out, so the list
// can account for them with one grouped entry. There is no request for the groups of
// a given student.
export async function listGroupMembers({ groupId, cursor, limit = GROUP_MEMBER_PAGE_SIZE, signal }: {
  groupId: string;
  cursor?: GroupCursor;
  limit?: number;
  signal?: AbortSignal;
}) {
  const after = cursor ? requireGroupCursor(cursor) : null;
  let request = client().rpc('list_group_members', {
    p_group_id: requireGroupUuid(groupId),
    p_after_joined_at: after?.stamp ?? null,
    p_after_user_id: after?.id ?? null,
    p_limit: requireGroupPageSize(limit) + 1,
  });
  if (signal) request = request.abortSignal(signal);
  const [{ data, error }, summaries] = await Promise.all([
    request,
    after ? null : viewerSummaries([requireGroupUuid(groupId)], signal),
  ]);
  if (error) throw error;
  const page = buildGroupMemberPage(data.map(groupMemberRow), limit);
  return summaries ? { ...page, unavailableCount: summaries[requireGroupUuid(groupId)]?.unavailable_member_count ?? 0 } : page;
}

// rolesSupported is false while the database predates roles; the app then offers
// no administration.
export type GroupDetails = { group: GroupSummary; role: GroupRole | null; owner: GroupMemberRow | null; rolesSupported: boolean };

// One group with its actual member count, the viewer's role, and its owner. null
// means the group does not exist. The owner is the first listed member when that
// member has the owner role; it is null when the group has none (archived) or when
// the owner is unavailable to the viewer. Nothing stands in for a missing owner.
export async function getGroupDetails(groupId: string, signal?: AbortSignal): Promise<GroupDetails | null> {
  const id = requireGroupUuid(groupId);
  let groupRequest = client().from('groups').select(GROUP).eq('id', id);
  if (signal) groupRequest = groupRequest.abortSignal(signal);
  const [group, summaries, first] = await Promise.all([
    groupRequest.maybeSingle(),
    viewerSummaries([id], signal),
    listGroupMembers({ groupId: id, limit: 1, signal }),
  ]);
  if (group.error) throw group.error;
  const summary = summaries[id];
  if (!group.data || !summary) return null;
  const owner = first.items[0]?.role === 'owner' ? first.items[0] : null;
  return {
    group: { ...(group.data as GroupRecord), member_count: summary.member_count }, role: summary.my_role, owner,
    rolesSupported: summary.roles_supported,
  };
}

// The database decides who the creator and owner are; neither is sent from the
// app. requestId is reused for every retry of the same form content.
export async function createGroup({ requestId, name, description }: GroupCreateAttempt): Promise<string> {
  const { data, error } = await client().rpc('create_group_idempotent', {
    p_request_id: requireGroupUuid(requestId),
    p_name: name,
    p_description: description,
  }).single();
  if (error) throw error;
  return requireGroupUuid(data.id);
}

// Joining is always as a plain member and is safe to repeat.
export async function joinGroup(groupId: string) {
  const { error } = await client().rpc('join_group', { p_group_id: requireGroupUuid(groupId) });
  if (error) throw error;
}

// Safe to repeat: leaving a group you are not in does nothing.
export async function leaveGroup(groupId: string) {
  const { error } = await client().rpc('leave_group', { p_group_id: requireGroupUuid(groupId) });
  if (error) throw error;
}

// --- Administration -----------------------------------------------------------------
// Every call names a group and a student and nothing else. The database decides who
// the caller is and whether they may do it; no role is ever sent.

const adminFunctions = {
  promote: 'promote_group_member',
  demote: 'demote_group_admin',
  remove: 'remove_group_member',
  ban: 'ban_group_member',
} as const;

export async function runMemberAction(action: GroupAdminAction, groupId: string, memberId: string) {
  const group = requireGroupUuid(groupId);
  const member = requireGroupUuid(memberId);
  const { error } = action === 'transfer'
    ? await client().rpc('transfer_group_ownership', { p_group_id: group, p_new_owner_id: member })
    : await client().rpc(adminFunctions[action], { p_group_id: group, p_member_id: member });
  if (error) throw error;
}

// Lifting a ban does not add the student back.
export async function unbanMember(groupId: string, bannedId: string) {
  const { error } = await client().rpc('unban_group_member', {
    p_group_id: requireGroupUuid(groupId), p_banned_id: requireGroupUuid(bannedId),
  });
  if (error) throw error;
}

export async function updateGroupDetails({ groupId, name, description }: { groupId: string; name: string; description: string | null }) {
  const { error } = await client().rpc('update_group_details', {
    p_group_id: requireGroupUuid(groupId), p_name: name, p_description: description,
  });
  if (error) throw error;
}

// Students banned from one group, newest first. Staff only; the database refuses
// everyone else and leaves out anyone unavailable to the caller.
export async function listGroupBans({ groupId, cursor, limit = GROUP_MEMBER_PAGE_SIZE, signal }: {
  groupId: string;
  cursor?: GroupCursor;
  limit?: number;
  signal?: AbortSignal;
}) {
  const before = cursor ? requireGroupCursor(cursor) : null;
  let request = client().rpc('list_group_bans', {
    p_group_id: requireGroupUuid(groupId),
    p_before_banned_at: before?.stamp ?? null,
    p_before_banned_id: before?.id ?? null,
    p_limit: requireGroupPageSize(limit) + 1,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return buildGroupBanPage(data.map(groupBan), limit);
}

// The administration history of one group, newest first. Staff only. It carries
// names and no account identifier.
export async function listGroupAdminEvents({ groupId, cursor, limit = GROUP_MEMBER_PAGE_SIZE, signal }: {
  groupId: string;
  cursor?: GroupCursor;
  limit?: number;
  signal?: AbortSignal;
}) {
  const before = cursor ? requireGroupCursor(cursor) : null;
  let request = client().rpc('list_group_admin_events', {
    p_group_id: requireGroupUuid(groupId),
    p_before_created_at: before?.stamp ?? null,
    p_before_id: before?.id ?? null,
    p_limit: requireGroupPageSize(limit) + 1,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return buildGroupEventPage(data, limit);
}
