// Where a vertical swipe on the Create sheet's handle or header lands. The sheet
// has two resting places: expanded (full height) and lowered (the keyboard closes
// and the page behind shows more). A swipe down lowers an expanded sheet and closes
// a lowered one; a swipe up expands. Short or slow drags settle back where they
// started. Pure, so it can be unit tested.
export type SheetPosition = 'expanded' | 'lowered';
export type SheetSwipeResult = SheetPosition | 'close';

// A swipe counts once it travels this far, or moves this fast (points per ms).
export const SWIPE_DISTANCE = 64;
export const SWIPE_VELOCITY = 0.5;

export function sheetSwipeResult(from: SheetPosition, dy: number, vy: number): SheetSwipeResult {
  const down = dy > SWIPE_DISTANCE || vy > SWIPE_VELOCITY;
  const up = dy < -SWIPE_DISTANCE || vy < -SWIPE_VELOCITY;
  if (down) return from === 'expanded' ? 'lowered' : 'close';
  if (up) return 'expanded';
  return from;
}

// How far down a lowered sheet rests: a third of the space it has, at most 320.
export const loweredOffset = (sheetHeight: number) => Math.min(320, Math.round(sheetHeight / 3));

// While dragging, the sheet follows the finger, but it cannot rise above full height.
export function dragOffset(from: SheetPosition, dy: number, sheetHeight: number) {
  const start = from === 'expanded' ? 0 : loweredOffset(sheetHeight);
  return Math.max(0, start + dy);
}
