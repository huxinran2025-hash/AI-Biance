import React from 'react';
import { DashboardController } from '../../hooks/useDashboard';
import MarketSnapshotTable from './MarketSnapshotTable';
import PortfolioPanel from './panels/PortfolioPanel';
import OrdersPanel from './panels/OrdersPanel';

interface MarketWorkbenchProps {
  controller: DashboardController;
  onSelectSymbol?: (symbol: string) => void;
}

export const MarketWorkbench: React.FC<MarketWorkbenchProps> = ({ controller, onSelectSymbol }) => {
  const handleSymbolSelect = (symbol: string) => {
    onSelectSymbol?.(symbol);
  };

  const { dashboard, tradeEnabled, activeSymbol } = controller;
  const systemStatus = dashboard?.systemStatus;

  return (
    <div className="card" style={{ padding: 0, display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 左右分栏布局 */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'row',
          gap: 0,
        }}
      >
        {/* 左侧栏：货币行情表格 */}
        <div
          style={{
            flex: '0 0 60%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
            padding: '16px',
          }}
        >
          <MarketSnapshotTable controller={controller} onSelect={handleSymbolSelect} />
        </div>

        {/* 分隔线 */}
        <div style={{ width: '1px', background: 'var(--border)', flexShrink: 0 }} />

        {/* 右侧栏：持仓和订单 */}
        <div
          style={{
            flex: '0 0 40%',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'row',
            gap: 0,
          }}
        >
          {/* 持仓面板 */}
          <div
            style={{
              flex: '0 0 50%',
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: '12px',
              overflowY: 'auto',
              borderRight: '1px solid var(--border)',
            }}
          >
            <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>持仓</div>
            <PortfolioPanel
              positions={dashboard?.account.openPositions}
              activeSymbol={activeSymbol}
              tradeEnabled={tradeEnabled}
              systemStatus={systemStatus}
            />
          </div>

          {/* 订单面板 */}
          <div
            style={{
              flex: '0 0 50%',
              minHeight: 0,
              minWidth: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: '12px',
              overflowY: 'auto',
              overflowX: 'hidden',
            }}
          >
            <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>订单</div>
            <OrdersPanel logs={dashboard?.logs} activeSymbol={activeSymbol} />
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketWorkbench;

