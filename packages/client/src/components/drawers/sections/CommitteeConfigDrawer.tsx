import React from 'react';
import { useGlobalStore } from '../../../state/useGlobalStore';
import { t } from '../../../i18n';
import { INTERNAL_MODEL_PROFILES } from '@biance/shared';

const CommitteeConfigDrawer: React.FC = () => {
    const { state: { language, config } } = useGlobalStore();

    if (!config) return null;
    
    const models = Object.values(INTERNAL_MODEL_PROFILES);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div>
                <h3 className="h2" style={{ fontSize: 16, color: 'var(--ink)' }}>AI 决策委员会</h3>
                <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 8 }}>
                    系统由三位内置 AI 模型组成固定委员会，每个模型拥有不同的交易理念，共同给出策略建议并合并为最终提案。
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
                    {models.map(model => (
                        <section key={model.id} className="card" style={{ padding: 16, borderRadius: 14 }}>
                            <h4 className="h2" style={{ fontSize: 15, color: 'var(--ink)' }}>{model.label}</h4>
                            <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 6 }}>{model.description}</p>
                        </section>
                    ))}
                </div>
            </div>

            <div>
                <h3 className="h2" style={{ fontSize: 16, color: 'var(--ink)' }}>风险参数</h3>
                <ul style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 12, paddingLeft: 16, lineHeight: 1.6 }}>
                    <li>资金使用上限：{config.capitalUsageLimitPct}%</li>
                    <li>杠杆上限：{config.leverageCap}x</li>
                    <li>白名单交易对：{config.allowedPairs.length} 个</li>
                 </ul>
            </div>

            <p style={{ fontSize: 12, color: 'var(--ink-subtle)', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                会话运行期间配置被锁定，如需调整请先停止交易。
            </p>
        </div>
    );
};

export default CommitteeConfigDrawer;
