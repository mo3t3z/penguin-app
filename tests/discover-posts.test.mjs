import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { discoverScopes, postsPaneState } from '../src/features/discover/discover-scopes.ts';
import { postSearchPatterns, searchKey, termsFromKey } from '../src/features/discover/search-query.ts';
import {
  beginStudentLoadMore,
  cancelStudentLoadMore,
  completedStudentSearch,
  shouldStartStudentSearch,
  studentSearchStatus,
} from '../src/features/discover/student-search.ts';
import { buildFeedPage } from '../src/features/posts/feed.ts';
import { feedCursorFilter } from '../src/features/posts/validation.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// --- Post search filtering --------------------------------------------------------

test('each search word becomes one case-insensitive pattern for the post text', () => {
  assert.deepEqual(postSearchPatterns(['linear', 'algebra']), ['%linear%', '%algebra%']);
  assert.deepEqual(postSearchPatterns(termsFromKey(searchKey('  Linear,  ALGEBRA!! '))), ['%linear%', '%algebra%']);
  assert.deepEqual(postSearchPatterns(termsFromKey(searchKey('gabès أمينة'))), ['%gabès%', '%أمينة%']);
});

test('post patterns are built only from normalised words', () => {
  for (const terms of [[], ['a%'], ['a_b'], ['a,b'], ['a)'], ['a.b'], ['a*'], ['a b'], ['a\\'], [''], [7], 'linear',
    ['a', 'b', 'c', 'd', 'e', 'f']]) {
    assert.throws(() => postSearchPatterns(terms), /Invalid search/);
  }
  // A raw string that skipped normalisation cannot reach the query as a key either.
  assert.throws(() => postSearchPatterns(termsFromKey('100% a_b')), /Invalid search/);
});

