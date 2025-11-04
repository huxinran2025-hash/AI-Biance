import React, { useMemo, useState } from 'react';
import { DashboardController } from '../../hooks/useDashboard';
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts';
import { fmtPct, fmtUsd, fmtNumber } from '../../utils/dashboard/format';
import { SystemModeBadge } from '../trade-layout/SystemModeBadge';
import { ExposureBar } from './ExposureBar';
import { KpiItem, KpiRow } from './KpiRow';
import { StrategyPresets } from '../StrategyPresets';
import { BudgetMeter } from '../BudgetMeter';
import { PaperResetButton } from './PaperResetButton';
import { ShadowResetButton } from './ShadowResetButton';
import { t } from '../../i18n';
import type { Language, AccountRiskState, AccountRiskLimits, AppliedRiskClamp, SystemStatus } from '../../types';
import { useGlobalStore } from '../../state/useGlobalStore';
import { apiClient, getCurrentConfig, resetPaperAccount, resetShadowAccount, stopLiveTrading, retryEngineInitialization } from '../../api-client';

type WarningTone = 'info' | 'warning' | 'danger';

interface WarningItem {
  tone: WarningTone;
  message: string;
}

const WARNING_STYLES: Record<WarningTone, { background: string; border: string; color: string }> = {
  info: {
    background: 'var(--brand-soft)',
    border: '1px solid rgba(76, 42, 207, 0.2)',
    color: 'var(--brand-ink)',
  },
  warning: {
    background: 'var(--warning-soft)',
    border: '1px solid rgba(245, 158, 11, 0.32)',
    color: 'var(--warning)',
  },
  danger: {
    background: 'var(--danger-soft)',
    border: '1px solid rgba(225, 29, 72, 0.32)',
    color: 'var(--danger)',
  },
};

interface AccountOverviewHeaderProps {
  controller: DashboardController;
  language?: Language;
}

// 模拟7日净值数据
const generateSparklineData = (currentValue: number, baseValue: number = 10000) => {
  const points = 7;
  const variance = 0.02;
  
  return Array.from({ length: points }, (_, i) => {
    const progress = i / (points - 1);
    const randomVariation = (Math.random() * 2 - 1) * variance;
    const trendValue = baseValue + (currentValue - baseValue) * progress;
    const value = trendValue * (1 + randomVariation);
    
    return {
      day: i,
      value: Math.max(0, value),
    };
  });
};

const deriveExposure = (
  account: DashboardController['account'],
  clamp: AppliedRiskClamp | undefined,
) => {
  const usedUsd = account?.openPositions?.reduce((sum, pos) => sum + Math.abs(pos.notionalUsd), 0) ?? 0;
  const capRatio = clamp?.maxTotalExposurePct ?? 0;
  const capUsd = account?.equityNowUsd ? account.equityNowUsd * capRatio : 0;
  const ratio = capUsd > 0 ? usedUsd / capUsd : 0;
  return { usedUsd, capUsd, ratio, capRatio };
};

const deriveCompactWarnings = (
  tradeEnabled: boolean,
  exposureRatio: number,
  status: SystemStatus | undefined,
): WarningItem[] => {
  const warnings: WarningItem[] = [];

  if (!tradeEnabled) {
    warnings.push({ tone: 'info', message: '快照模式' });
  }

  if (status && status.mode !== 'NORMAL') {
    const tone: WarningTone = status.mode === 'EMERGENCY_LANDING' ? 'danger' : 'warning';
    warnings.push({ tone, message: '冷静模式' });
  }

  if (exposureRatio >= 1) {
    warnings.push({ tone: 'danger', message: '资金告警' });
  } else if (exposureRatio >= 0.7) {
    warnings.push({ tone: 'warning', message: '资金预警' });
  }

  return warnings;
};

const deriveKpiItems = (
  riskLimits: AccountRiskLimits | undefined,
  account: DashboardController['account'],
  riskState: AccountRiskState | undefined,
  netWorth: number,
  cash: number,
  exposurePct: number,
) => {
  const items: KpiItem[] = [];

  // 添加核心KPI到第一行
  items.push({
    label: '净值',
    value: fmtUsd(netWorth, { maximumFractionDigits: 0 }),
    tone: 'default',
  });

  items.push({
    label: '可用现金',
    value: fmtUsd(cash, { maximumFractionDigits: 0 }),
    tone: 'default',
  });

  items.push({
    label: '敞口',
    value: fmtPct(exposurePct / 100),
    tone: 'default',
  });

  const leverageCap = riskLimits?.maxLeverage ?? 0;
  const leverageNow = account?.currentLeverage ?? 0;
  const drawdownPct = riskState?.metrics.drawdownPct ?? 0;

  items.push({
    label: '名义杠杆上限',
    value: leverageCap ? `${fmtNumber(leverageCap, { maximumFractionDigits: 1 })}×` : '—',
    tone: 'muted',
  });

  items.push({
    label: '账户杠杆',
    value: `${fmtNumber(leverageNow, { maximumFractionDigits: 1 })}×`,
    tone: leverageNow > leverageCap && leverageCap > 0 ? 'danger' : 'default',
  });

  items.push({
    label: '本周回撤',
    value: fmtPct(drawdownPct),
    tone: drawdownPct >= 0.1 ? 'danger' : drawdownPct >= 0.05 ? 'warning' : 'default',
  });

  return items;
};

