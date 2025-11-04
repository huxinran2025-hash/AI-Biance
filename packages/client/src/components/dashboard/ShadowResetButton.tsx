import React, { useState } from 'react';

interface ShadowResetButtonProps {
    onReset: () => Promise<{ reportBlob: Blob; filename: string } | null>;
}

export function ShadowResetButton({ onReset }: ShadowResetButtonProps) {
    const [isResetting, setIsResetting] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const handleReset = async () => {
        if (!showConfirm) {
            setShowConfirm(true);
            return;
        }

        setIsResetting(true);
        try {
            const result = await onReset();
            if (result) {
                // 下载报告
                const url = URL.createObjectURL(result.reportBlob);
                const a = document.createElement('a');
                a.href = url;
                a.download = result.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
            setShowConfirm(false);
        } catch (error) {
            console.error('Failed to reset shadow account:', error);
            alert('重置失败：' + (error instanceof Error ? error.message : String(error)));
        } finally {
            setIsResetting(false);
        }
    };

    const handleCancel = () => {
        setShowConfirm(false);
    };

    if (showConfirm) {
        return (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: 'var(--ink-muted)' }}>
                    确认重置影子盘？将恢复到当前真实USDT余额并生成报告
                </span>
                <button
                    type="button"
                    className="btn btn--solid"
                    onClick={handleReset}
                    disabled={isResetting}
                    style={{ minWidth: 80 }}
                >
                    {isResetting ? '重置中...' : '确认'}
                </button>
                <button
                    type="button"
                    className="btn"
                    onClick={handleCancel}
                    disabled={isResetting}
                    style={{ minWidth: 80 }}
                >
                    取消
                </button>
            </div>
        );
    }

    return (
        <button
            type="button"
            className="btn"
            onClick={handleReset}
            disabled={isResetting}
            style={{ minWidth: 120 }}
        >
            {isResetting ? '重置中...' : '重置影子盘'}
        </button>
    );
}

