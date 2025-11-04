import React from 'react';

interface InfoCardProps {
  title: string;
  value: React.ReactNode;
  hint?: string;
  icon?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  valueTone?: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'muted';
}

const VALUE_TONE_MAP: Record<NonNullable<InfoCardProps['valueTone']>, string> = {
  default: 'var(--ink)',
  brand: 'var(--brand-ink)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  muted: 'var(--ink-muted)',
};

export function InfoCard({
  title,
  value,
  hint,
  icon,
  children,
  footer,
  className,
  style,
  valueTone = 'default',
}: InfoCardProps) {
  const valueColor = VALUE_TONE_MAP[valueTone];

  return (
    <section
      className={["card", className].filter(Boolean).join(' ')}
      style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, ...style }}
    >
      <div className="h2" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        {icon ? <span style={{ display: 'inline-flex', color: 'var(--brand)' }}>{icon}</span> : null}
        <span>{title}</span>
      </div>
      <div
        className="kpi"
        style={{ fontSize: 20, color: valueColor, display: 'flex', alignItems: 'baseline', gap: 8 }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ color: 'var(--ink-subtle)', fontSize: 12, lineHeight: 1.5 }}>{hint}</div>
      ) : null}
      {children ? (
        <div style={{ fontSize: 13, color: 'var(--ink)' }}>{children}</div>
      ) : null}
      {footer ? (
        <div style={{ marginTop: 'auto', paddingTop: 8, borderTop: `1px solid var(--border)`, fontSize: 12, color: 'var(--ink-muted)' }}>
          {footer}
        </div>
      ) : null}
    </section>
  );
}

export default InfoCard;