export const AccountOverviewHeader: React.FC<AccountOverviewHeaderProps> = ({ controller, language: languageProp }) => {
  const {
    account,
    dashboard,
    tradeEnabled,
    toggleTrading,
    isInitializing,
    language: controllerLanguage,
  } = controller;
  const language = languageProp ?? controllerLanguage ?? 'zh';

  const { actions } = useGlobalStore();

  const systemStatus = dashboard?.systemStatus;
  const riskState = dashboard?.accountRiskState;
  const riskLimits = dashboard?.riskLimits;
  const clamp = systemStatus?.activeRiskClamp;

  const [isSwitching, setSwitching] = useState(false);

  // 计算核心KPI
  const netWorth = useMemo(() => account?.equityNowUsd ?? 0, [account]);
  const cash = useMemo(() => account?.availableCapital ?? 0, [account]);
  const exposureUsd = useMemo(() => {
    return account?.openPositions.reduce((sum, pos) => sum + Math.abs(pos.notionalUsd), 0) ?? 0;
  }, [account]);
  const exposurePct = useMemo(() => {
    return netWorth > 0 ? (exposureUsd / netWorth) * 100 : 0;
  }, [netWorth, exposureUsd]);

  const sparklineData = useMemo(() => {
    return generateSparklineData(netWorth, 10000);
  }, [netWorth]);

  const exposure = useMemo(() => deriveExposure(account, clamp), [account, clamp]);
  const kpiItems = useMemo(
    () => deriveKpiItems(riskLimits, account, riskState, netWorth, cash, exposurePct),
    [riskLimits, account, riskState, netWorth, cash, exposurePct],
  );
  const compactWarnings = useMemo(
    () => deriveCompactWarnings(tradeEnabled, exposure.ratio, systemStatus),
    [tradeEnabled, exposure.ratio, systemStatus],
  );

  // 预算统计
  const budgetTotals = useMemo(() => {
    const logs = dashboard?.logs || [];
    const today = new Date().toISOString().split('T')[0];
    const todayLogs = logs.filter((log) => log.ts && log.ts.startsWith(today));
    const usdToday = todayLogs.reduce((sum, log) => sum + (log.llmCostUsd || 0), 0);
    const usdBudget = 5000; // 默认预算
    return { today: usdToday, budget: usdBudget };
  }, [dashboard?.logs]);

  // 最后决策信号
  const lastDecision = useMemo(() => {
    const logs = dashboard?.logs || [];
    const decisionLog = logs.find((log) => log.type === 'DECISION');
    return decisionLog;
  }, [dashboard?.logs]);

  const decisionSignal = lastDecision?.decision?.verdict === 'BUY'
    ? '看涨'
    : lastDecision?.decision?.verdict === 'SELL'
      ? '看跌'
      : '暂无';

  const handlePresetApply = (freq: { attack: number; risk: number; pm: number; news: number }) => {
    actions.updateAllStrategyFreqs(freq);
  };

  const openBudgetModal = () => {
    actions.openDrawer('settings');
  };

  const handleToggleTrading = async () => {
    if (isSwitching) return;
    setSwitching(true);
    try {
      await toggleTrading(!tradeEnabled);
    } finally {
      setSwitching(false);
    }
  };

  // 获取当前executionMode
  const executionMode = useMemo(() => {
    try {
      const config = getCurrentConfig();
      return config.executionMode || 'paper';
    } catch (error) {
      return 'paper';
    }
  }, [dashboard?.lastUpdated]);

  // 重置处理函数
  const handlePaperReset = async () => {
    return await resetPaperAccount();
  };

  const handleShadowReset = async () => {
    return await resetShadowAccount();
  };

  const handleLiveStop = async () => {
    return await stopLiveTrading();
  };

  const executionEngineStatus = dashboard?.session?.executionEngineStatus;

  return (
    <div className="card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* ExecutionEngine 状态横幅 */}
      {executionEngineStatus === 'failed' && (
        <div style={{
          background: 'var(--danger-soft)',
          border: '1px solid var(--danger)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--danger)', marginBottom: 4 }}>
                严重错误：交易执行引擎启动失败！
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                系统已自动回退到 MOCK 模式。所有交易都是模拟的，不会真实执行。请检查日志并重试，或联系管理员。
              </div>
            </div>
          </div>
          <button
            type="button"
            className="btn btn--solid"
            onClick={async () => {
              const success = await retryEngineInitialization();
              if (success) {
                // 刷新页面状态
                await controller.refresh();
              }
            }}
            style={{ minWidth: 100 }}
          >
            重试初始化
          </button>
        </div>
      )}

      {executionEngineStatus === 'mock_fallback' && (
        <div style={{
          background: 'var(--warning-soft)',
          border: '1px solid rgba(245, 158, 11, 0.32)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontWeight: 600, color: 'var(--warning)' }}>
                警告：交易引擎未就绪
              </div>
              <div style={{ fontSize: 13, color: 'var(--ink-muted)' }}>
                系统当前运行在 MOCK 模式。交易不会真实执行。
              </div>
            </div>
          </div>
        </div>
      )}

      {executionEngineStatus === 'initializing' && (
        <div style={{
          background: 'var(--brand-soft)',
          border: '1px solid rgba(76, 42, 207, 0.2)',
          borderRadius: 8,
          padding: '12px 16px',
          marginBottom: 16,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>🔄</span>
            <div style={{ fontSize: 14, color: 'var(--brand-ink)' }}>
              正在初始化交易引擎...
            </div>
          </div>
        </div>
      )}

      {/* 顶部：标题 + 系统模式徽章 + 决策信号 + 策略按钮 + 预算设置 + 今日消耗 + 折线图 + 交易按钮 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div className="h2">账户概览</div>
        {systemStatus ? <SystemModeBadge mode={systemStatus.mode} label={t(systemStatus.mode, language)} /> : null}

        {/* 决策信号 */}
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', textTransform: 'uppercase', letterSpacing: 0.4 }}>
            决策信号
          </div>
          <div className="h2" style={{ fontSize: 18, fontWeight: 600 }}>
            {decisionSignal}
          </div>
          {lastDecision?.ts && (
            <div style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
              {new Date(lastDecision.ts).toLocaleTimeString()}
            </div>
          )}
        </div>

        {/* 策略预设按钮 */}
        <StrategyPresets onApply={handlePresetApply} />

        {/* 7日净值折线图 */}
        <div style={{ width: 120, height: 28 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparklineData} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Area
                type="monotone"
                dataKey="value"
                stroke="var(--ink-muted)"
                fill="var(--ink-soft)"
                strokeWidth={1.5}
                dot={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 12,
                  padding: '4px 8px',
                }}
                formatter={(value: number) => fmtUsd(value)}
                labelFormatter={() => '净值'}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* 开始交易按钮 + 交易状态徽章 */}
        <button
          type="button"
          className={tradeEnabled ? 'btn' : 'btn btn--solid'}
          onClick={handleToggleTrading}
          disabled={isSwitching}
          style={{ minWidth: 120, marginLeft: 'auto' }}
        >
          {isSwitching ? '执行中…' : tradeEnabled ? '暂停交易' : '开始交易'}
        </button>
        
        {/* 交易状态徽章 */}
        <span
          className="badge"
          style={{
            background: tradeEnabled ? 'rgba(106, 61, 240, 0.16)' : 'rgba(154, 161, 173, 0.16)',
            color: tradeEnabled ? 'var(--brand-ink)' : 'var(--ink-muted)',
          }}
        >
          {tradeEnabled ? '自动交易已启用' : '自动交易已暂停'}
        </span>

        {/* 紧凑警告 BAR */}
        {compactWarnings.map((warning, index) => {
          const style = WARNING_STYLES[warning.tone];
          return (
            <span
              key={`${warning.message}-${index}`}
              className="badge"
              style={{
                background: style.background,
                color: style.color,
                border: style.border,
                fontSize: 12,
                padding: '4px 10px',
              }}
            >
              {warning.message}
            </span>
          );
        })}

        {/* 预算/频率设置按钮 */}
        <button type="button" className="btn" onClick={openBudgetModal}>
          预算/频率设置
        </button>

        {/* 今日消耗 */}
        <BudgetMeter
          usdToday={budgetTotals.today}
          usdBudget={budgetTotals.budget}
          onClick={openBudgetModal}
        />

        {/* 重置按钮 - 根据executionMode显示 */}
        {executionMode === 'paper' && (
          <PaperResetButton onReset={handlePaperReset} />
        )}
        {executionMode === 'shadow' && (
          <ShadowResetButton onReset={handleShadowReset} />
        )}
        {executionMode === 'live' && (
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const result = await handleLiveStop();
              if (result) {
                const url = URL.createObjectURL(result.reportBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }
            }}
            style={{ minWidth: 120 }}
          >
            终止交易
          </button>
        )}
      </div>

      {/* 资金利用率条 */}
      <ExposureBar usedUsd={exposure.usedUsd} capUsd={exposure.capUsd} />

      {/* 其他账户指标 */}
      <KpiRow items={kpiItems} />

      {isInitializing && !account ? (
        <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink-muted)' }}>正在加载账户快照…</div>
      ) : null}
    </div>
  );
};

export default AccountOverviewHeader;

