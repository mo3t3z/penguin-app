import React from 'react';
import {AbsoluteFill, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors} from '../theme';
import {copy} from '../copy';
import {springs} from '../anim';
import {Caption} from '../components/Caption';
import {BUBBLES, wobble} from './bubbles';

export const Bubble: React.FC<{b: (typeof BUBBLES)[number]; x: number; y: number; scale: number; rot: number; opacity?: number}> = ({b, x, y, scale, rot, opacity = 1}) => (
  <div
    style={{
      position: 'absolute',
      left: x - b.size / 2,
      top: y - b.size / 2,
      width: b.size,
      height: b.size,
      borderRadius: b.size,
      background: `hsl(${b.hue} 35% 22%)`,
      border: `3px solid hsl(${b.hue} 60% 45%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: b.size * 0.42,
      transform: `scale(${scale}) rotate(${rot}deg)`,
      opacity,
    }}
  >
    {b.glyph}
  </div>
);

export const S1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  return (
    <AbsoluteFill style={{background: colors.dark.background}}>
      {BUBBLES.map((b, i) => {
        const s = spring({frame: frame - i * 2, fps, config: springs.bouncy});
        const w = wobble(b, frame);
        return <Bubble key={i} b={b} x={b.x + w.dx} y={b.y + w.dy} scale={s} rot={w.rot} opacity={0.85} />;
      })}
      <AbsoluteFill style={{background: 'radial-gradient(ellipse at center, rgba(21,18,15,0.88) 30%, rgba(21,18,15,0.2) 75%)'}} />
      <Caption text={copy.hook} position="center" size={84} delay={10} />
    </AbsoluteFill>
  );
};
