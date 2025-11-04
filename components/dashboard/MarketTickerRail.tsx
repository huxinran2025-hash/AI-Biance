import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardController } from '../../hooks/useDashboard';
import { VirtualList } from './VirtualList';
import { SYMBOL_WHITELIST } from '../../constants';
import { getSymbolPopularity } from '../../config/symbols';
import { fmtNumber } from '../../utils/dashboard/format';

const FAVORITES_STORAGE_KEY = 'biance:ticker:favorites';
const ROW_HEIGHT = 44;

interface MarketTickerRailProps {
  controller: DashboardController;
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

export const MarketTickerRail: React.FC<MarketTickerRailProps> = ({ controller }) => {
  const { market, setActiveSymbol, activeSymbol } = controller;
  const [search, setSearch] = useState('');
  const [showWhitelistOnly, setShowWhitelistOnly] = useState(true);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

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
      console.warn('[MarketTickerRail] Failed to read favorites from storage', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favorites)));
    } catch (error) {
      console.warn('[MarketTickerRail] Failed to persist favorites', error);
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

    // 当启用"仅白名单"过滤时，为白名单中缺失的交易对创建占位符
    if (showWhitelistOnly) {
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
    }

    return marketRows;
  }, [market, favorites, showWhitelistOnly]);

  const filteredRows = useMemo(() => {
    const query = search.trim().toUpperCase();
    return rows
      .filter((row) => {
        if (showWhitelistOnly && !whitelistSet.has(row.symbol)) {
          return false;
        }
        if (showFavoritesOnly && !row.isFavorite) {
          return false;
        }
        if (query && !row.symbol.includes(query)) {
          return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isFavorite !== b.isFavorite) {
          return a.isFavorite ? -1 : 1;
        }
        if (a.popularity !== b.popularity) {
          return a.popularity - b.popularity;
        }
        return b.quoteVolume - a.quoteVolume;
      });
  }, [rows, search, showWhitelistOnly, showFavoritesOnly, whitelistSet]);

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

  const renderRow = useCallback(
    (row: MarketRow) => {
      const isActive = activeSymbol?.toUpperCase() === row.symbol;
      const changeColor = row.changePct > 0 ? 'var(--success)' : row.changePct < 0 ? 'var(--danger)' : 'var(--ink-muted)';
      const rowBg = isActive ? 'var(--brand-soft)' : 'transparent';

      return (
        <div
          key={row.symbol}
          onClick={() => setActiveSymbol(row.symbol)}
          style={{
            display: 'grid',
            gridTemplateColumns: '120px 120px 100px 1fr 40px',
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
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }}>
            <span style={{ color: 'var(--ink-muted)', fontFamily: 'Inter, monospace' }}>{formatVolume(row.quoteVolume)}</span>
            <div
              style={{
                width: 64,
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
    [activeSymbol, setActiveSymbol, toggleFavorite],
  );

  return (
    <div className="card" style={{ padding: 16, height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="h2" style={{ fontSize: 18 }}>行情快照</div>
        <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>共 {filteredRows.length} 个标的</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 12, fontSize: 12, color: 'var(--ink-muted)' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={showWhitelistOnly}
              onChange={(event) => setShowWhitelistOnly(event.target.checked)}
            />
            仅白名单
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox"
              checked={showFavoritesOnly}
              onChange={(event) => setShowFavoritesOnly(event.target.checked)}
            />
            仅收藏
          </label>
        </div>
      </header>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索交易对，例如 BTC"
          style={{
            flex: 1,
            padding: '8px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--card)',
            fontSize: 13,
          }}
        />
        {search ? (
          <button
            type="button"
            className="btn"
            style={{ padding: '8px 12px', fontSize: 12 }}
            onClick={() => setSearch('')}
          >
            清除
          </button>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <VirtualList
          rows={filteredRows}
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
  );
};

export default MarketTickerRail;

