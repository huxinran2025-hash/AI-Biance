import React, { useEffect, useMemo, useRef } from 'react';
import { DashboardController } from '../../hooks/useDashboard';
import ModelChatsPanel from './panels/ModelChatsPanel';
import AuditLogsPanel from './panels/AuditLogsPanel';

type TabKey = 'chats' | 'logs';

interface RightColumnTabsProps {
  controller: DashboardController;
  onOpenMarket?: () => void;
}

const TAB_LABELS: Record<TabKey, string> = {
  chats: '模型行为',
  logs: '日志',
};

export const RightColumnTabs: React.FC<RightColumnTabsProps> = ({ controller, onOpenMarket }) => {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const scrollPositions = useRef<Record<TabKey, number>>({ chats: 0, logs: 0 });

  const { dashboard, tradeEnabled, rightTab, setRightTab } = controller;
  const lastTabRef = useRef<TabKey>(rightTab);
  const systemStatus = dashboard?.systemStatus;

  const actionHint = useMemo(() => {
    if (!tradeEnabled) {
      return '快照模式：仅查看，不执行下单。';
    }
    if (systemStatus?.mode === 'REDUCE_ONLY') {
      return '风控提示：仅允许减仓操作。';
    }
    if (systemStatus?.mode === 'EMERGENCY_LANDING') {
      return '紧急状态：禁止所有自动建仓。';
    }
    return '系统正常运行，可根据风控限制执行自动调仓。';
  }, [tradeEnabled, systemStatus]);

  const handleTabChange = (tab: TabKey) => {
    const container = scrollRef.current;
    if (container) {
      scrollPositions.current[rightTab] = container.scrollTop;
    }
    setRightTab(tab);
  };

  useEffect(() => {
    if (lastTabRef.current === rightTab) {
      return;
    }
    const container = scrollRef.current;
    if (container) {
      container.scrollTop = scrollPositions.current[rightTab] ?? 0;
    }
    lastTabRef.current = rightTab;
  }, [rightTab]);

  const renderContent = () => {
    switch (rightTab) {
      case 'chats':
        return <ModelChatsPanel logs={dashboard?.logs} />;
      case 'logs':
        return <AuditLogsPanel logs={dashboard?.logs} />;
      default:
        return null;
    }
  };

  return (
    <div className="card" style={{ height: '100%', maxHeight: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header
        style={{
          display: 'flex',
          padding: 12,
          borderBottom: '1px solid var(--border)',
          position: 'sticky',
          top: 0,
          background: 'var(--card)',
          zIndex: 1,
          alignItems: 'center',
          flexShrink: 0,
        }}
      >
        {onOpenMarket ? (
          <button
            type="button"
            className="btn mobile-market-button"
            onClick={onOpenMarket}
            style={{ padding: '6px 12px', fontSize: 12, marginRight: 'auto' }}
          >
            市场
          </button>
        ) : (
          <div style={{ marginRight: 'auto' }} />
        )}
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flex: 1 }}>
          {(Object.keys(TAB_LABELS) as TabKey[]).map((tab) => (
            <button
              key={tab}
              type="button"
              className={`tab ${rightTab === tab ? 'tab--active' : ''}`}
              onClick={() => handleTabChange(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--ink-muted)' }}>{actionHint}</div>
      </header>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: 12, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        {renderContent()}
      </div>
    </div>
  );
};

export default RightColumnTabs;

