import React from 'react';
import { useGlobalStore } from '../../state/useGlobalStore';
import { t } from '../../i18n';
import { RefreshIcon } from '../icons';
import { Panel } from '../ui/Panel';

const mockDepth = (count: number, type: 'bid' | 'ask') =>
  Array.from({ length: count }).map((_, index) => {
    const price = type === 'bid' ? 65123.45 - index * 1.2 : 65124.65 + index * 1.2;
    const size = Math.max(0.05, 1.234 - index * 0.08);
    const cumulative = Math.max(0, 80345 - index * 500);
    return { price, size, cumulative, index };
  });

const OrderBookPanel: React.FC = () => {
  const {
    state: { language },
  } = useGlobalStore();

  const asks = mockDepth(10, 'ask').reverse();
  const bids = mockDepth(10, 'bid');

  const renderRow = (
    row: { price: number; size: number; cumulative: number; index: number },
    type: 'bid' | 'ask',
  ) => {
    const width = Math.min(100, 20 + row.index * 8);
    const barColor = type === 'bid' ? 'rgba(22, 163, 74, 0.12)' : 'rgba(225, 29, 72, 0.12)';
    const textColor = type === 'bid' ? 'var(--success)' : 'var(--danger)';

    return (
      <div
        key={`${type}-${row.index}`}
        style={{
          position: 'relative',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 12px',
          fontFamily: 'Inter, monospace',
          fontSize: 12,
          color: 'var(--ink)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            [type === 'bid' ? 'right' : 'left']: 0,
            width: `${width}%`,
            background: barColor,
            borderRadius: 8,
          } as React.CSSProperties}
        />
        <div style={{ position: 'relative', zIndex: 1, width: '34%', textAlign: 'right', fontWeight: 700, color: textColor }}>
          {row.price.toFixed(2)}
        </div>
        <div style={{ position: 'relative', zIndex: 1, width: '26%', textAlign: 'right', color: 'var(--ink)' }}>
          {row.size.toFixed(3)}
        </div>
        <div style={{ position: 'relative', zIndex: 1, width: '30%', textAlign: 'right', fontSize: 11, color: 'var(--ink-muted)' }}>
          {row.cumulative.toLocaleString()}
        </div>
      </div>
    );
  };

  return (
    <Panel
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-muted)' }}>
          <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.2em' }}>盘口</span>
          <span className="h2" style={{ fontSize: 18, color: 'var(--ink)' }}>
            盘口深度
          </span>
        </div>
      }
      actions={
        <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>
          <RefreshIcon style={{ width: 14, height: 14 }} />
          刷新
        </button>
      }
      style={{ minHeight: 360 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--ink-muted)' }}>
        <span style={{ width: '34%', textAlign: 'right' }}>{t('price', language)} (USD)</span>
        <span style={{ width: '26%', textAlign: 'right' }}>{t('size', language)} (BTC)</span>
        <span style={{ width: '30%', textAlign: 'right' }}>累积</span>
      </div>

      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--card)', overflow: 'hidden' }}>
          <div style={{ borderBottom: '1px solid var(--border)', padding: '10px 16px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--danger)' }}>
            卖盘
          </div>
          <div style={{ maxHeight: 150, overflow: 'hidden' }}>
            {asks.map((row) => renderRow(row, 'ask'))}
          </div>
        </div>

        <div style={{ borderRadius: 16, border: '1px solid var(--border)', background: 'var(--card)', overflow: 'hidden' }}>
          <div style={{ borderBottom: '1px solid var(--border)', padding: '10px 16px', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', color: 'var(--success)' }}>
            买盘
          </div>
          <div style={{ maxHeight: 150, overflow: 'hidden' }}>
            {bids.map((row) => renderRow(row, 'bid'))}
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 16,
          borderRadius: 16,
          border: '1px solid var(--border)',
          background: 'var(--elev)',
          padding: '12px 16px',
          textAlign: 'center',
          fontSize: 16,
          fontWeight: 700,
          color: 'var(--success)',
        }}
      >
        65124.05
        <span style={{ marginLeft: 8, fontSize: 12, fontWeight: 500, color: 'var(--ink-muted)' }}>最新成交价</span>
      </div>
    </Panel>
  );
};

export default OrderBookPanel;
