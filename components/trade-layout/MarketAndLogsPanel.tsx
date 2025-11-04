import React, { useMemo, useState } from 'react';
import { useGlobalStore } from '../../state/useGlobalStore';
import { t } from '../../i18n';
import { LogEntry } from '../../types';
import { Panel } from '../ui/Panel';
import { RefreshIcon } from '../icons';
import { SYMBOL_WHITELIST } from '../../constants';

const MarketAndLogsPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'market' | 'logs'>('market');
  const { state } = useGlobalStore();
  const { dashboard, language, config } = state;

  const marketRows = useMemo(() => {
    const pairs = config?.allowedPairs !== undefined ? config.allowedPairs : SYMBOL_WHITELIST;
    return pairs.map((symbol) => {
      const normalizedSymbol = symbol.toUpperCase();
      const ticker = dashboard?.market?.[normalizedSymbol];
      const ready = Boolean(ticker);
      const price = Number(ticker?.price ?? ticker?.lastPrice ?? 0);
      const priceChangePercent = Number(
        ticker?.priceChange24h ?? ticker?.priceChangePercent ?? ticker?.change ?? 0,
      );
      const quoteVolume = Number(
        ticker?.quoteVolume24h ?? ticker?.quoteVolume ?? ticker?.volume24h ?? ticker?.volume ?? 0,
      );
      const trades = Number(ticker?.tradeCount24h ?? ticker?.trades ?? ticker?.count ?? 0);

      return {
        symbol: normalizedSymbol,
        ready,
        price,
        priceChangePercent,
        quoteVolume,
        trades,
      };
    }).sort((a, b) =>
      (b.quoteVolume - a.quoteVolume) ||
      (Math.abs(b.priceChangePercent) - Math.abs(a.priceChangePercent)) ||
      (b.trades - a.trades),
    );
  }, [dashboard?.market, config?.allowedPairs]);

  const renderMarket = () => (
    <section className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 16 }}>
      {marketRows.length > 0 ? (
        <div style={{ maxHeight: 420, overflowY: 'auto' }}>
        <table style={{ width: '100%', fontSize: 14, borderCollapse: 'collapse' }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--elev)', color: 'var(--ink-muted)' }}>
            <tr>
              <th style={{ padding: '12px 16px', textAlign: 'left' }}>交易对</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>价格 / USD</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>24h 成交额 (USDT)</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>涨跌幅</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>成交笔数</th>
            </tr>
          </thead>
          <tbody>
            {marketRows.map((row, index) => {
              const isHot = index < 6;
              const baseBg = isHot ? 'var(--brand-soft)' : index % 2 === 0 ? 'var(--card)' : 'var(--elev)';
              const priceText = row.ready && row.price ? row.price.toFixed(2) : '—';
              const volumeText = row.ready && row.quoteVolume ? row.quoteVolume.toLocaleString() : '—';
              const changeText = row.ready && row.priceChangePercent
                ? `${row.priceChangePercent >= 0 ? '+' : ''}${row.priceChangePercent.toFixed(2)}%`
                : '—';
              const changeColor = row.ready && row.priceChangePercent
                ? row.priceChangePercent >= 0
                  ? 'var(--success)'
                  : 'var(--danger)'
                : 'var(--ink-muted)';
              const tradesText = row.ready && row.trades ? row.trades.toLocaleString() : '—';

              return (
                <tr
                  key={row.symbol}
                  style={{
                    background: baseBg,
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.backgroundColor = 'var(--brand-soft)';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.backgroundColor = baseBg;
                  }}
                >
                  <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--ink)' }}>{row.symbol}</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'Inter, monospace', color: 'var(--ink)' }}>
                    {priceText}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'Inter, monospace', color: 'var(--ink)' }}>
                    {volumeText}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'Inter, monospace', fontWeight: 600, color: changeColor }}>
                    {changeText}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'Inter, monospace', color: 'var(--ink)' }}>
                    {tradesText}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      ) : (
        <div
          style={{
            minHeight: 200,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--ink-muted)',
            padding: 24,
          }}
        >
          <p className="h2" style={{ fontSize: 16 }}>暂无市场数据</p>
          <p style={{ maxWidth: 320 }}>等待交易所推送行情，或点击刷新按钮尝试重新拉取。</p>
        </div>
      )}
    </section>
  );

  const renderLogs = () => (
    <section className="card" style={{ maxHeight: 320, overflowY: 'auto', display: 'flex', flexDirection: 'column-reverse', gap: 12, padding: 20 }}>
      {dashboard?.logs?.length ? (
        dashboard.logs.map((log: LogEntry, index) => {
          const key = `${log.timestamp}-${index}`;
          const color =
            log.type === 'ERROR'
              ? 'var(--danger)'
              : log.type === 'SYSTEM_MODE_CHANGE'
              ? 'var(--warning)'
              : 'var(--ink-muted)';
          return (
            <div key={key} style={{ display: 'flex', gap: 12, fontSize: 13, lineHeight: 1.6, color: 'var(--ink-muted)' }}>
              <span style={{ fontFamily: 'Inter, monospace', color: 'var(--ink-subtle)' }}>
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span style={{ flex: 1, fontWeight: 600, color }}>{log.message}</span>
            </div>
          );
        })
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center', color: 'var(--ink-muted)' }}>
          <p className="h2" style={{ fontSize: 16 }}>暂无日志</p>
          <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 360 }}>
            当前尚未生成 AI 决策或风险事件。启动交易或提高策略频率以获取实时日志。
          </p>
        </div>
      )}
    </section>
  );

  return (
    <Panel
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-muted)' }}>
          <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.2em' }}>行情</span>
          <span className="h2" style={{ fontSize: 18, color: 'var(--ink)' }}>
            行情 / 日志
          </span>
        </div>
      }
      actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: 4,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--card)',
            }}
          >
            <button
              type="button"
              onClick={() => setActiveTab('market')}
              className={`tab ${activeTab === 'market' ? 'tab--active' : ''}`}
            >
              行情
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('logs')}
              className={`tab ${activeTab === 'logs' ? 'tab--active' : ''}`}
            >
              日志
            </button>
          </div>
          <button type="button" className="btn" style={{ padding: '6px 12px', fontSize: 12, fontWeight: 600 }}>
            <RefreshIcon style={{ width: 14, height: 14 }} />
            刷新
          </button>
        </div>
      }
      style={{ minHeight: 360 }}
    >
      {activeTab === 'market' ? renderMarket() : renderLogs()}
    </Panel>
  );
};

export default MarketAndLogsPanel;
