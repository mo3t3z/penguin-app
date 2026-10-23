import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { postLikeEvents } from '../src/features/posts/like-events.ts';
import { postPublishedEvents } from '../src/features/posts/feed-events.ts';
import { applyPostLikeSync, optimisticPostLikeToggle, rollbackPostLike } from '../src/features/posts/likes.ts';
import { SignedMediaMemoryCache } from '../src/features/posts/private-media.ts';
import { requireUuid } from '../src/features/posts/validation.ts';
import { BIO_LIMIT, bioCounter, isBioTooLong, joinedLabel, profileDisplayName } from '../src/features/profile/profile-format.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const sourceRoot = decodeURIComponent(new URL('../src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
function sourceFiles(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = `${directory}/${name}`;
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}
const settled = (count, likedByMe) => ({ count, likedByMe, pending: false, error: null });
const signedUrl = (suffix) => ({ url: `https://media.example/${suffix}`, expiresAt: Date.now() + 600_000 });

// --- Signed media cache lifecycle -------------------------------------------------

test('the protected layout owns the signed-media cache and remains a stack', () => {
  const layout = read('../src/app/(protected)/_layout.tsx');
  assert.match(layout, /useSignedMediaCacheOwner\(\);/);
  assert.match(layout, /<Stack\b/);
  const owner = read('../src/features/posts/use-signed-media-cache.ts');
  assert.match(owner, /signedMediaMemoryCache\.activateUser\(userId\);/);
  assert.match(owner, /return \(\) => signedMediaMemoryCache\.activateUser\(null\);/);
});

test('no feed list or screen activates or clears the cache itself', () => {
  const activators = sourceFiles(sourceRoot)
    .filter((path) => /\.activateUser\(/.test(readFileSync(path, 'utf8')))
    .map((path) => path.replaceAll('\\', '/').split('/src/')[1]);
  assert.deepEqual(activators, ['features/posts/use-signed-media-cache.ts']);
  assert.doesNotMatch(read('../src/features/posts/feed-list.tsx'), /signedMediaMemoryCache/);
});

test('re-activating the same account keeps cached URLs; another account or sign-out clears them', () => {
  const cache = new SignedMediaMemoryCache();
  cache.activateUser('user-a');
  const value = signedUrl('one');
  cache.set('user-a', 'media-1', value);
  cache.activateUser('user-a');
  assert.equal(cache.get('user-a', 'media-1'), value);
  cache.activateUser('user-b');
  assert.equal(cache.get('user-a', 'media-1'), null);
  assert.equal(cache.get('user-b', 'media-1'), null);
  cache.activateUser('user-a');
  assert.equal(cache.get('user-a', 'media-1'), null);
  cache.set('user-a', 'media-1', value);
  cache.activateUser(null);
  cache.activateUser('user-a');
  assert.equal(cache.get('user-a', 'media-1'), null);
});

// --- Author-filtered feed --------------------------------------------------------

test('author feed reuses the feed query with a validated author filter', () => {
  const service = read('../src/features/posts/service.ts');
  assert.match(service, /if \(authorId\) query = query\.eq\('author_id', requireUuid\(authorId\)\);/);
  assert.match(service, /\.order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)/);
  assert.match(service, /if \(cursor\) query = query\.or\(feedCursorFilter\(cursor\)\);/);
  assert.throws(() => requireUuid('not-a-uuid'));
  assert.throws(() => requireUuid("00000000-0000-4000-8000-000000000001' or 1=1"));
  assert.equal(requireUuid('00000000-0000-4000-8000-00000000000A'), '00000000-0000-4000-8000-00000000000a');
});

test('the feed hook passes the author through and keeps state scoped to the signed-in user', () => {
  const hook = read('../src/features/posts/use-feed.ts');
  assert.match(hook, /getFeed\(\{ cursor, limit: pageSize, signal: controller\.signal, authorId, search, likedOnly \}\)/);
  assert.match(hook, /\[authorId, enabled, likedOnly, pageSize, search, updateState, userId\]/);
  // Home and the profile lists pass no search, so their requests are unfiltered.
  assert.match(hook, /usePostsFeed\(\{ pageSize = 20, authorId = null, search = null, likedOnly = false \}/);
  assert.match(hook, /const visible = enabled && state\.userId === userId \? state : initialFeedState\(\);/);
});

test('profile lookup validates the id and selects presentation fields only', () => {
  const service = read('../src/features/profile/service.ts');
  assert.match(service, /\.select\(PUBLIC_PROFILE\)\.eq\('id', requireUuid\(id\)\)\.maybeSingle\(\)/);
  const columns = service.match(/const PUBLIC_PROFILE = '([^']+)'/)[1].split(',');
  assert.deepEqual(columns, ['id', 'username', 'display_name', 'avatar_url', 'institution_id', 'field_id', 'study_level', 'bio',
    'cover_url', 'location', 'interests', 'is_verified', 'created_at']);
  assert.ok(!columns.includes('onboarding_completed'));
});

// --- Like synchronisation --------------------------------------------------------

test('a like made in another list is applied to a post this list holds', () => {
  const current = { 'post-1': settled(4, false), 'post-2': settled(1, true) };
  const next = applyPostLikeSync(current, 'post-1', { count: 5, likedByMe: true });
  assert.deepEqual(next['post-1'], settled(5, true));
  assert.equal(next['post-2'], current['post-2']);
});

