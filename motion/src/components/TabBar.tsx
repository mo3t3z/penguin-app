import React from 'react';
import {colors, fonts} from '../theme';
import {copy} from '../copy';

// Order fixed: Home, Discover, Create, Messages, Profile (matches the app's nav).
export const TAB_ICONS = ['⌂', '⌕', '+', '✉', '◉'];

export const TabBar: React.FC<{
  active?: number;
  highlight?: number;
  appear?: (i: number) => number;
  light?: boolean;
  pressCreate?: number;
  style?: React.CSSProperties;
}> = ({active = 0, highlight = 0, appear, light, pressCreate = 0, style}) => {
  const fg = light ? colors.light.foreground : colors.dark.foreground;
  return (
    <div style={{display: 'flex', direction: 'ltr', justifyContent: 'space-around', alignItems: 'center', height: 96, borderRadius: 32, background: light ? '#FFFFFF' : '#2B2620', border: `2px solid ${light ? '#ECE5DC' : colors.dark.border}`, ...style}}>
      {TAB_ICONS.map((icon, i) => {
        const a = appear ? appear(i) : 1;
        const isCreate = i === 2;
        const isActive = i === active;
        const scale = (0.6 + a * 0.4) * (isActive ? 1 + highlight * 0.15 : 1) * (isCreate ? 1 - pressCreate * 0.18 : 1);
        return (
          <div key={i} style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, opacity: a, transform: `translateY(${(1 - a) * 30}px) scale(${scale})`}}>
            <div
              style={{
                width: isCreate ? 56 : 48,
                height: isCreate ? 56 : 40,
                borderRadius: isCreate ? 16 : 20,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isCreate ? 36 : 28,
                fontWeight: 700,
                background: isCreate ? colors.dark.primary : isActive ? `rgba(255,122,0,${0.15 + highlight * 0.25})` : 'transparent',
                color: isCreate ? colors.onPrimary : isActive ? colors.dark.primary : fg,
              }}
            >
              {icon}
            </div>
            {!isCreate ? (
              <div style={{fontFamily: fonts.arabic, fontSize: 15, color: isActive ? colors.dark.primary : fg, opacity: isActive ? 1 : 0.75}}>{copy.tabs[i]}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
};
