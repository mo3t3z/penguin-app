import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts} from '../theme';
import {copy} from '../copy';
import {clamp, ease, rand, springs, stagger} from '../anim';
import {posts} from '../data/mock';
import {Caption} from '../components/Caption';
import {PhoneFrame} from '../components/PhoneFrame';
import {PostCard} from '../components/PostCard';
import {TabBar} from '../components/TabBar';

const LIKE_AT = 48;
const PRESS_AT = 80;

export const ScreenHeader: React.FC<{title: string}> = ({title}) => (
  <div style={{padding: '64px 28px 12px', direction: 'rtl', fontFamily: fonts.arabic, fontSize: 38, fontWeight: 700, color: colors.dark.foreground}}>{title}</div>
);

export const S3Feed: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const enter = spring({frame, fps, config: springs.soft});
  const liked = frame >= LIKE_AT;
  const heartPop = spring({frame: frame - LIKE_AT, fps, config: springs.bouncy});
  const burst = interpolate(frame, [LIKE_AT, LIKE_AT + 18], [0, 1], {...clamp, easing: ease});
  const press = interpolate(frame, [PRESS_AT, PRESS_AT + 4, PRESS_AT + 9], [0, 1, 0], clamp);
  const sheet = spring({frame: frame - PRESS_AT - 6, fps, config: springs.snappy});
  const typed = copy.composer.slice(0, Math.max(0, Math.floor((frame - PRESS_AT - 18) / stagger.char)));

  return (
    <AbsoluteFill style={{background: colors.dark.background}}>
      <PhoneFrame style={{transform: `translateY(${(1 - enter) * 400}px) rotate(${(1 - enter) * 6}deg)`}}>
        <ScreenHeader title={copy.tabs[0]} />
        <div style={{display: 'flex', flexDirection: 'column', gap: 16, padding: '0 20px'}}>
          {posts.slice(0, 3).map((p, i) => {
            const s = spring({frame: frame - 10 - i * stagger.list, fps, config: springs.snappy});
            return (
              <PostCard
                key={i}
                {...p}
                liked={i === 0 && liked}
                heartScale={i === 0 && liked ? 0.6 + heartPop * 0.4 + (1 - burst) * 0.3 : 1}
                style={{opacity: s, transform: `translateY(${(1 - s) * 80}px)`}}
              >
                {i === 0 && liked
                  ? Array.from({length: 6}).map((_, k) => {
                      const a = (k / 6) * Math.PI * 2 + rand(`ha${k}`) * 0.4;
                      const r = burst * (40 + rand(`hr${k}`) * 20);
                      return (
                        <div
                          key={k}
                          style={{position: 'absolute', right: 10 + Math.cos(a) * r, top: 12 + Math.sin(a) * r, width: 10, height: 10, borderRadius: 10, background: colors.dark.primary, opacity: 1 - burst}}
                        />
                      );
                    })
                  : null}
              </PostCard>
            );
          })}
        </div>
        <AbsoluteFill style={{background: `rgba(0,0,0,${sheet * 0.5})`}} />
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: 560,
            background: colors.dark.card,
            borderTopLeftRadius: 36,
            borderTopRightRadius: 36,
            borderTop: `2px solid ${colors.dark.border}`,
            transform: `translateY(${(1 - sheet) * 600}px)`,
            padding: 28,
            direction: 'rtl',
            fontFamily: fonts.arabic,
          }}
        >
          <div style={{width: 60, height: 6, borderRadius: 6, background: colors.dark.border, margin: '0 auto 24px'}} />
          <div style={{fontSize: 30, fontWeight: 700, color: colors.dark.foreground, marginBottom: 18}}>{copy.tabs[2]}</div>
          <div style={{minHeight: 200, borderRadius: 20, border: `2px solid ${colors.dark.border}`, padding: 20, fontSize: 28, color: colors.dark.foreground}}>
            {typed}
            <span style={{color: colors.dark.primary, opacity: Math.floor(frame / 8) % 2 ? 1 : 0}}>|</span>
          </div>
          <div style={{marginTop: 20, display: 'inline-block', background: colors.dark.primary, color: colors.onPrimary, borderRadius: 16, padding: '12px 36px', fontSize: 26, fontWeight: 700}}>
            ←
          </div>
        </div>
        <TabBar active={0} pressCreate={press} style={{position: 'absolute', left: 16, right: 16, bottom: 20, opacity: 1 - sheet}} />
      </PhoneFrame>
      <Caption text={copy.feed} delay={20} size={52} />
    </AbsoluteFill>
  );
};
