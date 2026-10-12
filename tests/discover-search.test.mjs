import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX_LENGTH,
  SEARCH_MAX_TERMS,
  SEARCH_MIN_LENGTH,
  searchKey,
  searchTerms,
  studentSearchFilters,
  termsFromKey,
} from '../src/features/discover/search-query.ts';
import {
  appendStudentPage,
  beginStudentLoadMore,
  buildStudentPage,
  completedStudentSearch,
  failStudentLoadMore,
  failedStudentSearch,
  isStudentCursor,
  mergeStudentResults,
  shouldStartStudentSearch,
  studentDetail,
  studentSearchStatus,
} from '../src/features/discover/student-search.ts';
import { POSTS_SEARCH_DELAY_MS, postsSearchKey } from '../src/features/discover/discover-results.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const student = (username, overrides = {}) => ({
  id: `id-${username}`, username, display_name: username, avatar_url: null,
  institution: { name: 'Université de Sfax' }, field: { name: 'Data Science' }, ...overrides,
});

// --- Query normalisation ----------------------------------------------------------

test('search limits match the agreed behaviour', () => {
  assert.equal(SEARCH_DEBOUNCE_MS, 350);
  assert.equal(SEARCH_MIN_LENGTH, 2);
  assert.equal(SEARCH_MAX_LENGTH, 60);
  assert.equal(SEARCH_MAX_TERMS, 5);
});

test('terms keep letters, digits and accents and drop everything else', () => {
  assert.deepEqual(searchTerms('  Maya   Chen '), ['maya', 'chen']);
  assert.deepEqual(searchTerms('@maya_c'), ['maya', 'c']);
  assert.deepEqual(searchTerms("O'Brien-Smith"), ['o', 'brien', 'smith']);
  assert.deepEqual(searchTerms('Gabès 2026'), ['gabès', '2026']);
  assert.deepEqual(searchTerms('أمينة يوسف'), ['أمينة', 'يوسف']);
  assert.deepEqual(searchTerms('maya MAYA Maya'), ['maya']);
  assert.deepEqual(searchTerms('🙂 !!! ...'), []);
  assert.deepEqual(searchTerms(undefined), []);
});

test('no filter syntax or LIKE wildcard survives normalisation', () => {
  const hostile = 'a%,b_c),or(id.neq.0).*:"\\\' x';
  for (const term of searchTerms(hostile)) assert.match(term, /^[\p{L}\p{N}\p{M}]+$/u);
  assert.deepEqual(searchTerms('%%__**'), []);
  assert.equal(searchKey('%_'), '');
});

test('input is bounded to 60 characters and 5 terms', () => {
  assert.equal(searchTerms('a'.repeat(200))[0].length, SEARCH_MAX_LENGTH);
  assert.deepEqual(searchTerms('one two three four five six seven'), ['one', 'two', 'three', 'four', 'five']);
});

test('a search needs two usable characters and has one canonical key', () => {
  assert.equal(searchKey(''), '');
  assert.equal(searchKey(' m '), '');
  assert.equal(searchKey('m!'), '');
  assert.equal(searchKey('ma'), 'ma');
  assert.equal(searchKey('a b'), 'a b');
  assert.equal(searchKey('  Maya,  CHEN!! '), searchKey('maya chen'));
  assert.deepEqual(termsFromKey(searchKey('Maya Chen')), ['maya', 'chen']);
  assert.deepEqual(termsFromKey(''), []);
});

test('filters match each term against the display name or the username', () => {
  assert.deepEqual(studentSearchFilters(['maya', 'chen']), [
    'display_name.ilike.*maya*,username.ilike.*maya*',
    'display_name.ilike.*chen*,username.ilike.*chen*',
  ]);
});

test('filters reject anything that did not come from normalisation', () => {
  for (const terms of [[], ['a,b'], ['a)'], ['a.b'], ['a*'], ['a%'], ['a_b'], ['a b'], [''], [7], 'maya',
    ['a', 'b', 'c', 'd', 'e', 'f']]) {
    assert.throws(() => studentSearchFilters(terms), /Invalid search/);
  }
});

// --- Pagination and state ---------------------------------------------------------

test('a page keeps the limit and continues after the last username', () => {
  const rows = ['amina', 'leo', 'maya'].map((name) => student(name));
  assert.deepEqual(buildStudentPage(rows, 2), { items: rows.slice(0, 2), nextCursor: 'leo' });
  assert.deepEqual(buildStudentPage(rows, 3), { items: rows, nextCursor: null });
  assert.deepEqual(buildStudentPage([], 20), { items: [], nextCursor: null });
});

