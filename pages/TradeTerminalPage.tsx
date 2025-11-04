import React from 'react';
import { useDashboard } from '../hooks/useDashboard';
import TradeTerminalLayout from '../components/DashboardScreen';

const TradeTerminalPage: React.FC = () => {
    const controller = useDashboard();
    return <TradeTerminalLayout controller={controller} />;
};

export default TradeTerminalPage;
