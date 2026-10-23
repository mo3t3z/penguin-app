// Presentation helpers for profile screens. Pure, so they can be unit tested.
export const BIO_LIMIT = 500;

export function bioLength(bio: string) {
  return [...bio].length;
}

export function bioCounter(bio: string) {
  return `${bioLength(bio)} / ${BIO_LIMIT} characters`;
}

export function isBioTooLong(bio: string) {
  return bioLength(bio) > BIO_LIMIT;
}

export function profileDisplayName(displayName: string | null | undefined) {
  return displayName?.trim() || 'Penguin student';
}

// "Joined Penguin in September 2026", or null when the date is unusable. The
// sentence is English, so the month is formatted in English by default.
export function joinedLabel(createdAt: string | null | undefined, locale = 'en-US') {
  const joined = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (!Number.isFinite(joined)) return null;
  return `Joined Penguin in ${new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(joined)}`;
}

// The short form for a profile header: "Joined Sep 2024".
export function joinedMonthLabel(createdAt: string | null | undefined, locale = 'en-US') {
  const joined = createdAt ? Date.parse(createdAt) : Number.NaN;
  if (!Number.isFinite(joined)) return null;
  return `Joined ${new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric' }).format(joined)}`;
}

// Cover images are https links, like avatars, until photo upload exists.
export function normalizeCoverUrl(value: string | null) {
  const url = value?.trim() || null;
  if (url && (url.length > 2048 || !/^https:\/\/\S+$/.test(url))) throw new Error('Use an https:// image link for the cover.');
  return url;
}
export const MAX_INTERESTS = 8;
// Trimmed, 1-32 characters each, no duplicates (ignoring case), at most eight.
export function normalizeInterests(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const item = raw.trim().replace(/\s+/g, ' ');
    if (!item) continue;
    if (item.length > 32) throw new Error('Keep each interest under 32 characters.');
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key); result.push(item);
  }
  if (result.length > MAX_INTERESTS) throw new Error(`Choose up to ${MAX_INTERESTS} interests.`);
  return result;
}
