import React, { useMemo, useState } from 'react';
import { LogEntry, AttributionLogEntry, TradeLogEntry } from '../../../types';

interface ModelChatsPanelProps {
  logs: LogEntry[] | undefined;
}

const formatTime = (ts: number) => new Date(ts).toLocaleString();

export const ModelChatsPanel: React.FC<ModelChatsPanelProps> = ({ logs }) => {
  const [showSummary, setShowSummary] = useState(true);

  const entries = useMemo(() => {
    if (!logs?.length) return [];
    // 限制显示条数，避免无限增长
    return logs
      .filter((log): log is AttributionLogEntry | TradeLogEntry => log.type === 'ATTRIBUTION' || log.type === 'TRADE')
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 150); // 最多显示 150 条
  }, [logs]);

  if (!entries.length) {
    return (
      <div style={{ padding: 16, color: 'var(--ink-muted)', fontSize: 13 }}>
        暂无模型对话。开启自动交易后，这里会显示模型之间的决策理由。
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-muted)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={showSummary}
            onChange={(event) => setShowSummary(event.target.checked)}
          />
          显示要点摘要
        </label>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {entries.map((entry) => (
          <article
            key={`${entry.timestamp}-${entry.type}`}
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
              <span style={{ fontWeight: 600, color: 'var(--brand-ink)' }}>
                {entry.type === 'ATTRIBUTION' ? '策略归因' : '执行记录'}
              </span>
              <span style={{ color: 'var(--ink-muted)' }}>{formatTime(entry.timestamp)}</span>
            </header>
            <div style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--ink)' }}>{entry.message}</div>
            {showSummary && entry.type === 'ATTRIBUTION' ? (
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                决策主导：{entry.details.decisionAuthority}，最终动作：{entry.details.finalAction}
              </div>
            ) : null}
            {showSummary && entry.type === 'TRADE' ? (
              <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                {entry.details?.symbol ? `标的 ${entry.details.symbol}` : ''}
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
};

export default ModelChatsPanel;

