// Which form the main navigation takes. Kept free of React Native imports so the
// rules can be unit tested (tests/nav-layout.test.mjs).
export type NavLayout = 'floating' | 'docked' | 'hidden';

// Mirrors `layout` in src/theme/tokens.ts.
export const NAV_HEIGHT = 64;
export const NAV_INSET_X = 12;
export const NAV_OFFSET_BOTTOM = 12;
const FLOATING_MIN_WIDTH = 360;
const SYSTEM_BUTTONS_INSET = 32;
const LARGE_TEXT_SCALE = 1.3;
const LIST_GAP = 16;

// A floating island only where it measurably fits; otherwise the same bar docks.
// To ship the docked bar everywhere, return 'docked' instead of 'floating' here.
export function navLayout({ width, bottomInset, fontScale, keyboardVisible }: {
  width: number; bottomInset: number; fontScale: number; keyboardVisible: boolean;
}): NavLayout {
  // Nothing in the bar is useful while typing.
  if (keyboardVisible) return 'hidden';
  // Below 360dp the island's margins would leave slots under 56dp.
  if (width < FLOATING_MIN_WIDTH) return 'docked';
  // Three-button navigation: an island above the system buttons sits too high.
  if (bottomInset >= SYSTEM_BUTTONS_INSET) return 'docked';
  // Large text: labels need the full width and the bar grows in height.
  if (fontScale >= LARGE_TEXT_SCALE) return 'docked';
  return 'floating';
}

// Bottom padding for a list that scrolls under the navigation, so its last item is
// never hidden.
export function navContentPadding(layout: NavLayout, bottomInset: number) {
  if (layout === 'hidden') return LIST_GAP;
  if (layout === 'docked') return NAV_HEIGHT + bottomInset + LIST_GAP;
  return NAV_HEIGHT + NAV_OFFSET_BOTTOM + bottomInset + LIST_GAP;
}
