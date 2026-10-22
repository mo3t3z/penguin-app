import React from 'react';
import {AbsoluteFill, Img, interpolate, interpolateColors, spring, staticFile, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts, SAFE} from '../theme';
import {copy} from '../copy';
import {clamp, springs, stagger} from '../anim';
import {Caption} from '../components/Caption';
import {TabBar} from '../components/TabBar';

// All motion settles before frame 105, so the last 15 frames hold still.
export const S7CTA: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const flip = interpolate(frame, [0, 20], [0, 1], clamp);
  const bg = interpolateColors(flip, [0, 1], [colors.dark.background, colors.light.background]);
  const fg = interpolateColors(flip, [0, 1], [colors.dark.foreground, colors.light.foreground]);
  const jump = spring({frame: frame - 12, fps, config: springs.bouncy});
  const hop = Math.sin(interpolate(frame, [20, 50], [0, Math.PI], clamp)) * 70;
  const cta = spring({frame: frame - 60, fps, config: springs.snappy});

  return (
    <AbsoluteFill style={{background: bg}}>
      <Img
        src={staticFile('penguin-mascot.png')}
        style={{position: 'absolute', left: 540 - 220, top: 330 - hop, width: 440, height: 440, objectFit: 'contain', transform: `scale(${jump})`}}
      />
      <Caption text={copy.ctaTitle} top={830} delay={24} size={72} color={fg} shadow={false} />
      <div style={{position: 'absolute', top: 1080, left: 0, right: 0, display: 'flex', justifyContent: 'center'}}>
        <div style={{transform: `scale(${cta})`, opacity: Math.min(1, cta), background: colors.dark.primary, color: colors.onPrimary, fontFamily: fonts.arabic, fontWeight: 700, fontSize: 56, borderRadius: 999, padding: '18px 72px', direction: copy.dir}}>
          {copy.cta}
        </div>
      </div>
      <TabBar
        light
        active={-1}
        appear={(i) => spring({frame: frame - 40 - i * stagger.list, fps, config: springs.snappy})}
        style={{position: 'absolute', left: SAFE.side + 60, right: SAFE.side + 60, bottom: SAFE.bottom + 40}}
      />
    </AbsoluteFill>
  );
};
