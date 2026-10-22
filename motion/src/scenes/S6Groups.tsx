import React from 'react';
import {AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig} from 'remotion';
import {colors, fonts} from '../theme';
import {copy} from '../copy';
import {clamp, ease, springs, stagger} from '../anim';
import {group, students} from '../data/mock';
import {Avatar} from '../components/Avatar';
import {Caption} from '../components/Caption';
import {RoleBadge} from '../components/RoleBadge';

const CX = 540;
const CY = 800;
const R = 330;

export const S6Groups: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const count = Math.round(interpolate(frame, [20, 90], [0, group.total], {...clamp, easing: ease}));
  const ring = spring({frame, fps, config: springs.soft});

  return (
    <AbsoluteFill style={{background: colors.dark.background}}>
      <div style={{position: 'absolute', left: CX - R, top: CY - R, width: R * 2, height: R * 2, borderRadius: R * 2, border: `3px dashed ${colors.dark.border}`, transform: `scale(${ring}) rotate(${frame * 0.3}deg)`}} />
      <div style={{position: 'absolute', left: CX - 170, top: CY - 170, width: 340, height: 340, borderRadius: 340, background: colors.dark.accent, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', transform: `scale(${ring})`}}>
        <div style={{fontFamily: fonts.numbers, fontWeight: 800, fontSize: 130, color: colors.dark.primary, lineHeight: 1}}>{count}</div>
        <div style={{fontFamily: fonts.arabic, fontSize: 30, color: colors.dark.foreground, direction: 'rtl'}}>{copy.members}</div>
        <div style={{fontFamily: fonts.arabic, fontSize: 24, color: colors.dark.mutedForeground, direction: 'rtl', marginTop: 4}}>{group.name}</div>
      </div>
      {group.members.map((m, i) => {
        const a = -Math.PI / 2 + (i / group.members.length) * Math.PI * 2;
        const x = CX + Math.cos(a) * R;
        const y = CY + Math.sin(a) * R;
        const p = spring({frame: frame - 8 - i * stagger.list, fps, config: springs.bouncy});
        const stampAt = 44 + i * stagger.list;
        const st = spring({frame: frame - stampAt, fps, config: springs.snappy});
        const s = students[m.student];
        return (
          <div key={i} style={{position: 'absolute', left: x - 70, top: y - 70, width: 140, display: 'flex', flexDirection: 'column', alignItems: 'center', transform: `scale(${p})`}}>
            <Avatar name={s.name} hue={s.hue} size={120} style={{border: `5px solid ${m.role === 'owner' ? colors.dark.primary : colors.dark.card}`}} />
            <RoleBadge
              role={m.role}
              style={{marginTop: -16, opacity: frame >= stampAt ? 1 : 0, transform: `scale(${interpolate(st, [0, 1], [1.4, 1])}) rotate(${interpolate(st, [0, 1], [-8, 0])}deg)`}}
            />
          </div>
        );
      })}
      <Caption text={copy.groups} delay={20} size={60} />
    </AbsoluteFill>
  );
};
