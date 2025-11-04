import { UserSessionConfig, DashboardState, UserAIConfig } from '@biance/shared';

const STORAGE_KEYS = {
  SESSION_CONFIG: 'biance_session_config',
  AI_CONFIG: 'biance_ai_config',
  SESSION_RUNNING: 'biance_session_running',
  LAST_DASHBOARD: 'biance_last_dashboard',
  SESSION_START_TIME: 'biance_session_start_time',
  SESSION_ID: 'biance_session_id',
} as const;

export interface PersistedSession {
  config: UserSessionConfig;
  aiConfig: UserAIConfig | null;
  startTime: number;
}

/**
 * 保存会话配置到 localStorage
 */
export function saveSessionConfig(config: UserSessionConfig, aiConfig: UserAIConfig | null): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSION_CONFIG, JSON.stringify(config));
    if (aiConfig) {
      localStorage.setItem(STORAGE_KEYS.AI_CONFIG, JSON.stringify(aiConfig));
    }
    localStorage.setItem(STORAGE_KEYS.SESSION_RUNNING, 'true');
    localStorage.setItem(STORAGE_KEYS.SESSION_START_TIME, Date.now().toString());
  } catch (error) {
    console.error('[SessionPersistence] Failed to save session config:', error);
  }
}

/**
 * 恢复会话配置
 */
export function restoreSessionConfig(): PersistedSession | null {
  try {
    const configStr = localStorage.getItem(STORAGE_KEYS.SESSION_CONFIG);
    const aiConfigStr = localStorage.getItem(STORAGE_KEYS.AI_CONFIG);
    const startTimeStr = localStorage.getItem(STORAGE_KEYS.SESSION_START_TIME);
    
    if (!configStr) {
      return null;
    }

    const config = JSON.parse(configStr) as UserSessionConfig;
    const aiConfig = aiConfigStr ? (JSON.parse(aiConfigStr) as UserAIConfig) : null;
    const startTime = startTimeStr ? parseInt(startTimeStr, 10) : Date.now();

    return { config, aiConfig, startTime };
  } catch (error) {
    console.error('[SessionPersistence] Failed to restore session config:', error);
    return null;
  }
}

/**
 * 清除会话配置
 */
export function clearSessionConfig(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SESSION_CONFIG);
    localStorage.removeItem(STORAGE_KEYS.AI_CONFIG);
    localStorage.removeItem(STORAGE_KEYS.SESSION_RUNNING);
    localStorage.removeItem(STORAGE_KEYS.SESSION_START_TIME);
    localStorage.removeItem(STORAGE_KEYS.LAST_DASHBOARD);
    localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
  } catch (error) {
    console.error('[SessionPersistence] Failed to clear session config:', error);
  }
}

/**
 * 检查会话是否正在运行
 */
export function isSessionRunning(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.SESSION_RUNNING) === 'true';
  } catch {
    return false;
  }
}

/**
 * 保存仪表板状态（用于页面刷新后恢复）
 */
export function saveDashboardState(dashboard: DashboardState): void {
  try {
    localStorage.setItem(STORAGE_KEYS.LAST_DASHBOARD, JSON.stringify(dashboard));
  } catch (error) {
    console.error('[SessionPersistence] Failed to save dashboard state:', error);
  }
}

/**
 * 恢复仪表板状态
 */
export function restoreDashboardState(): DashboardState | null {
  try {
    const dashboardStr = localStorage.getItem(STORAGE_KEYS.LAST_DASHBOARD);
    if (!dashboardStr) {
      return null;
    }
    return JSON.parse(dashboardStr) as DashboardState;
  } catch (error) {
    console.error('[SessionPersistence] Failed to restore dashboard state:', error);
    return null;
  }
}

/**
 * 保存会话ID
 */
export function saveSessionId(sessionId: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.SESSION_ID, sessionId);
  } catch (error) {
    console.error('Failed to save session ID to localStorage', error);
  }
}

/**
 * 加载会话ID
 */
export function loadSessionId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.SESSION_ID);
  } catch (error) {
    console.error('Failed to load session ID from localStorage', error);
    return null;
  }
}

/**
 * 清除会话ID
 */
export function clearSessionId(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.SESSION_ID);
  } catch (error) {
    console.error('Failed to clear session ID from localStorage', error);
  }
}
