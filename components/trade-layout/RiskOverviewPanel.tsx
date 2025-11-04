import React, { useMemo, useState } from 'react';
import { useGlobalStore } from '../../state/useGlobalStore';
import { t } from '../../i18n';
import { Panel } from '../ui/Panel';
import { SystemMode } from '../../types';
import { ChevronRightIcon } from '../icons';

type BadgeKind = 'NORMAL' | 'COOL' | 'EMERGENCY' | 'INFO';

const BADGE_STYLES: Record<BadgeKind, { background: string; color: string }> = {
  NORMAL: { background: 'var(--brand-soft)', color: 'var(--brand-ink)' },
  COOL: { background: 'rgba(245, 158, 11, 0.18)', color: 'var(--warning)' },
  EMERGENCY: { background: 'rgba(225, 29, 72, 0.18)', color: 'var(--danger)' },
  INFO: { background: 'rgba(154, 161, 173, 0.16)', color: 'var(--ink-muted)' },
};

const modeToBadge = (mode: SystemMode | 'ok' | 'degraded' | 'critical'): BadgeKind => {
  if (mode === 'NORMAL' || mode === 'ok') return 'NORMAL';
  if (mode === 'EMERGENCY_LANDING' || mode === 'SELF_ABUSE_PROTECTION' || mode === 'critical') return 'EMERGENCY';
  if (mode === 'degraded' || mode === 'COOL_DOWN_CAPITAL_STRESS' || mode === 'COOL_DOWN_EXTERNAL_UNSAFE' || mode === 'REDUCE_ONLY') return 'COOL';
  return 'INFO';
};

