import React from 'react';
import ChartPanel from './ChartPanel';
import MarketAndLogsPanel from './MarketAndLogsPanel';

const PanelsRowMain: React.FC = () => {
    return (
        <div className="grid grid-cols-12 gap-4 h-[60%]">
            <div className="col-span-12 lg:col-span-8 h-full">
                <ChartPanel />
            </div>
            <div className="col-span-12 lg:col-span-4 h-full">
                <MarketAndLogsPanel />
            </div>
        </div>
    );
};

export default PanelsRowMain;
