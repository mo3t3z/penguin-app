import assert from 'node:assert/strict';
import { test } from 'node:test';
import { publicationAccessibilityLabel, relativePublicationTime } from '../src/features/posts/post-presentation.ts';

const now = Date.parse('2026-10-08T12:00:00.000Z');

test('relative post time uses compact social-feed intervals', () => {
  assert.equal(relativePublicationTime('2026-10-08T11:59:30.000Z', now), 'Just now');
  assert.equal(relativePublicationTime('2026-10-08T11:42:00.000Z', now), '18m');
  assert.equal(relativePublicationTime('2026-10-08T08:00:00.000Z', now), '4h');
  assert.equal(relativePublicationTime('2026-10-05T12:00:00.000Z', now), '3d');
  assert.equal(relativePublicationTime('invalid', now), 'Recently');
});

test('publication accessibility label includes a full localized date', () => {
  assert.match(publicationAccessibilityLabel('2026-10-08T11:42:00.000Z'), /^Published /);
  assert.equal(publicationAccessibilityLabel('invalid'), 'Published recently');
});
