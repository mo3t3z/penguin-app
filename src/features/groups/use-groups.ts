import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/provider';
import { SEARCH_DEBOUNCE_MS, searchKey, termsFromKey } from '@/features/discover/search-query';
import {
  appendPage,
  beginLoadMore,
  completedPage,
  discoverGroupId,
  failedPage,
  groupBanId,
  groupEventId,
  failLoadMore,
  groupMemberId,
  myGroupId,
  pagedStatus,
  type GroupCursor,
  type GroupPage,
  type PagedResult,
} from './groups';
import {
  getGroupDetails, listGroupAdminEvents, listGroupBans, listGroupMembers, listGroups, listMyGroups, type GroupDetails,
} from './service';

const none: never[] = [];

// One paged list for the signed-in student. `token` names the account and query the
// list belongs to (null: nothing to load); a response for another token is never
// shown. `load` must keep its identity while the token is unchanged. `refresh`
// reloads the first page and keeps what is on screen until the answer arrives.
function usePagedList<T>(
  token: string | null,
  load: (cursor: GroupCursor | undefined, signal: AbortSignal) => Promise<GroupPage<T>>,
  idOf: (item: T) => string,
  delayMs = 0,
) {
  const [result, setResult] = useState<PagedResult<T> | null>(null);
  const [reload, setReload] = useState(0);
  const immediate = useRef(false);
  const generation = useRef(0);
  const moreInFlight = useRef(false);

  useEffect(() => {
    if (!token) return;
    const request = ++generation.current;
    moreInFlight.current = false;
    const controller = new AbortController();
    // Typing waits for a pause; a retry or a refresh does not.
    const delay = immediate.current ? 0 : delayMs;
    immediate.current = false;
    const timer = setTimeout(() => {
      load(undefined, controller.signal)
        .then((page) => { if (request === generation.current) setResult(completedPage(token, page)); })
        .catch(() => { if (request === generation.current) setResult((current) => failedPage(current, token)); });
    }, delay);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [delayMs, load, reload, token]);

  const held = token && result?.token === token ? result : null;
  const nextCursor = held && !held.failed ? held.nextCursor : null;

  const loadMore = useCallback(() => {
    if (!token || !nextCursor || moreInFlight.current) return;
    const request = generation.current;
    moreInFlight.current = true;
    setResult((current) => beginLoadMore(current, token));
    load(nextCursor, new AbortController().signal)
      .then((page) => { if (request === generation.current) setResult((current) => appendPage(current, token, page, idOf)); })
      .catch(() => { if (request === generation.current) setResult((current) => failLoadMore(current, token)); })
      .finally(() => { if (request === generation.current) moreInFlight.current = false; });
  }, [idOf, load, nextCursor, token]);

  const refresh = useCallback(() => {
    immediate.current = true;
    setReload((value) => value + 1);
  }, []);

  return {
    status: pagedStatus(token, result),
    items: held?.items ?? (none as T[]),
    hasMore: Boolean(nextCursor),
    loadingMore: held?.loadingMore ?? false,
    loadMoreFailed: held?.loadMoreFailed ?? false,
    refreshFailed: held?.refreshFailed ?? false,
    unavailableCount: held?.unavailableCount ?? 0,
    loadMore,
    refresh,
  };
}


function useSignedInUser() {
  const { session, loading, recovery } = useAuth();
  const userId = session?.user.id ?? null;
  return userId && !loading && !recovery ? userId : null;
}

// The groups the signed-in student is in, most recently joined first.
export function useMyGroups() {
  const userId = useSignedInUser();
  const load = useCallback(
    (cursor: GroupCursor | undefined, signal: AbortSignal) => listMyGroups({ userId: userId ?? '', cursor, signal }),
    [userId],
  );
  return usePagedList(userId ? `mine:${userId}` : null, load, myGroupId);
}

// Active groups, newest first; with a search, only those matching every word.
// Typing is debounced; an unsearchable query (under two characters) lists everything.
export function useGroupDiscovery(query: string) {
  const userId = useSignedInUser();
  const key = searchKey(query);
  const load = useCallback(
    (cursor: GroupCursor | undefined, signal: AbortSignal) => listGroups({ terms: termsFromKey(key), cursor, signal }),
    [key],
  );
  return { key, ...usePagedList(userId ? `discover:${userId}:${key}` : null, load, discoverGroupId, key ? SEARCH_DEBOUNCE_MS : 0) };
}

export function useGroupMembers(groupId: string | null) {
  const userId = useSignedInUser();
  const load = useCallback(
    (cursor: GroupCursor | undefined, signal: AbortSignal) => listGroupMembers({ groupId: groupId ?? '', cursor, signal }),
    [groupId],
  );
  return usePagedList(userId && groupId ? `members:${userId}:${groupId}` : null, load, groupMemberId);
}

// Students banned from one group. Staff only: for anyone else the database refuses
// and the list reports an error.
export function useGroupBans(groupId: string | null) {
  const userId = useSignedInUser();
  const load = useCallback(
    (cursor: GroupCursor | undefined, signal: AbortSignal) => listGroupBans({ groupId: groupId ?? '', cursor, signal }),
    [groupId],
  );
  return usePagedList(userId && groupId ? `bans:${userId}:${groupId}` : null, load, groupBanId);
}

// The administration history of one group. Staff only.
export function useGroupAdminEvents(groupId: string | null) {
  const userId = useSignedInUser();
  const load = useCallback(
    (cursor: GroupCursor | undefined, signal: AbortSignal) => listGroupAdminEvents({ groupId: groupId ?? '', cursor, signal }),
    [groupId],
  );
  return usePagedList(userId && groupId ? `history:${userId}:${groupId}` : null, load, groupEventId);
}

export type GroupDetailsState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'missing' }
  | { status: 'ready'; details: GroupDetails; refreshFailed: boolean };

