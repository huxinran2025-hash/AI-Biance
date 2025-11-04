import React from 'react';

type Tone = 'default' | 'muted' | 'warning' | 'danger' | 'success';

export interface KpiItem {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
}

const TONE_COLOR: Record<Tone, string> = {
  default: 'var(--ink)',
  muted: 'var(--ink-muted)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  success: 'var(--success)',
};

interface KpiRowProps {
  items: KpiItem[];
}

export const KpiRow: React.FC<KpiRowProps> = ({ items }) => {
  if (!items.length) {
    return null;
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
        gap: 12,
        marginTop: 12,
      }}
    >
      {items.map(({ label, value, hint, tone = 'default' }) => (
        <div
          key={label}
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            padding: 12,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--card)',
          }}
        >
          <span style={{ fontSize: 12, color: 'var(--ink-muted)', letterSpacing: 0.3 }}>{label}</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: TONE_COLOR[tone] }}>{value}</span>
          {hint ? (
            <span style={{ fontSize: 12, color: 'var(--ink-subtle)' }}>{hint}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
};

export default KpiRow;

