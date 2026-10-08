import test from 'node:test';
import assert from 'node:assert/strict';
import { colors } from '../src/theme/tokens.ts';

function luminance(hex) {
  const channels = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
const pairs = [
  ['foreground', 'background'], ['card-foreground', 'card'],
  ['muted-foreground', 'background'], ['muted-foreground', 'card'],
  ['primary-foreground', 'primary'], ['secondary-foreground', 'secondary'],
  ['accent-foreground', 'accent'], ['foreground', 'accent'], ['muted-foreground', 'accent'],
  ['destructive-foreground', 'destructive'], ['destructive', 'background'],
  ['success', 'background'], ['warning', 'background'],
];
for (const [scheme, palette] of Object.entries(colors)) {
  test(`${scheme}: semantic text pairs meet WCAG AA normal-text contrast`, () => {
    for (const [foreground, background] of pairs) {
      const values = [luminance(palette[foreground]), luminance(palette[background])];
      const ratio = (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
      assert.ok(ratio >= 4.5, `${foreground}/${background}: ${ratio.toFixed(2)}:1`);
    }
  });
}
