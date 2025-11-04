import React from 'react';
import { useGlobalStore } from '../../../state/useGlobalStore';
import { t } from '../../../i18n';
import { SystemMode } from '../../../types';

interface ModeInfo {
    description: string;
    triggers: string;
    actions: string;
}

const RiskModeDetailDrawer: React.FC = () => {
    const { state: { language } } = useGlobalStore();

    const modeDetails: Record<SystemMode, ModeInfo> = {
        NORMAL: {
            description: '默认运行模式，所有系统处于正常水平。',
            triggers: '当前没有激活的风险触发。',
            actions: '允许新开仓，遵循用户定义的资金上限。'
        },
        REDUCE_ONLY: {
            description: '关键新闻触发时启动，目标是降低敞口但避免过度抛售。',
            triggers: '来自重要来源的高严重度新闻（如监管动作）。',
            actions: '禁止新开仓，仅允许平掉既有头寸。'
        },
        COOL_DOWN_CAPITAL_STRESS: {
            description: '账户出现中等压力时触发。',
            triggers: '较大幅度的回撤（如超过 10%），或资金使用率超限。',
            actions: '禁止新开仓，并显著降低最大敞口。'
        },
        COOL_DOWN_EXTERNAL_UNSAFE: {
            description: '外部数据源不可靠时触发。',
            triggers: '交易所状态降级、RSS 数据解析异常等。',
            actions: '禁止新开仓，避免根据错误数据做出决策。'
        },
        SELF_ABUSE_PROTECTION: {
            description: '防止严重回撤或情绪化操作造成损失。',
            triggers: '重大回撤（如超过 20%），或检测到报复/恐慌交易。',
            actions: '禁止新开仓，并大幅收紧敞口限制。'
        },
        EMERGENCY_LANDING: {
            description: '最高警戒级别，将仓位尽量降至接近现金状态。',
            triggers: '交易所关键故障（如提现冻结）或长时间外部数据中断。',
            actions: '禁止新开仓，并可能主动分批平仓。'
        },
        PAUSED: {
            description: '用户手动触发的暂停模式。',
            triggers: '用户点击暂停按钮。',
            actions: '暂停所有交易活动，直至手动恢复。'
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(modeDetails).map(([mode, details]) => (
                <section key={mode} className="card" style={{ padding: 16, borderRadius: 16 }}>
                    <h4 className="h2" style={{ fontSize: 16, color: 'var(--ink)' }}>{t(mode as SystemMode, language)}</h4>
                    <p style={{ fontSize: 13, color: 'var(--ink-muted)', marginTop: 6 }}>{details.description}</p>
                    <div style={{ marginTop: 12, fontSize: 12, color: 'var(--ink)' }}>
                        <p>
                            <strong style={{ color: 'var(--ink-muted)' }}>Triggers:</strong> {details.triggers}
                        </p>
                        <p style={{ marginTop: 4 }}>
                            <strong style={{ color: 'var(--ink-muted)' }}>Actions:</strong> {details.actions}
                        </p>
                    </div>
                </section>
            ))}
        </div>
    );
};

export default RiskModeDetailDrawer;
