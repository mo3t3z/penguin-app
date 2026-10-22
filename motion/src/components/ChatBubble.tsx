import React from 'react';
import {colors, fonts} from '../theme';

// In RTL the user's own messages sit on the left.
export const ChatBubble: React.FC<{text: string; mine: boolean; read?: boolean; style?: React.CSSProperties}> = ({text, mine, read, style}) => (
  <div style={{display: 'flex', justifyContent: mine ? 'flex-start' : 'flex-end', direction: 'ltr', ...style}}>
    <div
      style={{
        maxWidth: 420,
        padding: '14px 20px',
        borderRadius: 26,
        borderBottomLeftRadius: mine ? 6 : 26,
        borderBottomRightRadius: mine ? 26 : 6,
        background: mine ? colors.dark.primary : colors.dark.card,
        color: mine ? colors.onPrimary : colors.dark.foreground,
        border: mine ? 'none' : `2px solid ${colors.dark.border}`,
        fontFamily: fonts.arabic,
        fontSize: 26,
        direction: 'rtl',
        fontWeight: mine ? 600 : 400,
      }}
    >
      {text}
      {mine && read !== undefined ? (
        <span style={{marginInlineStart: 10, fontFamily: fonts.numbers, fontSize: 20, opacity: read ? 1 : 0.5}}>{read ? '✓✓' : '✓'}</span>
      ) : null}
    </div>
  </div>
);
