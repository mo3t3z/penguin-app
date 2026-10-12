import assert from 'node:assert/strict';
import { test } from 'node:test';
import { navContentPadding, navLayout } from '../src/components/navigation/nav-layout.ts';

const phone = { width: 412, bottomInset: 0, fontScale: 1, keyboardVisible: false };

test('the navigation floats on regular phones with gesture navigation', () => {
  assert.equal(navLayout(phone), 'floating');
  assert.equal(navLayout({ ...phone, width: 360 }), 'floating');
  assert.equal(navLayout({ ...phone, bottomInset: 24 }), 'floating');
});

test('the navigation docks on phones narrower than 360dp', () => {
  assert.equal(navLayout({ ...phone, width: 320 }), 'docked');
  assert.equal(navLayout({ ...phone, width: 359 }), 'docked');
});

test('the navigation docks above three-button system navigation', () => {
  assert.equal(navLayout({ ...phone, bottomInset: 48 }), 'docked');
  assert.equal(navLayout({ ...phone, bottomInset: 32 }), 'docked');
});

test('the navigation docks with large text', () => {
  assert.equal(navLayout({ ...phone, fontScale: 1.3 }), 'docked');
  assert.equal(navLayout({ ...phone, fontScale: 2 }), 'docked');
  assert.equal(navLayout({ ...phone, fontScale: 1.29 }), 'floating');
});

test('the navigation hides while the keyboard is open, in either layout', () => {
  assert.equal(navLayout({ ...phone, keyboardVisible: true }), 'hidden');
  assert.equal(navLayout({ ...phone, width: 320, bottomInset: 48, fontScale: 1.3, keyboardVisible: true }), 'hidden');
});

test('lists keep their last item clear of the navigation', () => {
  // Floating: bar 64 + offset 12 + inset + 16.
  assert.equal(navContentPadding('floating', 0), 92);
  assert.equal(navContentPadding('floating', 24), 116);
  // Docked: bar 64 + inset + 16.
  assert.equal(navContentPadding('docked', 48), 128);
  assert.equal(navContentPadding('hidden', 48), 16);
});
