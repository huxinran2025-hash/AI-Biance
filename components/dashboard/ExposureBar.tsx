import React from 'react';
import { fmtPct, fmtUsd } from '../../utils/dashboard/format';

interface ExposureBarProps {
  usedUsd: number;
  capUsd: number;
}

const TONE_COLOR: Record<'success' | 'warning' | 'danger', string> = {
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
};

export const ExposureBar: React.FC<ExposureBarProps> = ({ usedUsd, capUsd }) => {
  const ratio = capUsd > 0 ? usedUsd / capUsd : 0;
  const clampedRatio = Math.max(0, Math.min(ratio, 1));

  let tone: 'success' | 'warning' | 'danger' = 'success';
  if (ratio >= 1) {
    tone = 'danger';
  } else if (ratio >= 0.7) {
    tone = 'warning';
  }

  const barColor = TONE_COLOR[tone];

  return (
    <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-muted)' }}>
        <span>资金利用率</span>
        <span style={{ fontWeight: 600, color: barColor }}>{fmtPct(ratio)}</span>
      </div>
      <div
        style={{
          position: 'relative',
          height: 10,
          borderRadius: 999,
          background: 'var(--ink-soft)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            width: `${clampedRatio * 100}%`,
            background: barColor,
            transition: 'width 0.3s ease',
          }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink-muted)' }}>
        <span>已用 {fmtUsd(usedUsd, { maximumFractionDigits: 0 })}</span>
        <span>上限 {fmtUsd(capUsd, { maximumFractionDigits: 0 })}</span>
      </div>
    </div>
  );
};

export default ExposureBar;

