import React, { useEffect, useMemo, useState } from 'react';
import { updateRiskLimits, updateSessionConfig } from '../../../api-client';
import { DEFAULT_SESSION_CONFIG } from '../../../constants';
import { useGlobalStore } from '../../../state/useGlobalStore';
import { AccountRiskLimits, UserSessionConfig } from '../../../types';

const formatNumber = (value: number, fractionDigits = 0) =>
  Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: fractionDigits }) : '0';

const DEFAULT_LIMITS: AccountRiskLimits = {
  minCashRatio: 0.25,
  maxMarginUsage: 0.75,
  maxAccountLeverage: 10,
  maxAccountDrawdownPct: 0.3,
};

export const RiskSection: React.FC = () => {
  const {
    state: { config, dashboard },
    dispatch,
  } = useGlobalStore();

  const baseConfig: UserSessionConfig = useMemo(() => config ?? DEFAULT_SESSION_CONFIG, [config]);
  const riskPolicy = baseConfig.riskPolicy ?? {};

  const [accountCap, setAccountCap] = useState<number>(riskPolicy.maxTotalRiskUsd ?? 5000);
  const [symbolCap, setSymbolCap] = useState<number>(riskPolicy.maxPositionRiskUsd ?? 1200);
  const [maxLeverage, setMaxLeverage] = useState<number>(riskPolicy.maxLeverage ?? baseConfig.leverageCap ?? 10);
  const [capitalLimit, setCapitalLimit] = useState<number>(baseConfig.capitalUsageLimitPct ?? 30);

  const riskLimits = dashboard?.riskLimits ?? DEFAULT_LIMITS;
  const [drawdownLimit, setDrawdownLimit] = useState<number>(Math.round((riskLimits.maxAccountDrawdownPct ?? 0.3) * 100));

  useEffect(() => {
    if (config?.riskPolicy) {
      setAccountCap(config.riskPolicy.maxTotalRiskUsd ?? 5000);
      setSymbolCap(config.riskPolicy.maxPositionRiskUsd ?? 1200);
      setMaxLeverage(config.riskPolicy.maxLeverage ?? config.leverageCap ?? 10);
    }
    if (config?.capitalUsageLimitPct !== undefined) {
      setCapitalLimit(config.capitalUsageLimitPct);
    }
  }, [config?.riskPolicy, config?.capitalUsageLimitPct, config?.leverageCap]);

  useEffect(() => {
    if (dashboard?.riskLimits?.maxAccountDrawdownPct !== undefined) {
      setDrawdownLimit(Math.round(dashboard.riskLimits.maxAccountDrawdownPct * 100));
    }
  }, [dashboard?.riskLimits?.maxAccountDrawdownPct]);

  const commitConfig = async (next: Partial<UserSessionConfig>) => {
    try {
      await updateSessionConfig(next);
      const merged: UserSessionConfig = {
        ...baseConfig,
        ...next,
      };
      if (next.riskPolicy) {
        merged.riskPolicy = next.riskPolicy;
      }
      dispatch({ type: 'SET_SESSION_CONFIG', payload: merged });
    } catch (error) {
      console.error('[Settings] Failed to update session config', error);
    }
  };

  const handleRiskPolicyChange = (patch: Partial<typeof riskPolicy>) => {
    const nextPolicy = {
      ...riskPolicy,
      ...patch,
    };
    commitConfig({ riskPolicy: nextPolicy });
  };

  const handleCapitalLimitChange = (value: number) => {
    setCapitalLimit(value);
    commitConfig({ capitalUsageLimitPct: value });
  };

  const handleDrawdownChange = (value: number) => {
    const pct = Math.max(1, Math.min(60, value));
    setDrawdownLimit(pct);
    try {
      const updated = updateRiskLimits({ maxAccountDrawdownPct: pct / 100 });
      if (dashboard) {
        const nextDashboard = {
          ...dashboard,
          riskLimits: { ...updated },
        };
        dispatch({ type: 'HYDRATE_DASHBOARD', payload: nextDashboard });
      }
    } catch (error) {
      console.error('[Settings] Failed to update risk limits', error);
    }
  };

  const riskMetrics = dashboard?.accountRiskState?.metrics;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <div className="h2" style={{ fontSize: 18 }}>资金与仓位上限</div>
        <p data-muted style={{ marginTop: 6, fontSize: 13 }}>
          调整新会话的总体资金使用、单币风险与杠杆上限。保存后立即生效。
        </p>
        <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>账户上限 (USDT)</span>
            <input
              type="number"
              min={1000}
              step={100}
              value={accountCap}
              onChange={(event) => {
                const next = Number(event.target.value);
                setAccountCap(next);
                handleRiskPolicyChange({ maxTotalRiskUsd: next });
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                fontSize: 14,
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>单币上限 (USDT)</span>
            <input
              type="number"
              min={200}
              step={50}
              value={symbolCap}
              onChange={(event) => {
                const next = Number(event.target.value);
                setSymbolCap(next);
                handleRiskPolicyChange({ maxPositionRiskUsd: next });
              }}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                fontSize: 14,
              }}
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>名义杠杆上限 (×)</span>
            <input
              type="range"
              min={1}
              max={20}
              value={maxLeverage}
              onChange={(event) => {
                const next = Number(event.target.value);
                setMaxLeverage(next);
                handleRiskPolicyChange({ maxLeverage: next });
                commitConfig({ leverageCap: next });
              }}
            />
            <span data-muted style={{ fontSize: 13 }}>当前上限：{maxLeverage.toFixed(1)} ×</span>
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>资金利用率上限 (%)</span>
            <input
              type="number"
              min={10}
              max={100}
              value={capitalLimit}
              onChange={(event) => handleCapitalLimitChange(Number(event.target.value))}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                fontSize: 14,
              }}
            />
          </label>
        </div>
      </section>

      <section>
        <div className="h2" style={{ fontSize: 18 }}>风险阈值</div>
        <p data-muted style={{ marginTop: 6, fontSize: 13 }}>
          回撤阈值触发后系统将进入冷静模式，禁止加仓并优先减仓。
        </p>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>当日回撤阈值 (%)</span>
            <input
              type="number"
              min={1}
              max={60}
              value={drawdownLimit}
              onChange={(event) => handleDrawdownChange(Number(event.target.value))}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid var(--border)',
                fontSize: 14,
              }}
            />
            <span data-muted style={{ fontSize: 13 }}>当前阈值：{drawdownLimit}%</span>
          </label>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 12,
              borderRadius: 12,
              border: '1px solid var(--border)',
              background: 'var(--elev)',
              padding: '12px 16px',
              fontSize: 13,
              color: 'var(--ink-muted)',
            }}
          >
            <div>
              <div style={{ fontWeight: 700, color: 'var(--ink)' }}>现金占比</div>
              <div>{formatNumber((riskMetrics?.cashRatio ?? 0) * 100, 1)}%</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--ink)' }}>保证金占比</div>
              <div>{formatNumber((riskMetrics?.marginUsage ?? 0) * 100, 1)}%</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--ink)' }}>账户杠杆</div>
              <div>{formatNumber(riskMetrics?.accountLeverage ?? 0, 2)}×</div>
            </div>
            <div>
              <div style={{ fontWeight: 700, color: 'var(--ink)' }}>当前回撤</div>
              <div>{formatNumber((riskMetrics?.drawdownPct ?? 0) * 100, 2)}%</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default RiskSection;
