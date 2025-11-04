/**
 * 统一的敞口计算工具函数
 * 确保所有模块使用一致的敞口计算逻辑
 */

/**
 * 计算总敞口（使用绝对名义值）
 * @param positions 持仓数组
 * @returns 总敞口（USD）
 */
export function sumExposureUsd(positions: { notionalUsd?: number }[] = []): number {
    return positions.reduce((sum, pos) => {
        const notional = pos.notionalUsd || 0;
        return sum + Math.abs(notional);
    }, 0);
}

/**
 * 将百分比裁剪到 0-100 范围
 * 处理 NaN、Infinity 等异常值
 * @param n 原始百分比值
 * @returns 裁剪后的百分比（0-100）
 */
export function clipPct01(n: number): number {
    if (!isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
}

