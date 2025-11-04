import React, { useMemo } from 'react';
import { Position, SystemStatus } from '../../../types';
import { fmtNumber, fmtUsd } from '../../../utils/dashboard/format';

interface PortfolioPanelProps {
  positions: Position[] | undefined;
  activeSymbol: string | null;
  tradeEnabled: boolean;
  systemStatus: SystemStatus | undefined;
  onFlattenAll?: () => void;
  onReduceAll?: () => void;
}

const emptyState = (
  <div
    style={{
      minHeight: 160,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      color: 'var(--ink-muted)',
      fontSize: 13,
      textAlign: 'center',
    }}
  >
    <span className="h2" style={{ fontSize: 16 }}>暂无持仓</span>
    <span>开始交易或手动下单后，这里会展示持仓、盈亏与杠杆状态。</span>
  </div>
);

const allowNewEntries = (status: SystemStatus | undefined): boolean => {
  if (!status) return true;
  return !status.activeRiskClamp?.forbidNewEntries && status.mode === 'NORMAL';
};

const allowFlatten = (status: SystemStatus | undefined): boolean => {
  if (!status) return true;
  if (status.mode === 'EMERGENCY_LANDING') return false;
  return true;
};

export const PortfolioPanel: React.FC<PortfolioPanelProps> = ({
  positions,
  activeSymbol,
  tradeEnabled,
  systemStatus,
  onFlattenAll,
  onReduceAll,
}) => {
  const filtered = useMemo(() => {
    if (!positions?.length) return [];
    const list = positions.sort((a, b) => Math.abs(b.notionalUsd) - Math.abs(a.notionalUsd));
    if (activeSymbol) {
      return list.filter((pos) => pos.symbol.toUpperCase() === activeSymbol.toUpperCase());
    }
    return list;
  }, [positions, activeSymbol]);

  const disableActions = !tradeEnabled || !allowFlatten(systemStatus);
  const disableNewEntries = !tradeEnabled || !allowNewEntries(systemStatus);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-muted)' }}>
        <span>当前持仓 {filtered.length} 笔</span>
        {activeSymbol ? <span style={{ color: 'var(--brand-ink)' }}>已按 {activeSymbol} 过滤</span> : null}
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn"
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={onReduceAll}
            disabled={disableActions}
          >
            一键减仓
          </button>
          <button
            type="button"
            className="btn btn--danger"
            style={{ padding: '6px 12px', fontSize: 12 }}
            onClick={onFlattenAll}
            disabled={disableActions}
          >
            全部平仓
          </button>
        </span>
      </div>

      {!filtered.length ? (
        emptyState
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
          <header
            style={{
              display: 'grid',
              gridTemplateColumns: '120px 80px 120px 80px 100px',
              padding: '8px 12px',
              background: 'var(--elev)',
              fontSize: 12,
              color: 'var(--ink-muted)',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
            }}
          >
            <span>标的</span>
            <span>方向</span>
            <span style={{ textAlign: 'right' }}>名义敞口</span>
            <span style={{ textAlign: 'right' }}>杠杆</span>
            <span style={{ textAlign: 'right' }}>未实现盈亏</span>
          </header>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {filtered.map((pos) => {
              const pnlColor = pos.unrealizedPnl >= 0 ? 'var(--success)' : 'var(--danger)';
              return (
                <div
                  key={`${pos.symbol}-${pos.side}`}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '120px 80px 120px 80px 100px',
                    padding: '10px 12px',
                    fontSize: 13,
                    borderTop: '1px solid var(--border)',
                    background: activeSymbol && pos.symbol.toUpperCase() === activeSymbol.toUpperCase()
                      ? 'var(--brand-soft)'
                      : 'var(--card)',
                    transition: 'background 0.2s ease',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{pos.symbol}</span>
                  <span style={{ fontWeight: 600, color: pos.side === 'LONG' ? 'var(--success)' : 'var(--danger)' }}>
                    {pos.side === 'LONG' ? '做多' : '做空'}
                  </span>
                  <span style={{ textAlign: 'right', fontFamily: 'Inter, monospace' }}>{fmtUsd(pos.notionalUsd)}</span>
                  <span style={{ textAlign: 'right', fontFamily: 'Inter, monospace' }}>{fmtNumber(pos.leverage, { maximumFractionDigits: 1 })}×</span>
                  <span style={{ textAlign: 'right', fontFamily: 'Inter, monospace', fontWeight: 700, color: pnlColor }}>
                    {fmtNumber(pos.unrealizedPnl, { maximumFractionDigits: 2 })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!tradeEnabled ? (
        <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>当前处于快照模式，不会执行自动调仓。</div>
      ) : null}
      {disableNewEntries ? (
        <div style={{ fontSize: 12, color: 'var(--warning)' }}>风控限制：暂不允许新增仓位。</div>
      ) : null}
    </div>
  );
};

export default PortfolioPanel;

