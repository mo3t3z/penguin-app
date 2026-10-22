import React from 'react';
import {colors, fonts} from '../theme';
import {Role} from '../data/mock';

const LABEL: Record<Role, string> = {owner: 'OWNER', admin: 'ADMIN', member: 'MEMBER'};

export const RoleBadge: React.FC<{role: Role; style?: React.CSSProperties}> = ({role, style}) => {
  const owner = role === 'owner';
  const admin = role === 'admin';
  return (
    <div
      style={{
        display: 'inline-block',
        padding: '4px 12px',
        borderRadius: 10,
        fontFamily: fonts.numbers,
        fontWeight: 800,
        fontSize: 16,
        letterSpacing: 1,
        background: owner ? colors.dark.primary : admin ? colors.dark.accent : colors.dark.card,
        color: owner ? colors.onPrimary : admin ? '#FFC08A' : colors.dark.mutedForeground,
        border: `2px solid ${owner ? colors.dark.primary : colors.dark.border}`,
        ...style,
      }}
    >
      {LABEL[role]}
    </div>
  );
};
