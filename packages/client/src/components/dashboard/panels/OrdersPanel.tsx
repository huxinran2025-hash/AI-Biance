import React, { useMemo, useState } from 'react';
import { LogEntry, TradeLogEntry } from '@biance/shared';

interface OrdersPanelProps {
  logs: LogEntry[] | undefined;
  activeSymbol?: string | null;
}

type FilterKey = 'all' | 'filled' | 'failed';

const formatTime = (ts: number) => new Date(ts).toLocaleString();

export const OrdersPanel: React.FC<OrdersPanelProps> = ({ logs, activeSymbol }) => {
  const [filter, setFilter] = useState<FilterKey>('all');

  const entries = useMemo(() => {
    if (!logs?.length) return [];
    return logs
      .filter((log): log is TradeLogEntry => log.type === 'TRADE')
      .sort((a, b) => b.timestamp - a.timestamp);
  }, [logs]);

  const filtered = useMemo(() => {
    let list = entries;
    if (filter !== 'all') {
      list = list.filter((entry) => {
        const status = entry.details?.reasoning ?? '';
        if (filter === 'filled') {
          return /filled|executed|success/i.test(status);
        }
        return /fail|reject|error/i.test(status);
      });
    }
    if (activeSymbol) {
      const normalized = activeSymbol.toUpperCase();
      list = list.filter((entry) => entry.details?.symbol?.toUpperCase() === normalized);
    }
    return list;
  }, [entries, filter, activeSymbol]);

  if (!entries.length) {
    return (
      <div style={{ 
        padding: 16, 
        color: 'var(--ink-muted)', 
        fontSize: 13, 
        lineHeight: 1.8,
        display: 'flex',
        flexDirection: 'column',
        gap: 4
      }}>
        <div>暂无订单记录。</div>
        <div>模型产生信号或手动下单后，</div>
        <div>这里会显示执行详情。</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, minWidth: 0, width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-muted)' }}>
        <span>共 {entries.length} 条订单记录</span>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: 4, borderRadius: 12, border: '1px solid var(--border)' }}>
          {(
            [
              { key: 'all', label: '全部' },
              { key: 'filled', label: '已成交' },
              { key: 'failed', label: '失败/拒绝' },
            ] as { key: FilterKey; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`tab ${filter === key ? 'tab--active' : ''}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filtered.map((entry) => (
          <article
            key={`${entry.timestamp}-${entry.message}`}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              padding: '12px 16px',
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--card)',
            }}
          >
            <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{entry.message}</span>
              <span style={{ color: 'var(--ink-muted)' }}>{formatTime(entry.timestamp)}</span>
            </header>
            {entry.details ? (
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {entry.details.symbol ? `标的 ${entry.details.symbol} · ` : ''}
                {entry.details.action ? `动作 ${entry.details.action}` : ''}
                {entry.details.reasoning ? ` · ${entry.details.reasoning}` : ''}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
};

export default OrdersPanel;

