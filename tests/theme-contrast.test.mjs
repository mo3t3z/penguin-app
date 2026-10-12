import test from 'node:test';
import assert from 'node:assert/strict';
import { colors } from '../src/theme/tokens.ts';

const channelsOf = (hex) => [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
const alphaOf = (hex) => hex.length === 9 ? parseInt(hex.slice(7, 9), 16) / 255 : 1;
// A colour with alpha, as seen over an opaque backdrop.
function over(hex, backdrop) {
  const alpha = alphaOf(hex);
  const [top, bottom] = [channelsOf(hex), channelsOf(backdrop)];
  return `#${top.map((value, index) => Math.round(value * alpha + bottom[index] * (1 - alpha)).toString(16).padStart(2, '0')).join('')}`;
}
function luminance(hex) {
  const channels = channelsOf(hex).map(value => value / 255)
    .map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
function contrast(first, second) {
  const values = [luminance(first), luminance(second)];
  return (Math.max(...values) + 0.05) / (Math.min(...values) + 0.05);
}

// Every pair in the design system's Accessibility section.
const textPairs = [
  ['foreground', 'background'], ['foreground', 'card'], ['foreground', 'surface-raised'], ['foreground', 'muted'],
  ['muted-foreground', 'background'], ['muted-foreground', 'card'], ['muted-foreground', 'surface-raised'], ['muted-foreground', 'muted'],
  ['primary-text', 'background'], ['primary-text', 'card'], ['primary-text', 'muted'], ['primary-text', 'surface-raised'],
  ['primary-foreground', 'primary'], ['primary-foreground', 'primary-pressed'],
  ['accent-foreground', 'accent'], ['foreground', 'accent'], ['secondary-foreground', 'secondary'],
  ['success', 'background'], ['success', 'card'], ['success', 'success-surface'], ['success', 'surface-raised'],
  ['warning', 'background'], ['warning', 'warning-surface'], ['warning', 'surface-raised'],
  ['destructive', 'background'], ['destructive', 'card'], ['destructive', 'surface-raised'], ['destructive', 'destructive-surface'],
  ['destructive-foreground', 'destructive'],
  ['info', 'background'], ['info', 'info-surface'], ['info', 'surface-raised'],
];
// Control outlines and focus rings.
const controlPairs = [
  ['input', 'background'], ['input', 'card'], ['input', 'surface-raised'],
  ['focus', 'background'], ['focus', 'card'], ['focus', 'muted'], ['focus', 'surface-raised'],
];
// The navigation is glass: whatever scrolls underneath shows through.
const backdrops = { black: '#000000', white: '#FFFFFF', orange: '#FF7A00', red: '#FF0000', grey: '#808080' };

for (const [scheme, palette] of Object.entries(colors)) {
  test(`${scheme}: text pairs meet WCAG AA normal-text contrast`, () => {
    for (const [foreground, background] of textPairs) {
      const ratio = contrast(palette[foreground], palette[background]);
      assert.ok(ratio >= 4.5, `${foreground}/${background}: ${ratio.toFixed(2)}:1`);
    }
  });
  test(`${scheme}: control outlines and focus rings meet 3:1`, () => {
    for (const [foreground, background] of controlPairs) {
      const ratio = contrast(palette[foreground], palette[background]);
      assert.ok(ratio >= 3, `${foreground}/${background}: ${ratio.toFixed(2)}:1`);
    }
  });
  test(`${scheme}: navigation labels stay readable over any content`, () => {
    for (const [name, backdrop] of Object.entries({ ...backdrops, background: palette.background })) {
      for (const surface of ['nav-surface', 'nav-surface-solid']) {
        const glass = over(palette[surface], backdrop);
        const label = contrast(palette['nav-label'], glass);
        assert.ok(label >= 4.5, `nav-label/${surface} over ${name}: ${label.toFixed(2)}:1`);
        const selected = contrast(palette.foreground, over(palette['nav-active'], glass));
        assert.ok(selected >= 4.5, `foreground/nav-active on ${surface} over ${name}: ${selected.toFixed(2)}:1`);
      }
    }
  });
}