test('cursors are canonical usernames only', () => {
  assert.equal(isStudentCursor('maya_c'), true);
  for (const value of ['', 'ab', 'Maya', 'maya,id.neq.0', 'maya c', null, 3]) assert.equal(isStudentCursor(value), false);
});

test('loading more appends without duplicates and survives a failure', () => {
  const first = completedStudentSearch('t1', { items: [student('amina'), student('leo')], nextCursor: 'leo' });
  const loading = beginStudentLoadMore(first, 't1');
  assert.equal(loading.loadingMore, true);
  const failed = failStudentLoadMore(loading, 't1');
  assert.deepEqual([failed.loadingMore, failed.loadMoreFailed, failed.items.length, failed.nextCursor], [false, true, 2, 'leo']);
  const appended = appendStudentPage(beginStudentLoadMore(failed, 't1'), 't1', { items: [student('leo'), student('maya')], nextCursor: null });
  assert.deepEqual(appended.items.map(({ username }) => username), ['amina', 'leo', 'maya']);
  assert.deepEqual([appended.nextCursor, appended.loadingMore, appended.loadMoreFailed], [null, false, false]);
  assert.equal(mergeStudentResults([student('amina')], [student('amina')]).length, 1);
});

test('a response for a superseded search or another account is ignored', () => {
  const current = completedStudentSearch('user-a:0:maya', { items: [student('maya')], nextCursor: 'maya' });
  const stalePage = { items: [student('leo')], nextCursor: null };
  assert.equal(appendStudentPage(current, 'user-a:0:leo', stalePage), current);
  assert.equal(appendStudentPage(current, 'user-b:0:maya', stalePage), current);
  assert.equal(beginStudentLoadMore(current, 'user-a:1:maya'), current);
  assert.equal(failStudentLoadMore(current, 'user-a:0:leo'), current);
  assert.equal(appendStudentPage(null, 'user-a:0:maya', stalePage), null);
});

test('status follows the current token', () => {
  const ready = completedStudentSearch('t1', { items: [student('maya')], nextCursor: null });
  assert.equal(studentSearchStatus(false, 't1', ready), 'idle');
  assert.equal(studentSearchStatus(true, 't1', null), 'loading');
  assert.equal(studentSearchStatus(true, 't2', ready), 'loading');
  assert.equal(studentSearchStatus(true, 't1', ready), 'ready');
  assert.equal(studentSearchStatus(true, 't1', completedStudentSearch('t1', { items: [], nextCursor: null })), 'empty');
  assert.equal(studentSearchStatus(true, 't1', failedStudentSearch('t1')), 'error');
});

test('the detail line shows real institution and field names only', () => {
  assert.equal(studentDetail(student('maya')), 'Université de Sfax · Data Science');
  assert.equal(studentDetail(student('maya', { field: null })), 'Université de Sfax');
  assert.equal(studentDetail(student('maya', { institution: null, field: null })), '');
});

// --- Service, hook and navigation -------------------------------------------------

