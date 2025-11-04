import React from 'react';
import HeaderBar from './trade-layout/HeaderBar';
import RiskTickerBar from './trade-layout/RiskTickerBar';
import RightDrawer from './drawers/RightDrawer';
import AccountOverviewHeader from './dashboard/AccountOverviewHeader';
import FourGrid from './dashboard/FourGrid';
import { useGlobalStore } from '../state/useGlobalStore';
import type { DashboardController } from '../hooks/useDashboard';

interface DashboardScreenProps {
  controller: DashboardController;
}

const DashboardScreen: React.FC<DashboardScreenProps> = ({ controller }) => {
  const {
    state: { drawerState },
    actions,
  } = useGlobalStore();

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
      <HeaderBar />
      <AccountOverviewHeader controller={controller} />
      <RiskTickerBar />
      <main style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <FourGrid controller={controller} />
        </div>
      </main>
      {controller.isInitializing ? (
        <div className="dashboard-loading-overlay">
          <div className="card" style={{ padding: 24, textAlign: 'center', color: 'var(--ink)' }}>
            正在加载账户快照，行情数据较多请稍候…
          </div>
        </div>
      ) : null}
      <RightDrawer
        drawer={drawerState}
        language={controller.language}
        dashboard={controller.dashboard ?? null}
        onClose={actions.closeDrawer}
      />
    </div>
  );
};

export default DashboardScreen;
