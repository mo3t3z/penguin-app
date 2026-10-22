import {rand} from '../anim';

// Generic "scattered apps" bubbles shared by S1 (chaos) and S2 (they melt into the logo).
const GLYPHS = ['💬', '📅', '📁', '🔔', '📷', '📝', '🎓', '📌', '✉', '🔗', '📊', '☕'];

export const BUBBLES = GLYPHS.map((glyph, i) => ({
  glyph,
  x: 120 + rand(`bx${i}`) * 840,
  y: 260 + rand(`by${i}`) * 1100,
  size: 110 + rand(`bs${i}`) * 80,
  phase: rand(`bp${i}`) * Math.PI * 2,
  speed: 0.6 + rand(`bv${i}`) * 0.8,
  hue: [24, 200, 330, 140, 270, 50][i % 6],
}));

export const wobble = (b: (typeof BUBBLES)[number], frame: number) => ({
  dx: Math.sin(frame / 15 * b.speed + b.phase) * 26,
  dy: Math.cos(frame / 18 * b.speed + b.phase) * 22,
  rot: Math.sin(frame / 20 + b.phase) * 10,
});
