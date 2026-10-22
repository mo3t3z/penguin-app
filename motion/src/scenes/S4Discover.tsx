import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts} from '../theme';
import {copy} from '../copy';
import {springs, stagger} from '../anim';
import {posts} from '../data/mock';
import {Caption} from '../components/Caption';
import {PhoneFrame} from '../components/PhoneFrame';
import {PostCard} from '../components/PostCard';
import {StudentRow} from '../components/StudentRow';
import {TabBar} from '../components/TabBar';
import {ScreenHeader} from './S3Feed';

const TYPE_AT = 8;
const CHAR_FRAMES = 5;
const RESULTS_AT = TYPE_AT + copy.search.length * CHAR_FRAMES + 4;
const SWITCH_AT = 95;

export const S4Discover: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const typed = copy.search.slice(0, Math.max(0, Math.floor((frame - TYPE_AT) / CHAR_FRAMES)));
  const tab = spring({frame: frame - SWITCH_AT, fps, config: springs.snappy});

  return (
    <AbsoluteFill style={{background: colors.dark.background}}>
      <PhoneFrame>
        <ScreenHeader title={copy.tabs[1]} />
        <div style={{margin: '0 20px', height: 64, borderRadius: 20, background: colors.dark.card, border: `2px solid ${colors.dark.primary}`, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', direction: 'rtl'}}>
          <span style={{fontSize: 28, color: colors.dark.mutedForeground}}>⌕</span>
          <span style={{fontFamily: fonts.numbers, fontSize: 30, fontWeight: 600, color: colors.dark.foreground, direction: 'ltr'}}>
            {typed}
            <span style={{color: colors.dark.primary, opacity: Math.floor(frame / 8) % 2 ? 1 : 0}}>|</span>
          </span>
        </div>
        {/* Segmented tabs: people / posts */}
        <div style={{position: 'relative', margin: '16px 20px', height: 56, borderRadius: 18, background: colors.dark.card, display: 'flex', direction: 'rtl', fontFamily: fonts.arabic}}>
          <div style={{position: 'absolute', top: 4, bottom: 4, width: 'calc(50% - 8px)', right: `calc(4px + ${tab * 50}%)`, borderRadius: 14, background: colors.dark.primary}} />
          {[copy.people, copy.posts].map((t, i) => {
            const on = i === 0 ? tab < 0.5 : tab >= 0.5;
            return (
              <div key={t} style={{position: 'relative', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 700, color: on ? colors.onPrimary : colors.dark.mutedForeground}}>
                {t}
              </div>
            );
          })}
        </div>
        <div style={{position: 'relative', height: 760, overflow: 'hidden'}}>
          <div style={{position: 'absolute', inset: '0 20px', display: 'flex', flexDirection: 'column', gap: 12, transform: `translateX(${-tab * 110}%)`}}>
            {[0, 1, 2, 4, 6].map((s, i) => {
              const p = spring({frame: frame - RESULTS_AT - i * stagger.list, fps, config: springs.snappy});
              return <StudentRow key={s} index={s} style={{opacity: p, transform: `translateX(${(1 - p) * -260}px)`}} />;
            })}
          </div>
          <div style={{position: 'absolute', inset: '0 20px', display: 'flex', flexDirection: 'column', gap: 14, transform: `translateX(${(1 - tab) * 110}%)`}}>
            {posts.slice(3, 5).map((p, i) => (
              <PostCard key={i} {...p} style={{opacity: interpolate(tab, [0.3, 1], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}} />
            ))}
          </div>
        </div>
        <TabBar active={1} style={{position: 'absolute', left: 16, right: 16, bottom: 20}} />
      </PhoneFrame>
      <Caption text={copy.discover} delay={20} size={52} />
    </AbsoluteFill>
  );
};
