import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { highlightSegments, POSTS_SEARCH_DELAY_MS, postsSearchKey, STUDENT_ROW_SIZE } from '../src/features/discover/discover-results.ts';
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
  assert.match(list, /search = null, paused = false, underNavigation = false, scrollToTopSignal = 0 \}: FeedListProps/);
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

// --- One list, two stages ---------------------------------------------------------

test('students come first and posts follow only once the search has settled', () => {
  assert.equal(STUDENT_ROW_SIZE, 6);
  assert.equal(POSTS_SEARCH_DELAY_MS, 800);
  // Nothing to search for: no posts request, whatever the other values say.
  assert.equal(postsSearchKey('', '', ''), '');
  assert.equal(postsSearchKey('', 'maya', 'maya'), '');
  // Still typing: the settled key trails behind, so no posts are requested.
  assert.equal(postsSearchKey('maya', '', ''), '');
  assert.equal(postsSearchKey('maya chen', 'maya', ''), '');
  // The same search for 800 ms: posts are requested for it.
  assert.equal(postsSearchKey('maya', 'maya', ''), 'maya');
  // The keyboard's Search key does not wait.
  assert.equal(postsSearchKey('maya', '', 'maya'), 'maya');
  // A submit belongs to the search it was pressed for, not to a later one.
  assert.equal(postsSearchKey('maya chen', 'maya', 'maya'), '');
});

test('the screen asks for six students, then posts, and pauses the row behind See all', () => {
  const screen = read('../src/features/discover/discover-screen.tsx');
  assert.match(screen, /useStudentSearch\(query, \{ pageSize: STUDENT_ROW_SIZE, active: !showAll \}\)/);
  assert.match(screen, /useStudentSearch\(query, \{ active: showAll \}\)/);
  assert.match(screen, /useDebouncedValue\(key, POSTS_SEARCH_DELAY_MS\)/);
  assert.match(screen, /const postsKey = postsSearchKey\(key, settledKey, submittedKey\);/);
  assert.match(screen, /key=\{postsKey\}\s*search=\{postsKey\}/);
  // The full list belongs to one search and pages only while it is showing.
  assert.match(screen, /const showAll = allStudentsKey !== null && allStudentsKey === key;/);
  assert.match(screen, /if \(showAll && hasMore && !loadingMore && !loadMoreFailed\) loadMore\(\);/);
  assert.doesNotMatch(screen, /SegmentedTabs/);
  const debounce = read('../src/lib/use-debounced-value.ts');
  assert.match(debounce, /const timer = setTimeout\(\(\) => setDebounced\(value\), delayMs\);/);
  assert.match(debounce, /return \(\) => clearTimeout\(timer\);/);
});

test('searched words are highlighted wherever they appear, ignoring case', () => {
  assert.deepEqual(highlightSegments('Linear algebra and LINEAR maps', ['linear']), [
    { text: 'Linear', match: true }, { text: ' algebra and ', match: false },
    { text: 'LINEAR', match: true }, { text: ' maps', match: false },
  ]);
  // Post search matches inside words too.
  assert.deepEqual(highlightSegments('eigenvectors', ['vector']), [
    { text: 'eigen', match: false }, { text: 'vector', match: true }, { text: 's', match: false },
  ]);
  assert.deepEqual(highlightSegments('أمينة في صفاقس', ['صفاقس']).at(-1), { text: 'صفاقس', match: true });
  assert.deepEqual(highlightSegments('No match here', ['maya']), [{ text: 'No match here', match: false }]);
  assert.deepEqual(highlightSegments('plain', []), [{ text: 'plain', match: false }]);
  assert.deepEqual(highlightSegments('', ['maya']), []);
  // Only normalised words ever become part of the pattern.
  assert.deepEqual(highlightSegments('a.b (c)', ['.', '(c)']), [{ text: 'a.b (c)', match: false }]);
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

test('students and posts are both cleared when the account changes', () => {
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
  // A search result is compact and opens the post's comments.
  assert.match(read('../src/features/posts/feed-list.tsx'), /search \? <PostSearchResult\s+post=\{item\}\s+search=\{search\}\s+onOpen=\{openComments\}/);
  const list = read('../src/features/posts/feed-list.tsx');
  assert.match(list, /router\.push\(\{ pathname: '\/comments\/\[postId\]', params: \{ postId \} \}\)/);
});
