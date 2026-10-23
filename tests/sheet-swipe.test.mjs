import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { dragOffset, loweredOffset, sheetSwipeResult, SWIPE_DISTANCE } from '../src/features/posts/sheet-swipe.ts';

test('swiping down lowers an expanded sheet, then closes it', () => {
  assert.equal(sheetSwipeResult('expanded', SWIPE_DISTANCE + 1, 0), 'lowered');
  assert.equal(sheetSwipeResult('lowered', SWIPE_DISTANCE + 1, 0), 'close');
  // A fast flick counts even when short.
  assert.equal(sheetSwipeResult('expanded', 10, 0.8), 'lowered');
});

test('swiping up expands; short or slow drags settle back', () => {
  assert.equal(sheetSwipeResult('lowered', -(SWIPE_DISTANCE + 1), 0), 'expanded');
  assert.equal(sheetSwipeResult('expanded', -200, -2), 'expanded');
  assert.equal(sheetSwipeResult('lowered', 20, 0.1), 'lowered');
  assert.equal(sheetSwipeResult('expanded', -20, -0.1), 'expanded');
});

test('the sheet follows the finger but never rises above full height', () => {
  assert.equal(loweredOffset(900), 300);
  assert.equal(loweredOffset(1200), 320);
  assert.equal(dragOffset('expanded', -50, 900), 0);
  assert.equal(dragOffset('expanded', 40, 900), 40);
  assert.equal(dragOffset('lowered', -100, 900), 200);
});

test('a swipe closes through the same guarded close as Cancel', () => {
  const screen = readFileSync(new URL('../src/features/posts/create-screen.tsx', import.meta.url), 'utf8');
  assert.match(screen, /useSheetSwipe\(\{ onClose: requestClose, disabled: busy \}\)/);
  // Only the handle and header take the gesture, never the text or photos.
  assert.equal(screen.match(/\{\.\.\.swipe\.panHandlers\}/g).length, 1);
});
