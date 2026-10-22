import React from 'react';
import {colors, fonts} from '../theme';

export const Avatar: React.FC<{name: string; hue: number; size?: number; style?: React.CSSProperties}> = ({name, hue, size = 64, style}) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: size,
      background: `hsl(${hue} 70% 55%)`,
      color: colors.onPrimary,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: fonts.arabic,
      fontWeight: 700,
      fontSize: size * 0.42,
      flexShrink: 0,
      border: `3px solid ${colors.dark.card}`,
      ...style,
    }}
  >
    {name.charAt(0)}
  </div>
);
