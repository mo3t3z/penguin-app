import React from 'react';
import {colors, fonts} from '../theme';
import {students} from '../data/mock';
import {Avatar} from './Avatar';

export const StudentRow: React.FC<{index: number; style?: React.CSSProperties}> = ({index, style}) => {
  const s = students[index];
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', background: colors.dark.card, borderRadius: 20, border: `2px solid ${colors.dark.border}`, direction: 'rtl', fontFamily: fonts.arabic, ...style}}>
      <Avatar name={s.name} hue={s.hue} size={60} />
      <div style={{flex: 1}}>
        <div style={{color: colors.dark.foreground, fontSize: 25, fontWeight: 600}}>{s.name}</div>
        <div style={{color: colors.dark.mutedForeground, fontSize: 19}}>{s.school}</div>
      </div>
      <div style={{background: colors.dark.primary, color: colors.onPrimary, borderRadius: 40, width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700}}>+</div>
    </div>
  );
};
