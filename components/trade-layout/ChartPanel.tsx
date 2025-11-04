import React from 'react';
import { useGlobalStore } from '../../state/useGlobalStore';
import { t } from '../../i18n';
import { BrainCircuitIcon, RefreshIcon } from '../icons';
import { Panel } from '../ui/Panel';

const ChartPanel: React.FC = () => {
  const {
    state: { language, activeSymbol, dashboard },
  } = useGlobalStore();

  const symbol = activeSymbol ?? 'BTCUSDT';
  const marketEntry = dashboard?.market?.[symbol];
  const priceChange = marketEntry?.priceChange24h ?? 0;
  const volume24h = marketEntry?.volume24h ?? 0;

  return (
    <Panel
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-muted)' }}>
          <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.2em' }}>{t('chart', language)}</span>
          <span className="h2" style={{ fontSize: 18, color: 'var(--ink)' }}>
            {symbol}
          </span>
        </div>
      }
      actions={
        <button type="button" className="btn" style={{ padding: '6px 10px', fontSize: 12, fontWeight: 600 }}>
          <RefreshIcon style={{ width: 14, height: 14 }} />
          刷新
        </button>
      }
      style={{ minHeight: 420 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, fontSize: 14, color: 'var(--ink-muted)' }}>
          <div className="h2" style={{ fontSize: 18 }}>
            {symbol}
          </div>
          <div>
            日涨跌：
            <span style={{ fontWeight: 700, color: priceChange >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {priceChange >= 0 ? '+' : ''}
              {priceChange.toFixed(2)}%
            </span>
          </div>
          <div>
            24 小时成交量：
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>
              {volume24h ? volume24h.toLocaleString() : '--'}
            </span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 340,
            borderRadius: 16,
            border: '1px dashed var(--border)',
            background: 'linear-gradient(120deg, rgba(242, 235, 255, 0.6), rgba(247, 245, 255, 0.4))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: 'var(--ink-muted)',
            padding: 24,
          }}
        >
          <div>
            <BrainCircuitIcon style={{ height: 64, width: 64, color: 'var(--brand)', margin: '0 auto' }} />
            <p className="h2" style={{ fontSize: 16, marginTop: 16, color: 'var(--brand-ink)' }}>
              图表模块建设中
            </p>
            <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
              集成 TradingView 或自定义图表后，将在此展示策略运行轨迹。
            </p>
          </div>
        </div>
      </div>
    </Panel>
  );
};

export default ChartPanel;