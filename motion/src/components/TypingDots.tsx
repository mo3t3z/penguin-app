import React from 'react';
import {useCurrentFrame} from 'remotion';
import {colors} from '../theme';

export const TypingDots: React.FC<{style?: React.CSSProperties}> = ({style}) => {
  const frame = useCurrentFrame();
  return (
    <div style={{display: 'inline-flex', gap: 8, padding: '18px 22px', borderRadius: 26, background: colors.dark.card, border: `2px solid ${colors.dark.border}`, ...style}}>
      {[0, 1, 2].map((i) => {
        const t = Math.max(0, Math.sin(((frame - i * 4) / 20) * Math.PI));
        return <div key={i} style={{width: 12, height: 12, borderRadius: 12, background: colors.dark.mutedForeground, transform: `translateY(${-t * 8}px)`, opacity: 0.5 + t * 0.5}} />;
      })}
    </div>
  );
};