type HeldDetails = { token: string; state: GroupDetailsState };

function loadedDetails(token: string, details: GroupDetails | null): HeldDetails {
  return { token, state: details ? { status: 'ready', details, refreshFailed: false } : { status: 'missing' } };
}

// A first load that fails is an error. A reload that fails keeps the group on
// screen and only says so.
function failedDetails(current: HeldDetails | null, token: string): HeldDetails {
  return current?.token === token && current.state.status === 'ready'
    ? { token, state: { ...current.state, refreshFailed: true } }
    : { token, state: { status: 'failed' } };
}

// One group for the signed-in student. `reload` asks again and keeps the group on
// screen meanwhile; it resolves once the answer is shown, so a Join or Leave button
// can stay busy until the screen is truthful again.
export function useGroupDetails(groupId: string | null) {
  const userId = useSignedInUser();
  const token = userId && groupId ? `${userId}:${groupId}` : null;
  const [held, setHeld] = useState<HeldDetails | null>(null);
  const generation = useRef(0);

  useEffect(() => {
    if (!token || !userId || !groupId) return;
    const request = ++generation.current;
    getGroupDetails(groupId)
      .then((details) => { if (request === generation.current) setHeld(loadedDetails(token, details)); })
      .catch(() => { if (request === generation.current) setHeld((current) => failedDetails(current, token)); });
    // A response that arrives after the account or group changed is dropped.
    return () => { generation.current += 1; };
  }, [groupId, token, userId]);

  const reload = useCallback(async () => {
    if (!token || !userId || !groupId) return;
    const request = ++generation.current;
    try {
      const details = await getGroupDetails(groupId);
      if (request === generation.current) setHeld(loadedDetails(token, details));
    } catch {
      if (request === generation.current) setHeld((current) => failedDetails(current, token));
    }
  }, [groupId, token, userId]);

  const retry = useCallback(() => {
    setHeld(null);
    void reload();
  }, [reload]);

  const state: GroupDetailsState = !groupId ? { status: 'missing' }
    : held && held.token === token ? held.state : { status: 'loading' };
  return { state, reload, retry };
}
