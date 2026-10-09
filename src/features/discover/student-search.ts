import type { Profile } from '../../lib/database.types';

// What a search result shows of a student: presentation fields only.
export type StudentResult = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url'> & {
  institution: { name: string } | null;
  field: { name: string } | null;
};
// Results are ordered by username, which is unique, so it is the whole cursor.
export type StudentCursor = string;
export type StudentPage = { items: StudentResult[]; nextCursor: StudentCursor | null };
export type StudentSearchStatus = 'idle' | 'loading' | 'error' | 'empty' | 'ready';
// `token` identifies the account, attempt and search a result belongs to. A result
// with another token is stale and is never shown or updated.
export type StudentSearchResult = {
  token: string;
  failed: boolean;
  items: StudentResult[];
  nextCursor: StudentCursor | null;
  loadingMore: boolean;
  loadMoreFailed: boolean;
};

export function isStudentCursor(value: unknown): value is StudentCursor {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9_]{2,29}$/.test(value);
}

export function buildStudentPage(rows: StudentResult[], limit: number): StudentPage {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: rows.length > limit && isStudentCursor(last?.username) ? last.username : null,
  };
}

export function mergeStudentResults(current: StudentResult[], next: StudentResult[]) {
  const seen = new Set(current.map(({ id }) => id));
  const merged = [...current];
  for (const student of next) {
    if (seen.has(student.id)) continue;
    seen.add(student.id);
    merged.push(student);
  }
  return merged;
}

export function studentDetail(student: Pick<StudentResult, 'institution' | 'field'>) {
  return [student.institution?.name?.trim(), student.field?.name?.trim()].filter(Boolean).join(' · ');
}

export function completedStudentSearch(token: string, page: StudentPage): StudentSearchResult {
  return { token, failed: false, items: page.items, nextCursor: page.nextCursor, loadingMore: false, loadMoreFailed: false };
}

export function failedStudentSearch(token: string): StudentSearchResult {
  return { token, failed: true, items: [], nextCursor: null, loadingMore: false, loadMoreFailed: false };
}

export function beginStudentLoadMore(current: StudentSearchResult | null, token: string) {
  return current?.token === token ? { ...current, loadingMore: true, loadMoreFailed: false } : current;
}

export function appendStudentPage(current: StudentSearchResult | null, token: string, page: StudentPage) {
  if (current?.token !== token) return current;
  return {
    ...current,
    items: mergeStudentResults(current.items, page.items),
    nextCursor: page.nextCursor,
    loadingMore: false,
    loadMoreFailed: false,
  };
}

export function failStudentLoadMore(current: StudentSearchResult | null, token: string) {
  return current?.token === token ? { ...current, loadingMore: false, loadMoreFailed: true } : current;
}

export function studentSearchStatus(
  searchable: boolean,
  token: string,
  result: StudentSearchResult | null,
): StudentSearchStatus {
  if (!searchable) return 'idle';
  if (result?.token !== token) return 'loading';
  if (result.failed) return 'error';
  return result.items.length ? 'ready' : 'empty';
}
