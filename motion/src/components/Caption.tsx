import React from 'react';
import {spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts, SAFE} from '../theme';
import {copy} from '../copy';
import {springs, stagger} from '../anim';

// Text always stays inside the safe zone: 150px top, 380px bottom, 60px sides.
export const Caption: React.FC<{text: string; delay?: number; color?: string; position?: 'bottom' | 'center' | 'top'; size?: number; top?: number; shadow?: boolean}> = ({
  text,
  delay = 0,
  color = colors.dark.foreground,
  position = 'bottom',
  size = 60,
  top,
  shadow = true,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const words = text.split(' ');
  const place: React.CSSProperties =
    top !== undefined ? {top: Math.max(SAFE.top, top)} : position === 'bottom' ? {bottom: SAFE.bottom + 10} : position === 'top' ? {top: SAFE.top + 10} : {top: SAFE.top, bottom: SAFE.bottom};
  return (
    <div
      style={{
        position: 'absolute',
        left: SAFE.side,
        right: SAFE.side,
        ...place,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignContent: 'center',
        columnGap: size * 0.28,
        direction: copy.dir,
        fontFamily: fonts.arabic,
        fontWeight: 700,
        fontSize: size,
        lineHeight: 1.35,
        color,
        textAlign: 'center',
        textShadow: shadow ? '0 4px 24px rgba(0,0,0,0.35)' : 'none',
      }}
    >
      {words.map((w, i) => {
        const p = spring({frame: frame - delay - i * stagger.word, fps, config: springs.snappy});
        return (
          <span key={i} style={{display: 'inline-block', opacity: Math.min(1, p), transform: `translateY(${(1 - p) * 40}px)`}}>
            {w}
          </span>
        );
      })}
    </div>
  );
};
