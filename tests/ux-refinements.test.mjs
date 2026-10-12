import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isLongPost, POST_PREVIEW_CHARACTERS, POST_PREVIEW_LINES } from '../src/features/posts/post-presentation.ts';
import { hasPostDraft } from '../src/features/posts/validation.ts';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

// --- Feed readability -----------------------------------------------------------------

test('only long posts are collapsed in a feed', () => {
  assert.equal(isLongPost('A short question about tomorrow’s exam.'), false);
  assert.equal(isLongPost('a'.repeat(POST_PREVIEW_CHARACTERS)), false);
  assert.equal(isLongPost('a'.repeat(POST_PREVIEW_CHARACTERS + 1)), true);
  // Characters are counted as people see them, not as UTF-16 units.
  assert.equal(isLongPost('🎓'.repeat(POST_PREVIEW_CHARACTERS)), false);
  // Many short lines are long too.
  assert.equal(isLongPost(Array.from({ length: POST_PREVIEW_LINES }, () => 'line').join('\n')), false);
  assert.equal(isLongPost(Array.from({ length: POST_PREVIEW_LINES + 1 }, () => 'line').join('\n')), true);
  assert.equal(isLongPost(''), false);
});

test('a collapsed post can be opened and says so to a screen reader', () => {
  const card = read('../src/features/posts/post-card.tsx');
  assert.match(card, /numberOfLines=\{long && !expanded \? POST_PREVIEW_LINES : undefined\}/);
  assert.match(card, /accessibilityLabel=\{expanded \? 'Show less of this post' : 'Show more of this post'\}/);
  assert.match(card, /accessibilityState=\{\{ expanded \}\}/);
  // The toggle is a real 44px control with a 48px touch target, and absent on short posts.
  assert.match(card, /\{long \? <Pressable\s+className="min-h-11 justify-center self-start/);
  // Search results have their own compact item and are not affected.
  assert.doesNotMatch(read('../src/features/posts/post-search-result.tsx'), /isLongPost/);
});

// --- Like feedback --------------------------------------------------------------------

test('the like pop plays once, on the change to liked, and never with reduce motion', () => {
  const action = read('../src/components/social/post-action.tsx');
  assert.match(action, /const turnedOn = active && !wasActive\.current;\s*wasActive\.current = active;\s*if \(!turnedOn \|\| reduceMotion\) return;/);
  assert.match(action, /useNativeDriver: true/);
  assert.doesNotMatch(action, /Animated\.loop|setInterval/);
  // Only the heart pops; comment and share stay still.
  const card = read('../src/features/posts/post-card.tsx');
  assert.equal(card.match(/\bpop\b/g).length, 1);
  assert.match(card, /icon=\{Heart\}[\s\S]{0,120}\bpop\b/);
  // No animation library was added for it.
  assert.doesNotMatch(action, /reanimated|from 'moti'|lottie/);
});

// --- Navigation -----------------------------------------------------------------------

test('pressing Home again returns the feed to the top', () => {
  const home = read('../src/app/(protected)/(tabs)/home.tsx');
  assert.match(home, /tabs\.addListener\('tabPress', \(\) => \{ if \(tabs\.isFocused\(\)\) setScrollToTop\(\(value\) => value \+ 1\); \}\)/);
  assert.match(home, /scrollToTopSignal=\{scrollToTop\}/);
  const list = read('../src/features/posts/feed-list.tsx');
  assert.match(list, /if \(scrollToTopSignal\) list\.current\?\.scrollToOffset\(\{ offset: 0, animated: !reduceMotion \}\);/);
  // The tab bar announces every press, including on the tab that is already open.
  const bar = read('../src/components/navigation/tab-bar.tsx');
  assert.match(bar, /navigation\.emit\(\{ type: 'tabPress', target: route\.key, canPreventDefault: true \}\)/);
  assert.match(bar, /if \(!selected && !event\.defaultPrevented\) navigation\.navigate/);
});

// --- Create post ----------------------------------------------------------------------

test('a draft is text that is not only spaces, or any chosen photo', () => {
  assert.equal(hasPostDraft('', 0), false);
  assert.equal(hasPostDraft('  \n ', 0), false);
  assert.equal(hasPostDraft('hello', 0), true);
  assert.equal(hasPostDraft('', 1), true);
});

test('Cancel and the system Back ask before discarding a draft, and never while publishing', () => {
  const screen = read('../src/features/posts/create-screen.tsx');
  assert.match(screen, /onPress=\{requestClose\}/);
  assert.match(screen, /if \(inFlight\.current\) return;\s*if \(draftRef\.current\) \{ Keyboard\.dismiss\(\); setConfirmDiscard\(true\); \} else leave\(\);/);
  assert.match(screen, /if \(inFlight\.current\) return true;\s*if \(!draftRef\.current\) return false;\s*Keyboard\.dismiss\(\);\s*setConfirmDiscard\(true\);\s*return true;/);
  // The safe choice comes first; discarding is the destructive one.
  assert.match(screen, /<Text>Keep editing<\/Text><\/Button>\s*<Button variant="destructive"[^>]*onPress=\{\(\) => \{ setConfirmDiscard\(false\); leave\(\); \}\}><Text>Discard<\/Text>/);
  assert.match(screen, /title="Discard this post\?"/);
});

test('Create and the conversation use the same single keyboard strategy', () => {
  for (const path of ['../src/features/posts/create-screen.tsx', '../src/features/chat/chat-screen.tsx']) {
    const source = read(path);
    assert.equal(source.match(/<KeyboardAvoidingView\b/g).length, 1, path);
    assert.match(source, /<KeyboardAvoidingView className="flex-1" behavior="padding">/, path);
    assert.doesNotMatch(source, /behavior=\{Platform\.OS|keyboardVerticalOffset|Keyboard\.addListener/, path);
  }
});
