import React from 'react';
import { SystemMode } from '@biance/shared';

const MODE_STYLE: Record<SystemMode, { bg: string; color: string; border: string }> = {
  NORMAL: {
    bg: 'rgba(22, 163, 74, 0.12)',
    color: 'var(--success)',
    border: 'rgba(22, 163, 74, 0.24)',
  },
  PAUSED: {
    bg: 'rgba(245, 158, 11, 0.12)',
    color: 'var(--warning)',
    border: 'rgba(245, 158, 11, 0.24)',
  },
  REDUCE_ONLY: {
    bg: 'rgba(249, 115, 22, 0.12)',
    color: '#ea580c',
    border: 'rgba(249, 115, 22, 0.24)',
  },
  COOL_DOWN_EXTERNAL_UNSAFE: {
    bg: 'rgba(249, 115, 22, 0.12)',
    color: '#ea580c',
    border: 'rgba(249, 115, 22, 0.24)',
  },
  SELF_ABUSE_PROTECTION: {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: 'var(--danger)',
    border: 'rgba(239, 68, 68, 0.24)',
  },
  COOL_DOWN_CAPITAL_STRESS: {
    bg: 'rgba(249, 115, 22, 0.12)',
    color: '#ea580c',
    border: 'rgba(249, 115, 22, 0.24)',
  },
  EMERGENCY_LANDING: {
    bg: 'rgba(239, 68, 68, 0.12)',
    color: 'var(--danger)',
    border: 'rgba(239, 68, 68, 0.24)',
  },
};

interface Props {
  mode: SystemMode;
  label: string;
}

export const SystemModeBadge: React.FC<Props> = ({ mode, label }) => {
  const style = MODE_STYLE[mode] ?? {
    bg: 'rgba(154, 161, 173, 0.14)',
    color: 'var(--ink-muted)',
    border: 'rgba(154, 161, 173, 0.24)',
  };
  return (
    <span
      className="badge"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        background: style.bg,
        color: style.color,
        border: `1px solid ${style.border}`,
        textTransform: 'uppercase',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: style.color,
        }}
      />
      {label}
    </span>
  );
};

