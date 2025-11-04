import React, { useMemo, useState } from 'react';
import { useGlobalStore } from '../../state/useGlobalStore';
import { t } from '../../i18n';
import { Position } from '../../types';
import { Panel } from '../ui/Panel';

const PositionAndOrderPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'positions' | 'orders'>('positions');
  const { state } = useGlobalStore();
  const { dashboard, language } = state;

  const positions = dashboard?.account.openPositions || [];
  const activeOrders: Array<Record<string, any>> = []; // TODO: 接入真实挂单数据

  const positionRows = useMemo(() => positions, [positions]);

  const renderEmpty = (title: string, message: string) => (
    <div
      style={{
        minHeight: 220,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        textAlign: 'center',
        color: 'var(--ink-muted)',
      }}
    >
      <p className="h2" style={{ fontSize: 16 }}>
        {title}
      </p>
      <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 360 }}>{message}</p>
      <button type="button" className="btn">
        手动下单
      </button>
    </div>
  );

  const renderPositions = () => (
    <section className="card" style={{ maxHeight: 260, overflowY: 'auto', borderRadius: 16 }}>
      {positionRows.length > 0 ? (
        <table style={{ width: '100%', textAlign: 'left', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--elev)', color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontSize: 12 }}>
            <tr>
              <th style={{ padding: '12px 16px' }}>{t('symbol', language)}</th>
              <th style={{ padding: '12px 16px' }}>{t('side', language)}</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>{t('notional', language)}</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>{t('leverage', language)}</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>{t('unrealizedPnl', language)}</th>
            </tr>
          </thead>
          <tbody>
            {positionRows.map((pos: Position, index) => {
              const pnlColor = pos.unrealizedPnl >= 0 ? 'var(--success)' : 'var(--danger)';
              return (
                <tr
                  key={pos.symbol}
                  style={{
                    background: index % 2 === 0 ? 'var(--card)' : 'var(--elev)',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.backgroundColor = 'var(--brand-soft)';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.backgroundColor = index % 2 === 0 ? 'var(--card)' : 'var(--elev)';
                  }}
                >
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: 'var(--ink)' }}>{pos.symbol}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 700, color: pos.side === 'LONG' ? 'var(--success)' : 'var(--danger)' }}>
                    {t(pos.side.toLowerCase() as 'long' | 'short', language)}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'Inter, monospace', color: 'var(--ink)' }}>
                    ${pos.notionalUsd.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'Inter, monospace', color: 'var(--ink-muted)' }}>
                    {pos.leverage.toFixed(1)}x
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'Inter, monospace', fontWeight: 700, color: pnlColor }}>
                    {pos.unrealizedPnl.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        renderEmpty('暂无持仓', '启动策略或手动下单后，这里会显示持仓详情与盈亏分布。')
      )}
    </section>
  );

  const renderOrders = () => (
    <section className="card" style={{ maxHeight: 220, overflowY: 'auto', padding: 20, borderRadius: 16 }}>
      {activeOrders.length > 0 ? (
        <ul style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--ink)' }}>
          {activeOrders.map((order, index) => (
            <li
              key={`${order.idHash}-${index}`}
              style={{
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                padding: '12px 16px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--ink)' }}>
                <span style={{ fontWeight: 600 }}>{order.source}</span>
                <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>{new Date(order.publishedAt).toLocaleTimeString()}</span>
              </div>
              <p style={{ marginTop: 6, fontSize: 13, color: 'var(--ink)' }}>{order.summary}</p>
            </li>
          ))}
        </ul>
      ) : (
        renderEmpty('暂无挂单', '暂未检测到系统挂单，可在策略配置中设置条件触发。')
      )}
    </section>
  );

  return (
    <Panel
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-muted)' }}>
          <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.2em' }}>持仓</span>
          <span className="h2" style={{ fontSize: 18, color: 'var(--ink)' }}>
            持仓 / 订单
          </span>
        </div>
      }
      actions={
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: 4,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--card)',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('positions')}
            className={`tab ${activeTab === 'positions' ? 'tab--active' : ''}`}
          >
            持仓 ({positions.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`tab ${activeTab === 'orders' ? 'tab--active' : ''}`}
          >
            挂单 ({activeOrders.length})
          </button>
        </div>
      }
      style={{ minHeight: 360 }}
    >
      {activeTab === 'positions' ? renderPositions() : renderOrders()}
    </Panel>
  );
};

export default PositionAndOrderPanel;
