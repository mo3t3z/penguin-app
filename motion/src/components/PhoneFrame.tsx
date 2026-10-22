import React from 'react';
import {colors} from '../theme';

export const PHONE = {width: 640, height: 1160, top: 170};

export const PhoneFrame: React.FC<{children: React.ReactNode; style?: React.CSSProperties}> = ({children, style}) => (
  <div
    style={{
      position: 'absolute',
      left: (1080 - PHONE.width) / 2,
      top: PHONE.top,
      width: PHONE.width,
      height: PHONE.height,
      borderRadius: 72,
      background: '#0B0907',
      padding: 16,
      boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 0 0 2px #3a332c inset',
      ...style,
    }}
  >
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: 58,
        overflow: 'hidden',
        background: colors.dark.background,
      }}
    >
      <div style={{position: 'absolute', top: 14, left: '50%', marginLeft: -60, width: 120, height: 32, borderRadius: 20, background: '#000', zIndex: 10}} />
      {children}
    </div>
  </div>
);
