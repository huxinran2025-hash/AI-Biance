import React, { useMemo } from 'react';
import { LogEntry } from '../../../types';

interface AuditLogsPanelProps {
  logs: LogEntry[] | undefined;
}

const typeColor: Record<LogEntry['type'], string> = {
  INFO: 'var(--brand-ink)',
  WARN: 'var(--warning)',
  ERROR: 'var(--danger)',
  STRATEGY: 'var(--brand-ink)',
  TRADE: 'var(--success)',
  SYSTEM_MODE_CHANGE: 'var(--warning)',
  ATTRIBUTION: 'var(--brand-ink)',
};

export const AuditLogsPanel: React.FC<AuditLogsPanelProps> = ({ logs }) => {
  const entries = useMemo(() => {
    if (!logs?.length) return [];
    // 限制显示条数，避免无限增长
    return logs.slice(0, 100).sort((a, b) => b.timestamp - a.timestamp);
  }, [logs]);

  if (!entries.length) {
    return (
      <div style={{ padding: 16, color: 'var(--ink-muted)', fontSize: 13 }}>
        暂无日志。系统在产生风控事件或策略输出时会自动记录。
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      {entries.map((entry) => (
        <div
          key={`${entry.timestamp}-${entry.message}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 80px 1fr',
            gap: 12,
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            fontSize: 12,
            alignItems: 'center',
          }}
        >
          <span style={{ color: 'var(--ink-muted)' }}>{new Date(entry.timestamp).toLocaleTimeString()}</span>
          <span style={{ color: typeColor[entry.type], fontWeight: 600 }}>{entry.type}</span>
          <span style={{ color: 'var(--ink)' }}>{entry.message}</span>
        </div>
      ))}
    </div>
  );
};

export default AuditLogsPanel;