test('like sync ignores unknown posts, unchanged values and posts with a local change in flight', () => {
  const current = { 'post-1': settled(4, false) };
  assert.equal(applyPostLikeSync(current, 'post-9', { count: 1, likedByMe: true }), current);
  assert.equal(applyPostLikeSync(current, 'post-1', { count: 4, likedByMe: false }), current);
  const pending = { 'post-1': optimisticPostLikeToggle(settled(4, false)) };
  assert.equal(applyPostLikeSync(pending, 'post-1', { count: 9, likedByMe: false }), pending);
});

test('like sync clears a stale error and a failed like can be synced back', () => {
  const failed = { 'post-1': rollbackPostLike(settled(4, false), 'failed') };
  assert.deepEqual(applyPostLikeSync(failed, 'post-1', { count: 5, likedByMe: true })['post-1'], settled(5, true));
  const optimistic = applyPostLikeSync({ 'post-1': settled(4, false) }, 'post-1', { count: 5, likedByMe: true });
  assert.deepEqual(applyPostLikeSync(optimistic, 'post-1', { count: 4, likedByMe: false })['post-1'], settled(4, false));
});

test('like events reach every subscriber with their source, and stop after unsubscribing', () => {
  const received = [];
  const source = {};
  const unsubscribe = postLikeEvents.subscribe((event) => received.push(event));
  postLikeEvents.publish({ userId: 'user-a', postId: 'post-1', count: 2, likedByMe: true, source });
  unsubscribe();
  postLikeEvents.publish({ userId: 'user-a', postId: 'post-1', count: 1, likedByMe: false, source });
  assert.equal(received.length, 1);
  assert.equal(received[0].source, source);
});

test('the feed hook publishes its like changes, ignores its own events and other accounts', () => {
  const hook = read('../src/features/posts/use-feed.ts');
  assert.match(hook, /event\.userId !== userId \|\| event\.source === likeSource\.current\) return;/);
  assert.equal(hook.match(/postLikeEvents\.publish\(/g)?.length, 2);
  assert.match(hook, /commentCountEvents\.subscribe\(/);
});

// --- Refresh after publishing ----------------------------------------------------

test('publishing refreshes the main feed and the author’s own list, not other students’ lists', () => {
  const list = read('../src/features/posts/feed-list.tsx');
  assert.match(list, /if \(!userId \|\| event\.userId !== userId\) return;/);
  assert.match(list, /if \(authorId && authorId !== userId\) return;/);
  assert.doesNotMatch(list, /useFocusEffect|addListener\s*\(\s*['"]focus['"]/);
  const received = [];
  const unsubscribe = postPublishedEvents.subscribe((event) => received.push(event.userId));
  postPublishedEvents.publish({ userId: 'user-a' });
  unsubscribe();
  assert.deepEqual(received, ['user-a']);
});

// --- Profile presentation --------------------------------------------------------

test('bio counter reports code points against the existing 500 limit', () => {
  assert.equal(BIO_LIMIT, 500);
  assert.equal(bioCounter(''), '0 / 500 characters');
  assert.equal(bioCounter('🎓🎓'), '2 / 500 characters');
  assert.equal(isBioTooLong('a'.repeat(500)), false);
  assert.equal(isBioTooLong('a'.repeat(501)), true);
});

test('joined label uses the real profile creation month and tolerates bad input', () => {
  assert.equal(joinedLabel('2026-09-15T12:00:00.000000+00:00', 'en-US'), 'Joined Penguin in September 2026');
  assert.equal(joinedLabel(null), null);
  assert.equal(joinedLabel('not a date'), null);
  assert.equal(profileDisplayName('  Maya Chen '), 'Maya Chen');
  assert.equal(profileDisplayName(null), 'Penguin student');
});

test('a student profile is read-only and edit actions exist only on the Profile tab', () => {
  const route = read('../src/app/(protected)/students/[id].tsx');
  assert.match(route, /own=\{false\}/);
  assert.doesNotMatch(route, /edit-profile|signOut|Log out|Edit Profile/);
  // Message and Connect are the actions a student profile offers, and not on your own.
  assert.deepEqual(route.match(/actions=\{.*/g), [
    'actions={profile.id === viewerId ? undefined : <View className="flex-row items-start gap-2">',
  ]);
  assert.match(route, /<MessageStudentButton studentId=\{profile\.id\} compact \/>\s*<ConnectionButton viewerId=\{viewerId\} studentId=\{profile\.id\} \/>/);
  assert.match(route, /uuidPattern\.test\(params\.id\)/);
  const account = read('../src/app/(protected)/(tabs)/account.tsx');
  assert.match(account, /href="\/edit-profile"/);
  assert.match(account, /Log out/);
});

test('opening your own author row goes to the Profile tab; others push a student profile', () => {
  const home = read('../src/app/(protected)/(tabs)/home.tsx');
  assert.match(home, /if \(authorId === profile\.id\) \{ router\.navigate\('\/account'\); return; \}/);
  assert.match(home, /router\.push\(\{ pathname: '\/students\/\[id\]', params: \{ id: authorId \} \}\)/);
});