const RiskOverviewPanel: React.FC = () => {
  const {
    state: { dashboard, language, config },
  } = useGlobalStore();

  const [openSection, setOpenSection] = useState<'system' | 'exchange' | 'capital' | null>('system');

  const content = useMemo(() => {
    if (!dashboard) return null;

    const { systemStatus, exchangeHealth } = dashboard;
    const totalExposure = dashboard.account.openPositions.reduce((sum, pos) => sum + pos.notionalUsd, 0);
    const exposurePct = dashboard.account.equityNowUsd > 0 ? (totalExposure / dashboard.account.equityNowUsd) * 100 : 0;
    const limitPct = config?.capitalUsageLimitPct ?? 30;
    const capitalStatus = exposurePct > limitPct ? 'critical' : exposurePct > limitPct * 0.8 ? 'degraded' : 'ok';

    return {
      systemStatus,
      exchangeHealth,
      exposurePct,
      limitPct,
      capitalStatus,
    };
  }, [dashboard, config]);

  if (!dashboard || !content) {
    return (
      <Panel title={<span className="h2" style={{ fontSize: 18, color: 'var(--ink-muted)' }}>风险概览</span>}>
        <div
          style={{
            height: 200,
            borderRadius: 16,
            background: 'var(--elev)',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
      </Panel>
    );
  }

  const { systemStatus, exchangeHealth, exposurePct, limitPct, capitalStatus } = content;

  const sections: Array<{
    key: 'system' | 'exchange' | 'capital';
    title: string;
    badge: { label: string; kind: BadgeKind };
    summary: string;
    details: React.ReactNode;
  }> = [
    {
      key: 'system',
      title: t('systemSafety', language),
      badge: {
        label: t(systemStatus.mode, language),
        kind: modeToBadge(systemStatus.mode),
      },
      summary: systemStatus.brakeReason
        ? `${t('triggerReason', language)}: ${t(systemStatus.brakeReason, language)}`
        : '运行稳定，未检测到异常',
      details: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--ink-muted)' }}>
          <div>
            <span style={{ color: 'var(--ink-subtle)' }}>当前模式：</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{t(systemStatus.mode, language)}</span>
          </div>
          <div>
            <span style={{ color: 'var(--ink-subtle)' }}>触发原因：</span>
            <span style={{ fontFamily: 'Inter, monospace', color: 'var(--ink)' }}>
              {systemStatus.brakeReason ? t(systemStatus.brakeReason, language) : '无'}
            </span>
          </div>
          <div>
            <span style={{ color: 'var(--ink-subtle)' }}>风险阈值：</span>
            <span style={{ fontFamily: 'Inter, monospace', color: 'var(--ink)' }}>
              {systemStatus.activeRiskClamp.maxConcurrentSymbols} 个标的 /
              {(systemStatus.activeRiskClamp.maxTotalExposurePct * 100).toFixed(0)}%
            </span>
          </div>
        </div>
      ),
    },
    {
      key: 'exchange',
      title: t('exchangeHealth', language),
      badge: {
        label: exchangeHealth ? t(exchangeHealth.overallRisk, language) : '未知',
        kind: modeToBadge(exchangeHealth?.overallRisk ?? 'ok'),
      },
      summary:
        exchangeHealth && exchangeHealth.criticalIssues.length > 0
          ? `${exchangeHealth.criticalIssues[0].exchange}: ${exchangeHealth.criticalIssues[0].details}`
          : '所有交易所连接正常',
      details: exchangeHealth ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--ink-muted)' }}>
          {exchangeHealth.allSources.map((src) => (
            <div
              key={src.exchange}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'var(--elev)',
                padding: '12px 16px',
              }}
            >
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{src.exchange}</span>
              {(() => {
                const badgeStyle = BADGE_STYLES[modeToBadge(src.status as SystemMode)];
                return (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '4px 10px',
                      borderRadius: 999,
                      fontSize: 12,
                      fontWeight: 600,
                      background: badgeStyle.background,
                      color: badgeStyle.color,
                    }}
                  >
                    {t(src.status, language)}
                  </span>
                );
              })()}
            </div>
          ))}
        </div>
      ) : (
        <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>暂未拉取到交易所健康数据。</p>
      ),
    },
    {
      key: 'capital',
      title: t('capitalUsage', language),
      badge: {
        label: `${exposurePct.toFixed(1)}%`,
        kind: modeToBadge(capitalStatus as SystemMode),
      },
      summary: `资金利用率 ${exposurePct.toFixed(1)}% / 上限 ${limitPct}%`,
      details: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--ink-muted)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ink-subtle)' }}>当前利用率</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{exposurePct.toFixed(2)}%</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--ink-subtle)' }}>策略上限</span>
            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{limitPct}%</span>
          </div>
          <div style={{ height: 6, width: '100%', borderRadius: 999, background: 'var(--brand-soft)' }}>
            <div
              style={{
                height: '100%',
                borderRadius: 999,
                width: `${Math.min(100, (exposurePct / limitPct) * 100)}%`,
                background:
                  capitalStatus === 'critical'
                    ? 'var(--danger)'
                    : capitalStatus === 'degraded'
                    ? 'var(--warning)'
                    : 'var(--success)',
              }}
            />
          </div>
          <p style={{ fontSize: 12 }}>
            建议在 80% 前保持灵活，超出上限系统将触发降级或强制减仓。
          </p>
        </div>
      ),
    },
  ];

  return (
    <Panel
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink-muted)' }}>
          <span style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.2em' }}>风险</span>
          <span className="h2" style={{ fontSize: 18, color: 'var(--ink)' }}>
            风险概览
          </span>
        </div>
      }
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {sections.map((section) => {
          const isOpen = openSection === section.key;
          return (
            <div
              key={section.key}
              style={{
                borderRadius: 16,
                border: '1px solid var(--border)',
                background: 'var(--card)',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setOpenSection(isOpen ? null : section.key)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '14px 20px',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  gap: 16,
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{section.title}</span>
                    {(() => {
                      const badge = BADGE_STYLES[section.badge.kind];
                      return (
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '4px 10px',
                            borderRadius: 999,
                            fontSize: 12,
                            fontWeight: 600,
                            background: badge.background,
                            color: badge.color,
                          }}
                        >
                          {section.badge.label}
                        </span>
                      );
                    })()}
                  </div>
                  <p style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-muted)' }}>{section.summary}</p>
                </div>
                <ChevronRightIcon
                  style={{
                    height: 16,
                    width: 16,
                    color: isOpen ? 'var(--brand)' : 'var(--ink-subtle)',
                    transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s ease',
                  }}
                />
              </button>
              {isOpen && (
                <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px' }}>{section.details}</div>
              )}
            </div>
          );
        })}
      </div>
    </Panel>
    );
};

export default RiskOverviewPanel;
