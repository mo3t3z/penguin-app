import React from 'react';
import {colors, fonts} from '../theme';
import {students} from '../data/mock';
import {Avatar} from './Avatar';

export const PostCard: React.FC<{
  author: number;
  text: string;
  likes: number;
  liked?: boolean;
  heartScale?: number;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}> = ({author, text, likes, liked, heartScale = 1, style, children}) => {
  const s = students[author];
  return (
    <div style={{position: 'relative', background: colors.dark.card, border: `2px solid ${colors.dark.border}`, borderRadius: 24, padding: 22, direction: 'rtl', fontFamily: fonts.arabic, ...style}}>
      <div style={{display: 'flex', alignItems: 'center', gap: 14}}>
        <Avatar name={s.name} hue={s.hue} size={52} />
        <div>
          <div style={{color: colors.dark.foreground, fontSize: 24, fontWeight: 600}}>{s.name}</div>
          <div style={{color: colors.dark.mutedForeground, fontSize: 18}}>{s.school}</div>
        </div>
      </div>
      <div style={{color: colors.dark.foreground, fontSize: 25, lineHeight: 1.5, marginTop: 12}}>{text}</div>
      <div style={{position: 'relative', display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, color: liked ? colors.dark.primary : colors.dark.mutedForeground}}>
        <span style={{display: 'inline-block', fontSize: 30, transform: `scale(${heartScale})`}}>{liked ? '♥' : '♡'}</span>
        <span style={{fontFamily: fonts.numbers, fontSize: 20, fontWeight: 600}}>{likes + (liked ? 1 : 0)}</span>
        {children}
      </div>
    </div>
  );
};
