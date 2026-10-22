import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts} from '../theme';
import {copy} from '../copy';
import {clamp, springs} from '../anim';
import {chat, students} from '../data/mock';
import {Avatar} from '../components/Avatar';
import {Caption} from '../components/Caption';
import {ChatBubble} from '../components/ChatBubble';
import {PhoneFrame} from '../components/PhoneFrame';
import {TabBar} from '../components/TabBar';
import {TypingDots} from '../components/TypingDots';

// Frame each message appears. Typing dots show before the last incoming reply.
const AT = [6, 20, 34, 46, 82, 100];
const TYPING = [58, 82];
const READ_AT = 116;

export const S5Chat: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const friend = students[2];
  const highlight = spring({frame, fps, config: springs.soft});
  const typingOn = frame >= TYPING[0] && frame < TYPING[1];

  return (
    <AbsoluteFill style={{background: colors.dark.background}}>
      <PhoneFrame>
        <div style={{display: 'flex', alignItems: 'center', gap: 14, padding: '62px 24px 16px', direction: 'rtl', borderBottom: `2px solid ${colors.dark.border}`, fontFamily: fonts.arabic}}>
          <Avatar name={friend.name} hue={friend.hue} size={56} />
          <div>
            <div style={{fontSize: 28, fontWeight: 700, color: colors.dark.foreground}}>{friend.name}</div>
            <div style={{fontSize: 18, color: typingOn ? colors.dark.primary : colors.dark.mutedForeground}}>{typingOn ? '…' : '●'}</div>
          </div>
        </div>
        <div style={{display: 'flex', flexDirection: 'column', gap: 12, padding: 20}}>
          {chat.map((m, i) => {
            const p = spring({frame: frame - AT[i], fps, config: springs.bouncy});
            if (frame < AT[i]) return null;
            const mine = m.from === 'me';
            const isLast = i === chat.length - 1;
            return (
              <ChatBubble
                key={i}
                text={m.text}
                mine={mine}
                read={mine ? (isLast ? frame >= READ_AT : true) : undefined}
                style={{transform: `scale(${p})`, transformOrigin: mine ? 'left bottom' : 'right bottom', opacity: Math.min(1, p * 2)}}
              />
            );
          })}
          {typingOn ? (
            <div style={{display: 'flex', justifyContent: 'flex-end', opacity: interpolate(frame, [TYPING[0], TYPING[0] + 5], [0, 1], clamp)}}>
              <TypingDots />
            </div>
          ) : null}
        </div>
        <TabBar active={3} highlight={highlight} style={{position: 'absolute', left: 16, right: 16, bottom: 20}} />
      </PhoneFrame>
      <Caption text={copy.chat} delay={20} size={52} />
    </AbsoluteFill>
  );
};
