// Paper Trading Configuration - 模拟盘配置存储
import { auditService } from './audit';

const STORAGE_KEY = 'biance_paper_config';
const DEFAULT_PAPER_CAPITAL = 10000; // 默认模拟资金

export interface PaperConfig {
    paperCapital: number; // 模拟盘初始资金（USDT）
    updatedAt: number;
}

const defaultConfig: PaperConfig = {
    paperCapital: DEFAULT_PAPER_CAPITAL,
    updatedAt: Date.now(),
};

/**
 * 获取模拟盘配置
 */
export function getPaperConfig(): PaperConfig {
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const config = JSON.parse(stored) as PaperConfig;
                // 验证配置有效性
                if (typeof config.paperCapital === 'number' && config.paperCapital > 0) {
                    return config;
                }
            }
        }
    } catch (error) {
        auditService.logWarn('[PaperConfig] Failed to load from localStorage', {
            error: error instanceof Error ? error.message : String(error)
        });
    }
    return { ...defaultConfig };
}

/**
 * 更新模拟盘配置
 */
export function updatePaperConfig(partial: Partial<Pick<PaperConfig, 'paperCapital'>>): PaperConfig {
    const current = getPaperConfig();
    const updated: PaperConfig = {
        ...current,
        ...partial,
        updatedAt: Date.now(),
    };
    
    // 验证资金有效性
    if (updated.paperCapital <= 0) {
        throw new Error('Paper capital must be greater than 0');
    }
    
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
            auditService.logInfo('[PaperConfig] Updated paper trading config', {
                paperCapital: updated.paperCapital
            });
        }
    } catch (error) {
        auditService.logError('[PaperConfig] Failed to save to localStorage', {
            error: error instanceof Error ? error.message : String(error)
        });
        throw error;
    }
    
    return updated;
}

/**
 * 重置为默认配置
 */
export function resetPaperConfig(): PaperConfig {
    const defaultConfig = {
        paperCapital: DEFAULT_PAPER_CAPITAL,
        updatedAt: Date.now(),
    };
    
    try {
        if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultConfig));
        }
    } catch (error) {
        auditService.logWarn('[PaperConfig] Failed to reset config', {
            error: error instanceof Error ? error.message : String(error)
        });
    }
    
    return defaultConfig;
}

