import React, { useEffect, useMemo, useState } from 'react';
import { SYMBOL_WHITELIST } from '../../../constants';
import { getApiEnv, updateSessionConfig } from '../../../api-client';
import { useGlobalStore } from '../../../state/useGlobalStore';
import { UserSessionConfig } from '../../../types';

export const ExchangeSection: React.FC = () => {
  const {
    state: { config, dashboard },
    dispatch,
  } = useGlobalStore();

  const [selectedPairs, setSelectedPairs] = useState<string[]>(() => config?.allowedPairs ?? SYMBOL_WHITELIST);

  useEffect(() => {
    if (config?.allowedPairs) {
      setSelectedPairs(config.allowedPairs);
    }
  }, [config?.allowedPairs]);

  const togglePair = async (symbol: string) => {
    setSelectedPairs((prev) => {
      const next = prev.includes(symbol) ? prev.filter((item) => item !== symbol) : [...prev, symbol];
      return next;
    });
    
    // 异步更新配置（在 state 更新后）
    const next = selectedPairs.includes(symbol) 
      ? selectedPairs.filter((item) => item !== symbol) 
      : [...selectedPairs, symbol];
    const nextConfig: UserSessionConfig = {
      ...(config ?? {}),
      allowedPairs: next,
    };
    try {
      await updateSessionConfig({ allowedPairs: next });
      dispatch({ type: 'SET_SESSION_CONFIG', payload: nextConfig });
    } catch (error) {
      console.error('[Settings] Failed to update whitelist', error);
    }
  };

  const apiEnv = getApiEnv();

  const hasApiCredentialIssue = useMemo(() => {
    const issues = dashboard?.exchangeHealth?.criticalIssues ?? [];
    return issues.some((issue) => /api/i.test(issue.details) || /credential/i.test(issue.details));
  }, [dashboard?.exchangeHealth?.criticalIssues]);

  const apiKeyStatus = useMemo(() => {
    if (apiEnv === 'LOCAL') {
      return { label: '模拟环境（无需 API 密钥）', tone: 'var(--ink-muted)' };
    }
    if (hasApiCredentialIssue) {
      return { label: 'API 密钥无效或权限不足', tone: 'var(--danger)' };
    }
    return { label: 'API 密钥已配置', tone: 'var(--success)' };
  }, [apiEnv, hasApiCredentialIssue]);

  const whitelisted = selectedPairs.length;
  const totalPairs = SYMBOL_WHITELIST.length;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <div className="h2" style={{ fontSize: 18 }}>
          币安 API Key 状态
        </div>
        <p data-muted style={{ marginTop: 6, fontSize: 13 }}>
          当前环境：{apiEnv === 'LOCAL' ? '本地模拟' : '云端服务'}。如使用真实下单，请确认已在白名单内配置接口权限。
        </p>
        <div
          style={{
            marginTop: 16,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--elev)',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 700, color: 'var(--ink)' }}>状态</div>
            <div style={{ marginTop: 4, fontSize: 13, color: 'var(--ink-muted)' }}>
              可在 Cloud Run 控制台或 Secrets Manager 更新 API Key。
            </div>
          </div>
          <span
            className="badge"
            style={{
              background: 'transparent',
              border: `1px solid ${apiKeyStatus.tone}`,
              color: apiKeyStatus.tone,
            }}
          >
            {apiKeyStatus.label}
          </span>
        </div>
      </section>

      <section>
        <div className="h2" style={{ fontSize: 18 }}>
          白名单交易对
        </div>
        <p data-muted style={{ marginTop: 6, fontSize: 13 }}>
          共 {totalPairs} 个候选交易对，已启用 {whitelisted} 个。关闭后系统不会下单或订阅对应行情。
        </p>
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          {SYMBOL_WHITELIST.map((symbol) => {
            const checked = selectedPairs.includes(symbol);
            return (
              <label
                key={symbol}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 12px',
                  borderRadius: 12,
                  border: checked ? '1px solid var(--brand)' : '1px solid var(--border)',
                  background: checked ? 'var(--brand-soft)' : 'var(--card)',
                  cursor: 'pointer',
                  fontWeight: 600,
                  color: 'var(--ink)',
                }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => togglePair(symbol)}
                />
                {symbol}
              </label>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default ExchangeSection;

