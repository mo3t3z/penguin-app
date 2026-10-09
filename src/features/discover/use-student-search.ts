import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth/provider';
import { SEARCH_DEBOUNCE_MS, searchKey, termsFromKey } from './search-query';
import { searchStudents } from './service';
import {
  appendStudentPage,
  beginStudentLoadMore,
  completedStudentSearch,
  failStudentLoadMore,
  failedStudentSearch,
  studentSearchStatus,
  type StudentSearchResult,
} from './student-search';

const noStudents: StudentSearchResult['items'] = [];

// Debounced student search for the signed-in user. Each result carries the token
// of the account, attempt and search that produced it, so a response for an older
// search or another account is never shown.
export function useStudentSearch(query: string, pageSize = 20) {
  const { session, loading: authLoading, recovery } = useAuth();
  const userId = session?.user.id ?? null;
  const enabled = Boolean(userId) && !authLoading && !recovery;
  const key = searchKey(query);
  const searchable = enabled && key.length > 0;
  const [attempt, setAttempt] = useState(0);
  const token = `${userId}:${attempt}:${key}`;
  const [result, setResult] = useState<StudentSearchResult | null>(null);
  const immediate = useRef(false);
  const moreControllers = useRef(new Set<AbortController>());
  const moreInFlight = useRef<string | null>(null);

  useEffect(() => {
    if (!searchable) return;
    const pendingPages = moreControllers.current;
    const controller = new AbortController();
    let active = true;
    // Typing waits for a pause; "Try again" does not.
    const delay = immediate.current ? 0 : SEARCH_DEBOUNCE_MS;
    immediate.current = false;
    const timer = setTimeout(() => {
      searchStudents({ terms: termsFromKey(key), limit: pageSize, signal: controller.signal })
        .then((page) => { if (active) setResult(completedStudentSearch(token, page)); })
        .catch(() => { if (active) setResult(failedStudentSearch(token)); });
    }, delay);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
      pendingPages.forEach((pending) => pending.abort());
      pendingPages.clear();
    };
  }, [key, pageSize, searchable, token]);

  const current = searchable && result?.token === token ? result : null;
  const nextCursor = current && !current.failed ? current.nextCursor : null;

  const loadMore = useCallback(() => {
    if (!nextCursor || moreInFlight.current === token) return;
    moreInFlight.current = token;
    const controller = new AbortController();
    const pendingPages = moreControllers.current;
    pendingPages.add(controller);
    setResult((latest) => beginStudentLoadMore(latest, token));
    searchStudents({ terms: termsFromKey(key), cursor: nextCursor, limit: pageSize, signal: controller.signal })
      .then((page) => setResult((latest) => appendStudentPage(latest, token, page)))
      .catch(() => setResult((latest) => failStudentLoadMore(latest, token)))
      .finally(() => {
        pendingPages.delete(controller);
        if (moreInFlight.current === token) moreInFlight.current = null;
      });
  }, [key, nextCursor, pageSize, token]);

  const retry = useCallback(() => {
    immediate.current = true;
    setAttempt((value) => value + 1);
  }, []);

  return {
    status: studentSearchStatus(searchable, token, result),
    items: current?.items ?? noStudents,
    hasMore: Boolean(nextCursor),
    loadingMore: current?.loadingMore ?? false,
    loadMoreFailed: current?.loadMoreFailed ?? false,
    loadMore,
    retry,
  };
}
