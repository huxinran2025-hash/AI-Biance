import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { DashboardController } from '../../hooks/useDashboard';
import KlinePanel from './KlinePanel';
import MarketWorkbench from './MarketWorkbench';
import { RightColumnTabs } from './RightColumnTabs';

interface FourGridProps {
  controller: DashboardController;
}

export const FourGrid: React.FC<FourGridProps> = ({ controller }) => {
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTCUSDT');
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1M'>('1h');
  const [leftColumnHeight, setLeftColumnHeight] = useState<number | undefined>(undefined);
  const leftColumnRef = useRef<HTMLElement>(null);

  const handleSymbolSelect = (symbol: string) => {
    setSelectedSymbol(symbol);
  };

  // 测量左侧栏高度
  useLayoutEffect(() => {
    const updateHeight = () => {
      if (leftColumnRef.current) {
        const height = leftColumnRef.current.offsetHeight;
        if (height > 0) {
          setLeftColumnHeight(height);
        }
      }
    };

    // 初始测量
    updateHeight();

    // 监听窗口大小变化
    window.addEventListener('resize', updateHeight);

    // 使用 ResizeObserver 监听左侧栏尺寸变化
    const resizeObserver = leftColumnRef.current
      ? new ResizeObserver(updateHeight)
      : null;

    if (resizeObserver && leftColumnRef.current) {
      resizeObserver.observe(leftColumnRef.current);
    }

    return () => {
      window.removeEventListener('resize', updateHeight);
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [selectedSymbol, timeframe]);

  return (
    <>
      <main style={{ display: 'flex', flexDirection: 'row', gap: 16, height: '100%', minHeight: 0 }}>
        {/* 左侧栏：K线图（上）+ 行情工作台（下） */}
        <section ref={leftColumnRef} style={{ flex: '0 0 70%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', minHeight: 0 }}>
            {/* K线图模块 */}
            <div style={{ minHeight: 600, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
              <KlinePanel 
                symbol={selectedSymbol} 
                initialTimeframe={timeframe} 
                onTimeframeChange={setTimeframe} 
              />
            </div>
            {/* 行情工作台模块 */}
            <div style={{ minHeight: 1000, display: 'flex', flexDirection: 'column', flex: 1 }}>
              <MarketWorkbench controller={controller} onSelectSymbol={handleSymbolSelect} />
            </div>
          </div>
        </section>
        {/* 右侧栏 */}
        <section style={{ flex: '0 0 30%', height: leftColumnHeight || 'auto', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <RightColumnTabs controller={controller} />
        </section>
      </main>
    </>
  );
};

export default FourGrid;

