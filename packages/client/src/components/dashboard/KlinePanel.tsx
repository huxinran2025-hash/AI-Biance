import React, { useEffect, useRef, useState } from 'react';
import { createChart, ISeriesApi, IChartApi, ColorType, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { fetchKlines, type KlineData } from '../../services/binance';

const TF_MAP: Record<string, string> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '1h': '1h',
  '4h': '4h',
  '1d': '1d',
  '1M': '1M',
};

type Timeframe = keyof typeof TF_MAP;

interface KlinePanelProps {
  symbol: string;
  initialTimeframe?: Timeframe;
  onTimeframeChange?: (tf: Timeframe) => void;
}

export const KlinePanel: React.FC<KlinePanelProps> = ({ 
  symbol, 
  initialTimeframe = '1h',
  onTimeframeChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>(initialTimeframe);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 初始化图表
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#5b5b5b',
      },
      rightPriceScale: {
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { visible: false },
      },
      autoSize: true,
    });

    const candles = chart.addSeries(CandlestickSeries, {
      upColor: '#4caf50',
      downColor: '#f23645',
      borderVisible: false,
      wickUpColor: '#4caf50',
      wickDownColor: '#f23645',
    });

    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
      color: '#26a69a',
    });

    candleSeriesRef.current = candles;
    volumeSeriesRef.current = volume;
    chartRef.current = chart;

    // 隐藏可能的 TradingView logo/链接
    const hideLogo = () => {
      if (!containerRef.current) return;
      // 查找可能的 logo 或链接元素（在图表容器内）
      const container = containerRef.current;
      // 查找所有链接元素
      const links = container.querySelectorAll('a[href*="tradingview"], a[href*="TradingView"]');
      links.forEach((link) => {
        (link as HTMLElement).style.display = 'none';
      });
      // 查找可能的 logo 图片
      const images = container.querySelectorAll('img[src*="tradingview"], img[src*="TradingView"], img[alt*="TradingView"], img[alt*="tradingview"]');
      images.forEach((img) => {
        (img as HTMLElement).style.display = 'none';
      });
      // 查找可能的品牌标识元素
      const brandElements = container.querySelectorAll('[class*="tradingview"], [class*="TradingView"], [class*="brand"], [id*="tradingview"], [id*="TradingView"]');
      brandElements.forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
      // 查找包含 "TV" 或类似文本的元素（可能是 TradingView 的缩写）
      const allElements = container.querySelectorAll('*');
      allElements.forEach((el) => {
        const text = el.textContent?.toLowerCase() || '';
        const href = (el as HTMLElement).getAttribute('href') || '';
        if ((text.includes('tradingview') || href.includes('tradingview')) && el.tagName === 'A') {
          (el as HTMLElement).style.display = 'none';
        }
      });
    };

    // 立即执行一次
    hideLogo();

    // 使用 MutationObserver 监听 DOM 变化，持续隐藏可能的 logo
    const observer = new MutationObserver(() => {
      hideLogo();
    });

    observer.observe(containerRef.current, {
      childList: true,
      subtree: true,
    });

    // 响应式调整
    const resizeObserver = new ResizeObserver(() => {
      chart.timeScale().fitContent();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      observer.disconnect();
      resizeObserver.disconnect();
      chart.remove();
    };
  }, []);

  // 加载K线数据
  useEffect(() => {
    const abortController = new AbortController();
    setIsLoading(true);
    setError(null);

    (async () => {
      try {
        const data = await fetchKlines(symbol, TF_MAP[timeframe], 200, abortController.signal);
        
        if (abortController.signal.aborted) return;

        const formattedData = data.map((d) => ({
          time: d.time as number,
          open: d.open,
          high: d.high,
          low: d.low,
          close: d.close,
        }));

        const volumeData = data.map((d) => ({
          time: d.time as number,
          value: d.volume,
          color: d.close >= d.open ? 'rgba(76, 175, 80, 0.3)' : 'rgba(242, 54, 69, 0.3)',
        }));

        candleSeriesRef.current?.setData(formattedData);
        volumeSeriesRef.current?.setData(volumeData);

        chartRef.current?.timeScale().fitContent();
      } catch (err) {
        if (abortController.signal.aborted) return;
        console.error('[KlinePanel] Failed to load kline data', err);
        setError(`加载失败: ${(err as Error).message}`);
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    })();

    return () => {
      abortController.abort('symbol or timeframe changed');
    };
  }, [symbol, timeframe]);

  const handleTimeframeChange = (tf: Timeframe) => {
    setTimeframe(tf);
    onTimeframeChange?.(tf);
  };

  // 鼠标滚轮自适应切换时间周期
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const currentIndex = timeframes.indexOf(timeframe);
    if (e.deltaY < 0 && currentIndex < timeframes.length - 1) {
      // 向上滚动 = 放大 = 更长时间周期
      handleTimeframeChange(timeframes[currentIndex + 1]);
    } else if (e.deltaY > 0 && currentIndex > 0) {
      // 向下滚动 = 缩小 = 更短时间周期
      handleTimeframeChange(timeframes[currentIndex - 1]);
    }
  };

  const timeframes: Timeframe[] = ['1m', '5m', '15m', '1h', '4h', '1d', '1M'];

  // 在整个组件内查找并隐藏可能的 TradingView logo（在组件渲染后执行）
  useEffect(() => {
    const hideLogoInPanel = () => {
      if (!panelRef.current) return;
      // 查找所有可能的 TradingView logo/链接元素
      const links = panelRef.current.querySelectorAll('a[href*="tradingview"], a[href*="TradingView"]');
      links.forEach((link) => {
        (link as HTMLElement).style.display = 'none';
      });
      // 查找可能的 logo 图片
      const images = panelRef.current.querySelectorAll('img[src*="tradingview"], img[src*="TradingView"], img[alt*="TradingView"], img[alt*="tradingview"]');
      images.forEach((img) => {
        (img as HTMLElement).style.display = 'none';
      });
      // 查找可能的品牌标识元素
      const brandElements = panelRef.current.querySelectorAll('[class*="tradingview"], [class*="TradingView"], [class*="brand"], [id*="tradingview"], [id*="TradingView"]');
      brandElements.forEach((el) => {
        (el as HTMLElement).style.display = 'none';
      });
      // 查找包含 TradingView 链接的文本元素
      const allLinks = panelRef.current.querySelectorAll('a');
      allLinks.forEach((link) => {
        const href = link.getAttribute('href') || '';
        const text = link.textContent?.toLowerCase() || '';
        if (href.includes('tradingview') || text.includes('tradingview')) {
          (link as HTMLElement).style.display = 'none';
        }
      });
    };

    // 立即执行一次
    hideLogoInPanel();

    // 使用 MutationObserver 监听 DOM 变化，持续隐藏可能的 logo
    if (panelRef.current) {
      const observer = new MutationObserver(() => {
        hideLogoInPanel();
      });

      observer.observe(panelRef.current, {
        childList: true,
        subtree: true,
      });

      return () => {
        observer.disconnect();
      };
    }
  }, []);

  return (
    <div ref={panelRef} style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--card)', borderRadius: 16, overflow: 'hidden' }}>
      {/* 控制栏 */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '12px 16px', 
        borderBottom: '1px solid var(--border)' 
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>
          {symbol}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {timeframes.map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => handleTimeframeChange(tf)}
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                border: '1px solid transparent',
                background: timeframe === tf ? 'var(--brand)' : 'transparent',
                color: timeframe === tf ? '#fff' : 'var(--ink-muted)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              {tf}
            </button>
          ))}
        </div>
      </div>

              {/* 图表容器 */}
        <div ref={containerRef} onWheel={handleWheel} style={{ flex: 1, minHeight: 500, height: '100%', position: 'relative', overflow: 'hidden' }}>
        {isLoading && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.8)',
            zIndex: 10,
          }}>
            <span style={{ fontSize: 13, color: 'var(--ink-muted)' }}>加载中…</span>
          </div>
        )}
        {error && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255, 255, 255, 0.95)',
            zIndex: 10,
          }}>
            <span style={{ fontSize: 13, color: 'var(--danger)' }}>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default KlinePanel;

