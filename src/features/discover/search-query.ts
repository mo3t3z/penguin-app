// Search text is reduced to plain words before it reaches a query. Only letters,
// digits and combining marks survive, so a term can never contain a PostgREST
// filter character (, . : ( ) " *) or a LIKE wildcard (% _ \) and needs no quoting.
export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 60;
export const SEARCH_MAX_TERMS = 5;
export const SEARCH_DEBOUNCE_MS = 350;

const WORDS = /[\p{L}\p{N}\p{M}]+/gu;
const WORD = /^[\p{L}\p{N}\p{M}]+$/u;

export function searchTerms(input: string): string[] {
  if (typeof input !== 'string') return [];
  const bounded = [...input.normalize('NFC')].slice(0, SEARCH_MAX_LENGTH).join('').toLowerCase();
  return [...new Set(bounded.match(WORDS) ?? [])].slice(0, SEARCH_MAX_TERMS);
}

// Canonical form of a search: equal keys always produce the same request, and an
// empty key means there is nothing to search for yet.
export function searchKey(input: string): string {
  const terms = searchTerms(input);
  return [...terms.join('')].length >= SEARCH_MIN_LENGTH ? terms.join(' ') : '';
}

export function termsFromKey(key: string): string[] {
  return key ? key.split(' ') : [];
}

// One PostgREST `or` group per term; the groups are combined with AND, so every
// word must appear in the display name or the username.
export function studentSearchFilters(terms: readonly string[]): string[] {
  if (!Array.isArray(terms) || terms.length < 1 || terms.length > SEARCH_MAX_TERMS) {
    throw new Error('Invalid search.');
  }
  return terms.map((term) => {
    if (typeof term !== 'string' || !WORD.test(term) || [...term].length > SEARCH_MAX_LENGTH) {
      throw new Error('Invalid search.');
    }
    return `display_name.ilike.*${term}*,username.ilike.*${term}*`;
  });
}
