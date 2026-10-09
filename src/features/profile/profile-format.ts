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
