// Discover shows students and posts for one search in a single list. The two are
// requested in two stages, so typing never asks for both on every pause:
//  1. students, after SEARCH_DEBOUNCE_MS (350 ms) without typing: six for the row;
//  2. posts, once the same search has stayed unchanged for POSTS_SEARCH_DELAY_MS, or
//     at once when the keyboard's Search key is pressed.
// Worst case per settled search: one students request and one posts request.
export const STUDENT_ROW_SIZE = 6;
export const POSTS_SEARCH_DELAY_MS = 800;

// The search the post list belongs to, or '' while no posts should be requested.
// `key` is the search as typed, `settledKey` follows it after the delay and
// `submittedKey` is the search that was last submitted from the keyboard.
export function postsSearchKey(key: string, settledKey: string, submittedKey: string) {
  if (!key) return '';
  return settledKey === key || submittedKey === key ? key : '';
}

export type HighlightSegment = { text: string; match: boolean };

// Splits text around the searched words so they can be highlighted. Post search
// matches a word anywhere in the text, ignoring case, and so does this. `terms`
// come from searchKey(), so they hold only letters, digits and marks and are safe
// inside a pattern.
export function highlightSegments(text: string, terms: readonly string[]): HighlightSegment[] {
  const words = terms.filter((term) => /^[\p{L}\p{N}\p{M}]+$/u.test(term)).sort((first, second) => second.length - first.length);
  if (!words.length || !text) return text ? [{ text, match: false }] : [];
  const pattern = new RegExp(`(${words.join('|')})`, 'giu');
  return text.split(pattern).filter(Boolean).map((part) => ({
    text: part,
    match: words.includes(part.toLowerCase()),
  }));
}
