import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { DashboardController } from '../../hooks/useDashboard';
import { VirtualList } from './VirtualList';
import { SYMBOL_WHITELIST } from '@biance/shared';
import { getSymbolPopularity } from '../../config/symbols';
import { fmtNumber } from '../../utils/dashboard/format';

const FAVORITES_STORAGE_KEY = 'biance:ticker:favorites';
const ROW_HEIGHT = 44;

interface MarketSnapshotTableProps {
  controller: DashboardController;
  onSelect?: (symbol: string) => void;
}

interface MarketRow {
  symbol: string;
  price: number;
  changePct: number;
  quoteVolume: number;
  popularity: number;
  isFavorite: boolean;
}

const formatPercent = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  const fixed = value.toFixed(2);
  return `${value >= 0 ? '+' : ''}${fixed}%`;
};

const formatVolume = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return new Intl.NumberFormat('zh-CN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
};

export const MarketSnapshotTable: React.FC<MarketSnapshotTableProps> = ({ controller, onSelect }) => {
  const { market, activeSymbol, setActiveSymbol } = controller;
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [maxBarWidth, setMaxBarWidth] = useState(100);
  const marketCapColRef = useRef<HTMLDivElement>(null);

  // 从 localStorage 读取收藏状态
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(FAVORITES_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setFavorites(new Set(parsed.map((symbol: string) => symbol.toUpperCase())));
        }
      }
    } catch (error) {
      console.warn('[MarketSnapshotTable] Failed to read favorites from storage', error);
    }
  }, []);

  // 持久化收藏状态
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favorites)));
    } catch (error) {
      console.warn('[MarketSnapshotTable] Failed to persist favorites', error);
    }
  }, [favorites]);

  const whitelistSet = useMemo(() => new Set(SYMBOL_WHITELIST.map((symbol) => symbol.toUpperCase())), []);

  const rows = useMemo((): MarketRow[] => {
    const favoriteSet = favorites;
    const marketRows: MarketRow[] = [];
    const symbolSet = new Set<string>();

    // 先处理有 market 数据的交易对
    if (market) {
      Object.entries(market).forEach(([symbol, ticker]) => {
        const normalized = symbol.toUpperCase();
        const bid = Number(ticker?.bestBid ?? 0);
        const ask = Number(ticker?.bestAsk ?? 0);
        const midFallback = bid && ask ? (bid + ask) / 2 : 0;
        const lastPriceFallback = Number(ticker?.lastPrice ?? 0);
        const fallbackPrice = midFallback || lastPriceFallback || 0;
        const priceSource = ticker?.price ?? fallbackPrice;
        const price = Number(priceSource);
        const changePct = Number(ticker?.priceChange24h ?? ticker?.priceChangePercent ?? 0);
        const quoteVolume = Number(ticker?.quoteVolume24h ?? ticker?.quoteVolume ?? ticker?.volume24h ?? 0);

        if (Number.isFinite(price) && price > 0) {
          marketRows.push({
            symbol: normalized,
            price,
            changePct,
            quoteVolume,
            popularity: getSymbolPopularity(normalized),
            isFavorite: favoriteSet.has(normalized),
          });
          symbolSet.add(normalized);
        }
      });
    }

    // 为白名单中缺失的交易对创建占位符
    SYMBOL_WHITELIST.forEach((symbol) => {
      const normalized = symbol.toUpperCase();
      if (!symbolSet.has(normalized)) {
        marketRows.push({
          symbol: normalized,
          price: 0, // 占位符：价格为0表示暂无数据
          changePct: 0,
          quoteVolume: 0,
          popularity: getSymbolPopularity(normalized),
          isFavorite: favoriteSet.has(normalized),
        });
      }
    });

    return marketRows;
  }, [market, favorites]);

  // 按收藏、热门度、成交额排序
  const sortedRows = useMemo(() => {
    return [...rows].sort((a, b) => {
      if (a.isFavorite !== b.isFavorite) {
        return a.isFavorite ? -1 : 1;
      }
      if (a.popularity !== b.popularity) {
        return a.popularity - b.popularity;
      }
      return b.quoteVolume - a.quoteVolume;
    });
  }, [rows]);

  // 计算市值列的可用宽度，用于线条宽度计算
  useLayoutEffect(() => {
    const updateMaxBarWidth = () => {
      if (marketCapColRef.current) {
        const width = marketCapColRef.current.offsetWidth;
        // 估算：文字宽度(约60-80px) + gap(8px) + 一些边距
        // 保守估计，保留更多空间给线条
        const availableWidth = width - 100;
        setMaxBarWidth(Math.max(availableWidth, 80));
      }
    };

    updateMaxBarWidth();

    // 使用 ResizeObserver 监听容器宽度变化
    if (marketCapColRef.current && typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(updateMaxBarWidth);
      resizeObserver.observe(marketCapColRef.current);
      return () => resizeObserver.disconnect();
    }

    // 降级方案：监听窗口大小变化
    window.addEventListener('resize', updateMaxBarWidth);
    return () => window.removeEventListener('resize', updateMaxBarWidth);
  }, [sortedRows.length]); // 当数据变化时重新计算

  const toggleFavorite = useCallback((symbol: string) => {
    const normalized = symbol.toUpperCase();
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return next;
    });
  }, []);

  const handleRowClick = useCallback(
    (symbol: string) => {
      setActiveSymbol(symbol);
      onSelect?.(symbol);
    },
    [setActiveSymbol, onSelect]
  );

  const renderRow = useCallback(
    (row: MarketRow) => {
      const isActive = activeSymbol?.toUpperCase() === row.symbol;
      const changeColor = row.changePct > 0 ? 'var(--success)' : row.changePct < 0 ? 'var(--danger)' : 'var(--ink-muted)';
      const rowBg = isActive ? 'var(--brand-soft)' : 'transparent';

      // 计算成交额进度（相对最大成交额）
      const maxVolume = sortedRows[0]?.quoteVolume || 1;
      const volumeProgress = maxVolume > 0 ? (row.quoteVolume / maxVolume) * 100 : 0;
      // 计算动态线条宽度：基于进度百分比和市值列可用宽度，最小8px
      const barWidth = Math.max((volumeProgress / 100) * maxBarWidth, 8);

      return (
        <div
          key={row.symbol}
          onClick={() => handleRowClick(row.symbol)}
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 140px 110px 1fr 40px',
            alignItems: 'center',
            padding: '0 12px',
            height: ROW_HEIGHT,
            cursor: 'pointer',
            background: rowBg,
            borderBottom: '1px solid var(--border)',
            fontSize: 13,
            transition: 'background 0.2s ease',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <span>{row.symbol}</span>
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'Inter, monospace' }}>
            {row.price > 0 ? fmtNumber(row.price, { maximumFractionDigits: row.price > 100 ? 2 : 4 }) : '—'}
          </div>
          <div style={{ textAlign: 'right', fontFamily: 'Inter, monospace', fontWeight: 600, color: changeColor }}>
            {row.price > 0 ? formatPercent(row.changePct) : '—'}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
            <span style={{ color: 'var(--ink-muted)', fontFamily: 'Inter, monospace' }}>{formatVolume(row.quoteVolume)}</span>
            <div
              style={{
                width: barWidth,
                height: 18,
                borderRadius: 8,
                background:
                  row.changePct >= 0
                    ? 'linear-gradient(90deg, rgba(76, 220, 148, 0.25), rgba(76, 220, 148, 0.65))'
                    : 'linear-gradient(90deg, rgba(225, 29, 72, 0.25), rgba(225, 29, 72, 0.65))',
              }}
            />
          </div>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              toggleFavorite(row.symbol);
            }}
            aria-label={row.isFavorite ? '取消收藏' : '收藏标的'}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: row.isFavorite ? 'var(--brand)' : 'var(--ink-muted)',
              fontSize: 16,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {row.isFavorite ? '★' : '☆'}
          </button>
        </div>
      );
    },
    [activeSymbol, handleRowClick, toggleFavorite, sortedRows, maxBarWidth]
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px', borderBottom: '1px solid var(--border)' }}>
        <div className="h2" style={{ fontSize: 18 }}>货币行情</div>
        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>共 {sortedRows.length} 个标的</span>
      </header>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* 表头 */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '140px 140px 110px 1fr 40px',
            alignItems: 'center',
            padding: '12px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--elev)',
            fontSize: 12,
            color: 'var(--ink-muted)',
            fontWeight: 600,
          }}
        >
                     <div>交易对</div>
           <div style={{ textAlign: 'right' }}>美金</div>
           <div style={{ textAlign: 'right' }}>涨跌幅</div>
           <div ref={marketCapColRef} style={{ textAlign: 'right' }}>市值/美金</div>
           <div></div>
        </div>
        {/* 数据列表 */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <VirtualList
          rows={sortedRows}
          rowHeight={ROW_HEIGHT}
          overscan={6}
          renderRow={renderRow}
          empty={
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink-muted)', fontSize: 13 }}>
              未找到匹配的交易对
            </div>
          }
        />
        </div>
      </div>
    </div>
  );
};

export default MarketSnapshotTable;

