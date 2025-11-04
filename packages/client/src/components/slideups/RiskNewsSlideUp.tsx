import React from 'react';
import { DashboardState, Language } from '@biance/shared';
import { t } from '../../i18n';

interface RiskNewsSlideUpProps {
  dashboard: DashboardState | null;
  language: Language;
  isOpen: boolean;
  onClose: () => void;
}

const getStatusColor = (status: string): React.CSSProperties => {
  switch (status) {
    case 'ok':
      return { color: 'var(--success)', background: 'var(--success-soft)', borderColor: 'var(--success)' };
    case 'degraded':
      return { color: 'var(--warning)', background: 'var(--warning-soft)', borderColor: 'var(--warning)' };
    case 'withdrawal_suspended':
    case 'trading_halted':
    case 'regulatory_action':
      return { color: 'var(--danger)', background: 'var(--danger-soft)', borderColor: 'var(--danger)' };
    case 'unreachable':
    default:
      return { color: 'var(--ink-muted)', background: 'var(--ink-soft)', borderColor: 'var(--border)' };
  }
};

const RiskNewsSlideUp: React.FC<RiskNewsSlideUpProps> = ({ dashboard, language, isOpen, onClose }) => {
  if (!isOpen || !dashboard) {
    return null;
  }

  const exchangeSources = dashboard.exchangeHealth?.allSources ?? [];
  const alerts = dashboard.recentExternalAlerts ?? [];

  return (
    <div
      style={{
        position: 'fixed',
        insetInline: 0,
        bottom: 0,
        zIndex: 40,
        transform: isOpen ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform 0.3s ease',
      }}
    >
      <div
        style={{
          margin: '0 auto',
          maxWidth: 980,
          borderTopLeftRadius: 20,
          borderTopRightRadius: 20,
          border: '1px solid var(--border)',
          background: 'var(--card)',
          boxShadow: 'var(--shadow)',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: 48,
            paddingInline: 16,
            borderBottom: '1px solid var(--border)',
            background: 'var(--elev)',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>关键情报 &amp; RSS</div>
          <button type="button" className="btn" onClick={onClose} style={{ padding: '6px 12px', fontSize: 12 }}>
            关闭
          </button>
        </header>
        <div style={{ maxHeight: '50vh', overflowY: 'auto', padding: 16 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            <div>
              <h3 style={{ fontSize: 12, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: 0.2, marginBottom: 8 }}>
                交易所健康
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {exchangeSources.length > 0 ? (
                  exchangeSources.map((source) => (
                    <div
                      key={`${source.exchange}-${source.status}`}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 13, color: 'var(--ink-muted)' }}
                    >
                      <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{source.exchange}</span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          border: '1px solid var(--border)',
                          ...getStatusColor(source.status),
                        }}
                      >
                        {t(source.status as any, 'zh')}
                      </span>
                    </div>
                  ))
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>暂无数据</p>
                )}
              </div>
            </div>
            <div>
              <h3 style={{ fontSize: 12, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: 0.2, marginBottom: 8 }}>
                最新新闻
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {alerts.length > 0 ? (
                  alerts.slice(0, 6).map((alert) => (
                    <article key={alert.idHash} style={{ fontSize: 13, color: 'var(--ink)' }}>
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginBottom: 4 }}>
                        {new Date(alert.publishedAt).toLocaleTimeString()}
                      </div>
                      <div style={{ fontWeight: 600, lineHeight: 1.6 }}>{alert.title}</div>
                      {alert.summary ? (
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>{alert.summary}</div>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>暂无新闻</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RiskNewsSlideUp;