test('student search reads completed profiles through the signed-in client', () => {
  const service = read('../src/features/discover/service.ts');
  assert.match(service, /\.eq\('onboarding_completed', true\)/);
  assert.match(service, /for \(const filter of studentSearchFilters\(terms\)\) query = query\.or\(filter\);/);
  assert.match(service, /if \(!isStudentCursor\(cursor\)\) throw/);
  assert.match(service, /\.order\('username', \{ ascending: true \}\)\.limit\(limit \+ 1\)/);
  assert.match(service, /request\.abortSignal\(signal\)/);
  const columns = service.match(/const STUDENT_RESULT = `([^`]+)`/)[1];
  assert.doesNotMatch(columns, /\*|bio|onboarding_completed|updated_at|study_level|email/);
  assert.doesNotMatch(service, /\.rpc\(|service_role/);
});

test('the hook debounces, cancels superseded requests and scopes results to the account', () => {
  const hook = read('../src/features/discover/use-student-search.ts');
  assert.match(hook, /const token = `\$\{userId\}:\$\{attempt\}:\$\{key\}`;/);
  assert.match(hook, /immediate\.current \? 0 : SEARCH_DEBOUNCE_MS/);
  assert.match(hook, /clearTimeout\(timer\);\s*controller\.abort\(\);/);
  assert.match(hook, /if \(!shouldStartStudentSearch\(searchable, active, loadedToken\.current, token\)\) return;/);
  assert.equal(shouldStartStudentSearch(false, true, null, 't1'), false);
  assert.equal(shouldStartStudentSearch(true, true, null, 't1'), true);
});

test('search text and results are never logged', () => {
  const directory = new URL('../src/features/discover/', import.meta.url);
  for (const name of readdirSync(directory)) {
    assert.doesNotMatch(readFileSync(new URL(name, directory), 'utf8'), /console\./, name);
  }
});

test('Discover is a tab between Home and Create and keeps the other destinations', () => {
  const bar = read('../src/components/navigation/tab-bar.tsx');
  const names = [...bar.matchAll(/\{ kind: '(?:tab|action)', name: '([a-z]+)'/g)].map((match) => match[1]);
  assert.deepEqual(names, ['home', 'discover', 'create', 'messages', 'account']);
  // Create is the middle of five. Groups is not a tab screen since Sprint 7A: it opens
  // from Discover as screens above the tabs (see tests/groups.test.mjs).
  assert.equal(names.indexOf('create'), (names.length - 1) / 2);
  const layout = read('../src/app/(protected)/(tabs)/_layout.tsx');
  assert.match(layout, /<Tabs\.Screen name="home" \/>\s*<Tabs\.Screen name="discover" \/>\s*<Tabs\.Screen name="account" \/>/);
  assert.doesNotMatch(layout, /name="groups"/);
  assert.match(layout, /<Tabs\.Screen name="messages" \/>/);
});

test('the Discover route is keyed by account and opens profiles like Home does', () => {
  const route = read('../src/app/(protected)/(tabs)/discover.tsx');
  assert.match(route, /if \(state\.status !== 'ready'\) return <ProfileStatus \/>;/);
  assert.match(route, /<DiscoverScreen key=\{state\.profile\.id\} profile=\{state\.profile\} \/>/);
  const screen = read('../src/features/discover/discover-screen.tsx');
  assert.match(screen, /if \(studentId === profile\.id\) \{ router\.navigate\('\/account'\); return; \}/);
  assert.match(screen, /router\.push\(\{ pathname: '\/students\/\[id\]', params: \{ id: studentId \} \}\)/);
  assert.match(screen, /maxLength=\{SEARCH_MAX_LENGTH\}/);
  assert.doesNotMatch(screen, /useFocusEffect|Communities|Institutions/);
});

// --- Two-stage search: what is requested, and when --------------------------------

test('nothing is requested below two characters', () => {
  assert.equal(searchKey('m'), '');
  assert.equal(searchKey(' . '), '');
  // An empty key is not searchable, so no students request starts...
  assert.equal(shouldStartStudentSearch(false, true, null, 'u:0:'), false);
  assert.equal(studentSearchStatus(false, 'u:0:', null), 'idle');
  // ...and no posts request either.
  assert.equal(postsSearchKey(searchKey('m'), '', ''), '');
});

test('a settled search asks for students once', () => {
  assert.equal(shouldStartStudentSearch(true, true, null, 'u:0:maya'), true);
  // Answered already: re-rendering, or coming back from See all, asks for nothing.
  assert.equal(shouldStartStudentSearch(true, true, 'u:0:maya', 'u:0:maya'), false);
  // Typing restarts the 350 ms wait instead of sending a request per keystroke.
  const hook = read('../src/features/discover/use-student-search.ts');
  assert.match(hook, /const delay = immediate\.current \? 0 : SEARCH_DEBOUNCE_MS;/);
  assert.match(hook, /clearTimeout\(timer\);\s*controller\.abort\(\);/);
});

test('posts are not requested before the search has been stable for 800 ms', () => {
  assert.equal(POSTS_SEARCH_DELAY_MS, 800);
  assert.ok(POSTS_SEARCH_DELAY_MS > SEARCH_DEBOUNCE_MS);
  assert.equal(postsSearchKey('maya', '', ''), '');
  assert.equal(postsSearchKey('maya', 'may', ''), '');
  assert.equal(postsSearchKey('maya', 'maya', ''), 'maya');
  const screen = read('../src/features/discover/discover-screen.tsx');
  // No post list is mounted, so no posts request exists, until that key is reached.
  assert.match(screen, /: postsKey \? <FeedList\s+key=\{postsKey\}\s+search=\{postsKey\}/);
  assert.match(screen, /const submit = \(\) => \{ Keyboard\.dismiss\(\); setSubmittedKey\(key\); \};/);
});

test('a response for an earlier search is never shown', () => {
  const earlier = completedStudentSearch('u:0:may', { items: [student('maya')], nextCursor: null });
  assert.equal(studentSearchStatus(true, 'u:0:maya', earlier), 'loading');
  assert.equal(appendStudentPage(earlier, 'u:0:maya', { items: [student('leo')], nextCursor: null }), earlier);
  assert.equal(failStudentLoadMore(earlier, 'u:0:maya'), earlier);
});
