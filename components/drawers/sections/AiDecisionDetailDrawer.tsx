import React from 'react';
import { useGlobalStore } from '../../../state/useGlobalStore';
import { t } from '../../../i18n';
import { INTERNAL_MODEL_PROFILES } from '../../../constants';

const AiDecisionDetailDrawer: React.FC = () => {
  const { state: { dashboard, language } } = useGlobalStore();
  const lastDecision = dashboard?.lastDecision;

  if (!lastDecision) {
    return <p style={{ fontSize: 13, color: 'var(--ink-muted)' }}>Awaiting first AI council decision...</p>;
  }

  const getStanceColor = (stance: 'bullish' | 'bearish' | 'flat' | 'forbid') => {
    switch (stance) {
      case 'bullish':
        return 'var(--success)';
      case 'bearish':
        return 'var(--danger)';
      case 'flat':
        return 'var(--warning)';
      default:
        return 'var(--ink-muted)';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section className="card" style={{ padding: 16, borderRadius: 16 }}>
        <h3 className="h2" style={{ color: 'var(--ink)' }}>{t('safetySnapshot', language)}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12, fontSize: 13, color: 'var(--ink)' }}>
          <p>
            <strong>执行动作：</strong> <span style={{ fontFamily: 'Inter, monospace', textTransform: 'uppercase' }}>{lastDecision.finalAction.replace('_', ' ')}</span>
          </p>
          <p>
            <strong>交易对：</strong> <span style={{ fontFamily: 'Inter, monospace' }}>{lastDecision.symbol}</span>
          </p>
          <p>
            <strong>决策来源：</strong> <span style={{ fontFamily: 'Inter, monospace' }}>{t(lastDecision.decisionAuthority, language)}</span>
          </p>
          <p>
            <strong>原因说明：</strong> {lastDecision.reasonFinal}
          </p>
      </div>
      </section>
      <div>
        <h3 className="h2" style={{ fontSize: 16, color: 'var(--ink)' }}>Contributing Models</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12 }}>
          {lastDecision.contributingModels.map(modelContribution => {
            const profile = INTERNAL_MODEL_PROFILES[modelContribution.model];
            return (
              <section key={modelContribution.model} className="card" style={{ padding: 16, borderRadius: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <h4 className="h2" style={{ fontSize: 15, color: 'var(--ink)' }}>{profile.label}</h4>
                  <span style={{ fontWeight: 700, fontSize: 12, color: getStanceColor(modelContribution.stance) }}>
                    {modelContribution.stance.toUpperCase()}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 6 }}>{profile.description}</p>
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--ink)' }}>
                  <p>
                    <strong>信心水平：</strong> {(modelContribution.confidence * 100).toFixed(0)}%
                  </p>
                  {'reasoning' in modelContribution && modelContribution.reasoning ? (
                    <p style={{ marginTop: 4, color: 'var(--ink-muted)' }}>
                      <strong>模型推理：</strong> “{modelContribution.reasoning}”
                    </p>
                  ) : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default AiDecisionDetailDrawer;
