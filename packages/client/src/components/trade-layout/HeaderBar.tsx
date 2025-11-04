import React, { useEffect, useState } from 'react';
import { useGlobalStore } from '../../state/useGlobalStore';
import { t } from '../../i18n';
import LanguageSwitcher from '../LanguageSwitcher';
import { getApiEnv, setApiEnv, ApiEnv } from '../../api-client';
import { COOLDOWN_MS } from '@biance/shared';
import { SystemModeBadge } from './SystemModeBadge';
import { SettingsDrawer } from '../settings/SettingsDrawer';

const formatCooldown = (ms: number) => {
  if (ms <= 0) return '00:00';
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
};

const HeaderBar: React.FC = () => {
  const { state } = useGlobalStore();
  const { session, dashboard, language } = state;
  const systemStatus = dashboard?.systemStatus;

  const [cooldownLeft, setCooldownLeft] = useState(0);
  const [apiEnv, setApiEnvState] = useState<ApiEnv>(getApiEnv());
  const [settingsOpen, setSettingsOpen] = useState(false);

  const tradeEnabled = session?.tradeEnabled ?? false;

  const cooldownActive = dashboard?.accountRiskState?.cooldownActive;
  const cooldownTriggeredAt = dashboard?.accountRiskState?.triggeredTs;

  useEffect(() => {
    if (!cooldownActive || !cooldownTriggeredAt) {
      setCooldownLeft(0);
      return;
    }

    const tick = () => {
      const elapsed = Date.now() - cooldownTriggeredAt;
      setCooldownLeft(Math.max(COOLDOWN_MS - elapsed, 0));
    };

    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [cooldownActive, cooldownTriggeredAt]);


  const sessionBadgeStyle = tradeEnabled
    ? { background: 'var(--brand-soft)', color: 'var(--brand)' }
    : { background: 'rgba(154, 161, 173, 0.14)', color: 'var(--ink-muted)' };

  const renderModeBadge = () => {
    if (systemStatus) {
      return <SystemModeBadge mode={systemStatus.mode} label={t(systemStatus.mode, language)} />;
    }
    return (
      <span className="badge" style={{ background: 'rgba(154, 161, 173, 0.18)', color: 'var(--ink-muted)' }}>
        未连接
      </span>
    );
  };

  return (
    <header
      className="card"
      style={{
        position: 'sticky',
        top: 12,
        zIndex: 40,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        backdropFilter: 'blur(12px)',
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="h2" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            BIANCE
            <span className="badge" style={sessionBadgeStyle}>
              {tradeEnabled ? '交易中' : '快照模式'}
            </span>
          </div>
          {renderModeBadge()}
        </div>

        {cooldownLeft > 0 && (
          <span className="badge" style={{ background: 'rgba(245, 158, 11, 0.16)', color: 'var(--warning)' }}>
            冷静期 {formatCooldown(cooldownLeft)}
          </span>
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const next = apiEnv === 'LOCAL' ? 'CLOUD_RUN' : 'LOCAL';
              setApiEnv(next);
              setApiEnvState(next);
              window.alert(
                `已切换到${next === 'LOCAL' ? '本地' : '云端'}环境，${
                next === 'LOCAL'
                    ? '当前使用本地模拟行情，请在面板中启用自动交易。'
                    : '后续请求将访问云端 API。'
                }`,
              );
            }}
          >
            {apiEnv === 'LOCAL' ? '本地' : '云端'}
            </button>

          <button type="button" className="btn" onClick={() => setSettingsOpen(true)}>
            设置
          </button>

          <LanguageSwitcher />
          <div
            style={{
              height: 34,
              width: 34,
              borderRadius: '50%',
              border: '1px solid var(--border)',
              background: 'var(--brand-soft)',
              color: 'var(--brand)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            AI
          </div>
        </div>
      </div>

      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
};

export default HeaderBar;
