import {Easing, random, spring, SpringConfig} from 'remotion';

export const springs = {
  snappy: {damping: 14, stiffness: 180},
  soft: {damping: 20, stiffness: 90},
  bouncy: {damping: 9, stiffness: 150},
} satisfies Record<string, Partial<SpringConfig>>;

export const stagger = {list: 6, word: 4, char: 2} as const;
export const ease = Easing.bezier(0.22, 1, 0.36, 1);
export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const pop = (frame: number, fps: number, delay = 0, preset: keyof typeof springs = 'snappy') =>
  spring({frame: frame - delay, fps, config: springs[preset]});

// All randomness goes through seeded random() so renders are deterministic.
export const rand = (seed: string) => random(seed);