test('the feed query adds the text filter only for a search and keeps its order and cursor', () => {
  const service = read('../src/features/posts/service.ts');
  assert.match(service,
    /if \(search\) for \(const pattern of postSearchPatterns\(termsFromKey\(search\)\)\) query = query\.ilike\('content', pattern\);/);
  assert.equal(service.match(/\.ilike\(/g).length, 1);
  assert.match(service, /if \(authorId\) query = query\.eq\('author_id', requireUuid\(authorId\)\);/);
  assert.match(service, /\.order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)/);
  assert.match(service, /\.eq\('media\.status', 'ready'\)/);
  assert.match(service, /\.limit\(limit \+ 1\)/);
  assert.match(service, /if \(cursor\) query = query\.or\(feedCursorFilter\(cursor\)\);/);
  assert.doesNotMatch(service, /\.rpc\('search|textSearch|\.or\(`/);
});

test('search results page with the same cursor as the feed', () => {
  const author = { id: 'a', username: 'student', display_name: 'Student', avatar_url: null };
  const post = (id, createdAt) => ({ id, author_id: 'a', content: id, created_at: createdAt, updated_at: createdAt, author, media: [] });
  const rows = [
    post('00000000-0000-4000-8000-000000000003', '2026-10-09T10:00:00.000003+00:00'),
    post('00000000-0000-4000-8000-000000000002', '2026-10-09T10:00:00.000002+00:00'),
    post('00000000-0000-4000-8000-000000000001', '2026-10-09T10:00:00.000001+00:00'),
  ];
  const page = buildFeedPage(rows, 2);
  assert.equal(page.items.length, 2);
  assert.deepEqual(page.nextCursor, { createdAt: rows[1].created_at, id: rows[1].id });
  assert.match(feedCursorFilter(page.nextCursor), /^created_at\.lt\./);
  assert.equal(buildFeedPage(rows.slice(0, 2), 2).nextCursor, null);
});

// --- Unchanged Home and Profile feeds ---------------------------------------------

test('Home and profile lists pass no search and keep their post-publish refresh', () => {
  const list = read('../src/features/posts/feed-list.tsx');
  assert.match(list, /search = null, paused = false \}: FeedListProps/);
  assert.match(list, /usePostsFeed\(\{ authorId, search \}\)/);
  assert.match(list,
    /if \(!userId \|\| event\.userId !== userId\) return;\s*if \(authorId && authorId !== userId\) return;\s*if \(search\) return;\s*list\.current\?\.scrollToOffset\(\{ offset: 0, animated: false \}\);\s*void refresh\(\);/);
  assert.doesNotMatch(read('../src/app/(protected)/(tabs)/home.tsx'), /search=|paused=/);
  assert.doesNotMatch(read('../src/features/profile/profile-screen.tsx'), /search=|paused=/);
  const hook = read('../src/features/posts/use-feed.ts');
  assert.match(hook, /usePostsFeed\(\{ pageSize = 20, authorId = null, search = null \}/);
});

test('a paused post list asks for no further pages and no image URLs', () => {
  const list = read('../src/features/posts/feed-list.tsx');
  assert.match(list, /visible=\{!paused && visiblePostIds\.has\(item\.id\)\}/);
  assert.match(list, /onEndReached=\{replacement \|\| paused \? undefined : loadMore\}/);
  assert.match(list, /keyboardDismissMode=\{search \? 'on-drag' : 'none'\}/);
});

// --- Scope switching --------------------------------------------------------------

test('Students is the first scope and Posts the second', () => {
  assert.deepEqual(discoverScopes.map(({ key }) => key), ['students', 'posts']);
  const screen = read('../src/features/discover/discover-screen.tsx');
  assert.match(screen, /useState<DiscoverScope>\('students'\)/);
  assert.match(screen, /<SegmentedTabs tabs=\{discoverScopes\} value=\{scope\} onChange=\{setScope\} \/>/);
});

test('no post list exists before a valid search has settled on the Posts scope', () => {
  assert.deepEqual(postsPaneState('students', '', ''), { mounted: false, current: false, shown: false, pending: false });
  assert.deepEqual(postsPaneState('students', 'maya', ''), { mounted: false, current: false, shown: false, pending: false });
  assert.deepEqual(postsPaneState('posts', '', ''), { mounted: false, current: false, shown: false, pending: false });
  // Posts just opened: waiting for the debounce, nothing mounted yet.
  assert.deepEqual(postsPaneState('posts', 'maya', ''), { mounted: false, current: false, shown: false, pending: true });
});

test('the post list is shown only for the current search on the Posts scope', () => {
  assert.deepEqual(postsPaneState('posts', 'maya', 'maya'), { mounted: true, current: true, shown: true, pending: false });
  // Back on Students: still mounted with its results, but hidden and paused.
  assert.deepEqual(postsPaneState('students', 'maya', 'maya'), { mounted: true, current: true, shown: false, pending: false });
  // The text changed: the old list is hidden until the new search settles.
  assert.deepEqual(postsPaneState('posts', 'maya chen', 'maya'), { mounted: true, current: false, shown: false, pending: true });
  assert.deepEqual(postsPaneState('students', 'maya chen', 'maya'), { mounted: true, current: false, shown: false, pending: false });
  // Search cleared: no stale posts are shown.
  assert.deepEqual(postsPaneState('posts', '', 'maya'), { mounted: true, current: false, shown: false, pending: false });
});

test('the screen pauses whichever pane is not showing', () => {
  const screen = read('../src/features/discover/discover-screen.tsx');
  assert.match(screen, /useStudentSearch\(query, \{\s*active: scope === 'students',\s*\}\)/);
  assert.match(screen, /useDebouncedValue\(key, SEARCH_DEBOUNCE_MS, scope !== 'posts'\)/);
  assert.match(screen, /key=\{postsKey\}\s*search=\{postsKey\}\s*paused=\{!posts\.shown\}/);
  assert.match(screen, /if \(scope === 'students' && hasMore && !loadingMore && !loadMoreFailed\) loadMore\(\);/);
  assert.match(screen, /scope !== 'students' && 'hidden'/);
  assert.match(screen, /scope !== 'posts' && 'hidden'/);
  const debounce = read('../src/lib/use-debounced-value.ts');
  assert.match(debounce, /if \(paused\) return;/);
  assert.match(debounce, /return \(\) => clearTimeout\(timer\);/);
});

test('student search starts only when active and not already answered', () => {
  assert.equal(shouldStartStudentSearch(true, true, null, 'u:0:maya'), true);
  assert.equal(shouldStartStudentSearch(true, false, null, 'u:0:maya'), false);
  assert.equal(shouldStartStudentSearch(false, true, null, 'u:0:'), false);
  // Returning to Students with the same search refetches nothing.
  assert.equal(shouldStartStudentSearch(true, true, 'u:0:maya', 'u:0:maya'), false);
  // A changed search, a retry or another account does fetch.
  assert.equal(shouldStartStudentSearch(true, true, 'u:0:maya', 'u:0:leo'), true);
  assert.equal(shouldStartStudentSearch(true, true, 'u:0:maya', 'u:1:maya'), true);
  assert.equal(shouldStartStudentSearch(true, true, 'u:0:maya', 'v:0:maya'), true);
});

test('pausing mid-page keeps the students already loaded without reporting a failure', () => {
  const loaded = completedStudentSearch('t1', { items: [{ id: '1', username: 'maya' }], nextCursor: 'maya' });
  const cancelled = cancelStudentLoadMore(beginStudentLoadMore(loaded, 't1'), 't1');
  assert.deepEqual([cancelled.loadingMore, cancelled.loadMoreFailed, cancelled.items.length, cancelled.nextCursor], [false, false, 1, 'maya']);
  assert.equal(cancelStudentLoadMore(loaded, 't2'), loaded);
  assert.equal(studentSearchStatus(true, 't1', cancelled), 'ready');
});

// --- Account isolation and navigation ---------------------------------------------

test('both scopes are cleared when the account changes', () => {
  const route = read('../src/app/(protected)/(tabs)/discover.tsx');
  assert.match(route, /<DiscoverScreen key=\{state\.profile\.id\} profile=\{state\.profile\} \/>/);
  const hook = read('../src/features/posts/use-feed.ts');
  assert.match(hook, /const visible = enabled && state\.userId === userId \? state : initialFeedState\(\);/);
  const students = read('../src/features/discover/use-student-search.ts');
  assert.match(students, /const token = `\$\{userId\}:\$\{attempt\}:\$\{key\}`;/);
});

test('post results open author profiles and reuse the feed list for likes and comments', () => {
  const screen = read('../src/features/discover/discover-screen.tsx');
  assert.match(screen, /onOpenAuthor=\{openStudent\}/);
  assert.match(screen, /emptyState=\{noPosts\}/);
  assert.doesNotMatch(screen, /PostCard|getFeed|usePostsFeed|signedMediaMemoryCache|console\./);
  const list = read('../src/features/posts/feed-list.tsx');
  assert.match(list, /router\.push\(\{ pathname: '\/comments\/\[postId\]', params: \{ postId \} \}\)/);
});
