import React from 'react';

interface PanelProps {
  title: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Panel({ title, actions, children, className = '', style }: PanelProps) {
  return (
    <section className={['card', className].filter(Boolean).join(' ')} style={style}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 20px 12px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <h3 className="h2" style={{ fontSize: 16, fontWeight: 600 }}>
          {title}
        </h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--ink-muted)', fontSize: 14 }}>
          {actions}
        </div>
      </header>
      <div style={{ padding: 20, fontSize: 14, color: 'var(--ink)' }}>{children}</div>
    </section>
  );
}

export default Panel;

