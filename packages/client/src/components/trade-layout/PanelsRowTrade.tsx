import React from 'react';
import OrderBookPanel from './OrderBookPanel';
import PositionAndOrderPanel from './PositionAndOrderPanel';
import RiskOverviewPanel from './RiskOverviewPanel';

const PanelsRowTrade: React.FC = () => {
    return (
        <div className="grid grid-cols-12 gap-4 flex-grow min-h-[200px]">
            <div className="col-span-12 lg:col-span-3 h-full">
                <OrderBookPanel />
            </div>
            <div className="col-span-12 lg:col-span-6 h-full">
                <PositionAndOrderPanel />
            </div>
            <div className="col-span-12 lg:col-span-3 h-full">
                <RiskOverviewPanel />
            </div>
        </div>
    );
};

export default PanelsRowTrade;
