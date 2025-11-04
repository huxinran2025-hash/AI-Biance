import React, { useEffect, useMemo, useState } from 'react';
import { ApiEnv, getApiEnv, setApiEnv, updateSessionConfig, getCurrentConfig } from '../../../api-client';
import { DEFAULT_SESSION_CONFIG } from '@biance/shared';
import { useGlobalStore } from '../../../state/useGlobalStore';
import { UserSessionConfig } from '@biance/shared';

type ExecutionMode = 'paper' | 'shadow' | 'live';

interface ModeOption {
  value: ExecutionMode;
  label: string;
  description: string;
}

const MODE_OPTIONS: ModeOption[] = [
  { value: 'paper', label: '模拟盘', description: '使用实时行情但不触发真实下单，适合策略验证。' },
  { value: 'shadow', label: '影子盘', description: '按实盘执行但结果仅用于对比分析，记录影子订单。' },
  { value: 'live', label: '真实盘', description: '直接连接交易所执行真实订单，请确保 API 权限与风控阈值。' },
];

const ENV_OPTIONS: Array<{ value: ApiEnv; label: string; description: string }> = [
  {
    value: 'LOCAL',
    label: '本地模拟',
    description: '使用内置后端与本地行情，适合开发调试，无需 API Key。',
  },
  {
    value: 'CLOUD_RUN',
    label: '云端服务',
    description: '连接部署在 Cloud Run 的后端，请确保网络可达并配置好 API Key。',
  },
];

export const EnvironmentSection: React.FC = () => {
  const {
    state: { config: storeConfig, dashboard },
    dispatch,
  } = useGlobalStore();

  const [apiEnv, setApiEnvState] = useState<ApiEnv>(() => getApiEnv());
  const [localConfig, setLocalConfig] = useState<UserSessionConfig>(() => {
    if (storeConfig) return storeConfig;
    try {
      return getCurrentConfig() ?? DEFAULT_SESSION_CONFIG;
    } catch (error) {
      console.warn('[Settings] Failed to load current config, fallback to default.', error);
      return DEFAULT_SESSION_CONFIG;
    }
  });

  useEffect(() => {
    if (storeConfig) {
      setLocalConfig(storeConfig);
    }
  }, [storeConfig]);

  const executionMode: ExecutionMode = useMemo(() => {
    return (localConfig.executionMode as ExecutionMode) || 'paper';
  }, [localConfig.executionMode]);

  const handleEnvChange = (next: ApiEnv) => {
    try {
      setApiEnv(next);
      setApiEnvState(next);
    } catch (error) {
      console.error('[Settings] Failed to switch API environment', error);
    }
  };

  const handleModeChange = async (nextMode: ExecutionMode) => {
    setLocalConfig((prev) => ({ ...prev, executionMode: nextMode }));
    try {
      await updateSessionConfig({ executionMode: nextMode });
      const nextConfig: UserSessionConfig = {
        ...(storeConfig ?? localConfig ?? DEFAULT_SESSION_CONFIG),
        executionMode: nextMode,
      };
      dispatch({ type: 'SET_SESSION_CONFIG', payload: nextConfig });
    } catch (error) {
      console.error('[Settings] Failed to update execution mode', error);
    }
  };

  const activeEnvMeta = ENV_OPTIONS.find((item) => item.value === apiEnv);
  const sessionStatus = dashboard?.session?.status ?? '未运行';

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <div className="h2" style={{ fontSize: 18 }}>
          API 环境
        </div>
        <p data-muted style={{ marginTop: 6, fontSize: 13 }}>
          选择后端运行环境。若切换至云端，请确认凭证与网络连通性。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
          {ENV_OPTIONS.map((option) => (
            <label
              key={option.value}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 12,
                border: option.value === apiEnv ? '1px solid var(--brand)' : '1px solid var(--border)',
                background: option.value === apiEnv ? 'var(--brand-soft)' : 'var(--card)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="api-env"
                value={option.value}
                checked={apiEnv === option.value}
                onChange={() => handleEnvChange(option.value)}
                style={{ marginTop: 4 }}
              />
              <div>
                <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{option.label}</div>
                <div data-muted style={{ marginTop: 4, fontSize: 13 }}>{option.description}</div>
              </div>
            </label>
          ))}
        </div>
        {activeEnvMeta && (
          <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink-muted)' }}>
            当前环境：{activeEnvMeta.label}（会话状态：{sessionStatus}）
          </div>
        )}
      </section>

      <section>
        <div className="h2" style={{ fontSize: 18 }}>
          交易模式
        </div>
        <p data-muted style={{ marginTop: 6, fontSize: 13 }}>
          根据联调阶段选择模拟、影子或真实交易模式。切换后将应用于下次新会话。
        </p>
        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                padding: '12px 14px',
                borderRadius: 12,
                border: option.value === executionMode ? '1px solid var(--brand)' : '1px solid var(--border)',
                background: option.value === executionMode ? 'var(--brand-soft)' : 'var(--card)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="execution-mode"
                value={option.value}
                checked={executionMode === option.value}
                onChange={() => handleModeChange(option.value)}
                style={{ marginTop: 4 }}
              />
              <div>
                <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{option.label}</div>
                <div data-muted style={{ marginTop: 4, fontSize: 13 }}>{option.description}</div>
              </div>
            </label>
          ))}
        </div>
      </section>
    </div>
  );
};

export default EnvironmentSection;

