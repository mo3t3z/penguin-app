const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

export function relativePublicationTime(value: string, now = Date.now()) {
  const published = Date.parse(value);
  if (!Number.isFinite(published)) return 'Recently';
  const elapsed = Math.max(0, now - published);
  if (elapsed < minute) return 'Just now';
  if (elapsed < hour) return `${Math.floor(elapsed / minute)}m`;
  if (elapsed < day) return `${Math.floor(elapsed / hour)}h`;
  if (elapsed < 7 * day) return `${Math.floor(elapsed / day)}d`;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(published);
}

export function publicationAccessibilityLabel(value: string) {
  const published = Date.parse(value);
  if (!Number.isFinite(published)) return 'Published recently';
  return `Published ${new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(published)}`;
}

// A feed is for scanning: a post longer than this is cut to POST_PREVIEW_LINES with
// "Show more". Counted in characters and line breaks because a Text cannot report
// how many lines it would have needed.
export const POST_PREVIEW_LINES = 8;
export const POST_PREVIEW_CHARACTERS = 420;

export function isLongPost(content: string) {
  return [...content].length > POST_PREVIEW_CHARACTERS || content.split('\n').length > POST_PREVIEW_LINES;
}
