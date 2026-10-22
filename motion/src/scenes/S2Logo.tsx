import React from 'react';
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts} from '../theme';
import {copy} from '../copy';
import {clamp, ease, springs} from '../anim';
import {BUBBLES, wobble} from './bubbles';
import {Bubble} from './S1Hook';

const CX = 540;
const CY = 820;

export const S2Logo: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  // 0-30: bubbles melt into the centre. 22-50: orange disc. 40+: mascot.
  const melt = interpolate(frame, [0, 30], [0, 1], {...clamp, easing: ease});
  const disc = spring({frame: frame - 22, fps, config: springs.bouncy});
  const mascot = spring({frame: frame - 40, fps, config: springs.snappy});
  const glow = 0.5 + 0.5 * Math.sin((frame - 40) / 8);
  const wordmark = interpolate(frame, [58, 82], [0, 100], {...clamp, easing: ease});

  return (
    <AbsoluteFill style={{background: colors.dark.background}}>
      {BUBBLES.map((b, i) => {
        const w = wobble(b, frame + 100);
        return (
          <Bubble
            key={i}
            b={b}
            x={interpolate(melt, [0, 1], [b.x + w.dx, CX])}
            y={interpolate(melt, [0, 1], [b.y + w.dy, CY])}
            scale={interpolate(melt, [0, 1], [1, 0.2])}
            rot={w.rot * (1 - melt)}
            opacity={interpolate(melt, [0.6, 1], [0.85, 0], clamp)}
          />
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: CX - 230,
          top: CY - 230,
          width: 460,
          height: 460,
          borderRadius: 460,
          background: colors.dark.primary,
          transform: `scale(${disc})`,
          boxShadow: `0 0 ${80 + glow * 120 * mascot}px rgba(255,122,0,${0.35 + glow * 0.35 * mascot})`,
        }}
      />
      <Img
        src={staticFile('penguin-mascot.png')}
        style={{position: 'absolute', left: CX - 200, top: CY - 200, width: 400, height: 400, objectFit: 'contain', transform: `scale(${mascot}) translateY(${(1 - mascot) * 60}px)`, opacity: Math.min(1, mascot * 1.5)}}
      />
      <div
        style={{
          position: 'absolute',
          top: CY + 290,
          left: 60,
          right: 60,
          textAlign: 'center',
          fontFamily: fonts.numbers,
          fontWeight: 800,
          fontSize: 140,
          letterSpacing: -4,
          color: colors.dark.foreground,
          clipPath: `inset(0 ${100 - wordmark}% 0 0)`,
        }}
      >
        {copy.brand}
        <span style={{color: colors.dark.primary}}>.</span>
      </div>
    </AbsoluteFill>
  );
};
