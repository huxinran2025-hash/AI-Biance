import React, { useState, useEffect } from 'react';

// 由于paperConfig是在backend中，我们需要通过API或者直接在前端实现
// 为了简化，我们在这里直接使用localStorage
const STORAGE_KEY = 'biance_paper_config';
const DEFAULT_PAPER_CAPITAL = 10000;

interface PaperConfig {
    paperCapital: number;
    updatedAt: number;
}

export function PaperTradingSection() {
    const [paperCapital, setPaperCapital] = useState<string>('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        // 加载当前配置
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const config = JSON.parse(stored) as PaperConfig;
                setPaperCapital(config.paperCapital.toString());
            } else {
                setPaperCapital(DEFAULT_PAPER_CAPITAL.toString());
            }
        } catch (error) {
            console.error('Failed to load paper config:', error);
            setPaperCapital(DEFAULT_PAPER_CAPITAL.toString());
        }
    }, []);

    const handleSave = () => {
        setIsLoading(true);
        setMessage(null);

        try {
            const capital = parseFloat(paperCapital);
            
            if (isNaN(capital) || capital <= 0) {
                setMessage({ type: 'error', text: '请输入有效的资金金额（大于0）' });
                setIsLoading(false);
                return;
            }

            const config: PaperConfig = {
                paperCapital: capital,
                updatedAt: Date.now(),
            };

            localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
            setMessage({ type: 'success', text: '模拟盘资金设置已保存' });
            
            // 触发自定义事件通知其他组件
            window.dispatchEvent(new CustomEvent('paperConfigUpdated', { detail: config }));
            
        } catch (error) {
            setMessage({ 
                type: 'error', 
                text: error instanceof Error ? error.message : '保存失败' 
            });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
                <h3 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>模拟盘资金设置</h3>
                <p style={{ fontSize: 14, color: 'var(--ink-muted)', marginBottom: 16 }}>
                    设置模拟盘交易的初始资金（USDT）。此资金仅用于模拟盘（paper模式）交易，不会影响真实账户。
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <label style={{ fontSize: 14, fontWeight: 500 }}>
                    初始资金（USDT）
                </label>
                <input
                    type="number"
                    value={paperCapital}
                    onChange={(e) => setPaperCapital(e.target.value)}
                    placeholder="请输入金额"
                    min="0"
                    step="0.01"
                    style={{
                        padding: '10px 12px',
                        fontSize: 14,
                        border: '1px solid var(--border)',
                        borderRadius: 6,
                        background: 'var(--bg)',
                        color: 'var(--ink)',
                        width: '100%',
                        maxWidth: 300,
                    }}
                    disabled={isLoading}
                />
                <p style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                    当前设置：{paperCapital ? `${parseFloat(paperCapital).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT` : '未设置'}
                </p>
            </div>

            {message && (
                <div
                    style={{
                        padding: '10px 12px',
                        borderRadius: 6,
                        fontSize: 14,
                        background: message.type === 'success' 
                            ? 'rgba(76, 175, 80, 0.1)' 
                            : 'rgba(244, 67, 54, 0.1)',
                        color: message.type === 'success' 
                            ? 'var(--success)' 
                            : 'var(--danger)',
                        border: `1px solid ${message.type === 'success' 
                            ? 'rgba(76, 175, 80, 0.3)' 
                            : 'rgba(244, 67, 54, 0.3)'}`,
                    }}
                >
                    {message.text}
                </div>
            )}

            <button
                type="button"
                className="btn btn--solid"
                onClick={handleSave}
                disabled={isLoading}
                style={{ alignSelf: 'flex-start', minWidth: 120 }}
            >
                {isLoading ? '保存中...' : '保存设置'}
            </button>

            <div style={{ marginTop: 8, padding: 12, background: 'var(--ink-soft)', borderRadius: 6 }}>
                <p style={{ fontSize: 12, color: 'var(--ink-muted)', margin: 0 }}>
                    <strong>说明：</strong>
                    <br />
                    • 模拟盘使用虚拟资金进行交易，不会产生真实盈亏
                    <br />
                    • 此设置仅影响 paper 模式下的初始资金
                    <br />
                    • shadow 和 live 模式使用真实币安账户余额
                </p>
            </div>
        </div>
    );
}

