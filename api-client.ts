import { 
  UserSessionConfig, 
  DashboardState, 
  MarketData, 
  AccountState,
  UserAIConfig,
  AppliedRiskClamp,
  MarketRegimeHint,
  SelfDisciplineState,
  AccountRiskLimits,
} from './types';
import { 
  ApiEnv,
  API_ENDPOINTS,
  buildApiUrl,
  getApiEnv,
  getCurrentApiConfig,
  setApiEnv as setApiEnvInternal,
} from './api-config';
import { loadSessionId } from './utils/sessionPersistence';
import { 
  updateSessionConfig as backendUpdateSessionConfig, 
  getCurrentConfig as backendGetCurrentConfig,
  startBackend as backendStartBackend,
  stopBackend as backendStopBackend,
  getDashboardState as backendGetDashboardState,
  initializeBackend as backendInitializeBackend,
  getCurrentAiConfig as backendGetCurrentAiConfig,
  updateUserAiConfig as backendUpdateUserAiConfig,
  getAiModelRegistry as backendGetAiModelRegistry,
  updateRiskLimits as backendUpdateRiskLimits,
  startSnapshot as backendStartSnapshot,
  setTradeEnabled as backendSetTradeEnabled,
  resetPaperAccount as backendResetPaperAccount,
  resetShadowAccount as backendResetShadowAccount,
  stopLiveTrading as backendStopLiveTrading,
  retryEngineInitialization as backendRetryEngineInit,
} from './backend/api';

const LOCAL_SESSION_ID = 'local-session';

const FALLBACK_ACTIVE_CLAMP: AppliedRiskClamp = {
  forbidNewEntries: false,
  maxTotalExposurePct: 0,
  maxConcurrentSymbols: 0,
  modeLabel: 'NORMAL',
};

const FALLBACK_MARKET_REGIME: MarketRegimeHint = {
  available: true,
  environmentAdvisory: 'NEUTRAL',
  disagreementLevel: 'LOW',
  confidence: 1,
  sourceMeta: {
    status: 'ok',
    lastGoodTs: Date.now(),
  },
};

const FALLBACK_DISCIPLINE_STATE: SelfDisciplineState = {
  lastReviewTs: Date.now(),
  windows: [],
  diagnostics: {
    panicTrading: false,
    revengeTrading: false,
    overconcentration: false,
    overtrading: false,
    profitConcentrationHigh: false,
    unrealizedProfitHigh: false,
  },
  perModelStats: {},
};

function normalizeCloudDashboard(sessionId: string, response: any): DashboardState {
  const now = Date.now();
  const normalized: any = {
    session: {
      sid: sessionId,
      status: response?.safetyState?.systemMode === 'PAUSED' ? 'PAUSED' : 'RUNNING',
      startedAt: response?.config?.createdAt ?? now,
      lastTickAt: response?.runtimeState?.lastUpdated ?? now,
      tradeEnabled: Boolean(response?.runtimeState?.tradeEnabled ?? (response?.safetyState?.systemMode !== 'PAUSED')),
    },
    account: {
      totalCapital: response?.runtimeState?.accountEquity ?? 0,
      availableCapital: response?.runtimeState?.accountEquity ?? 0,
      equityNowUsd: response?.runtimeState?.accountEquity ?? 0,
      equityPeakUsd: response?.runtimeState?.accountEquity ?? 0,
      currentLeverage: response?.runtimeState?.effectiveLeverage ?? 0,
      openPositions: response?.runtimeState?.positions ?? [],
      closedTrades: [],
    },
    systemStatus: {
      mode: response?.safetyState?.systemMode ?? 'NORMAL',
      brakeReason: response?.safetyState?.brakeReason ?? null,
      brakeSinceTs: response?.safetyState?.cooldownUntilTs ?? null,
      activeRiskClamp: {
        forbidNewEntries: response?.safetyState?.systemMode !== 'NORMAL',
        maxTotalExposurePct: ((response?.config?.capitalUsageLimitPct ?? 30) / 100),
        maxConcurrentSymbols: response?.config?.allowedPairs?.length ?? 0,
        modeLabel: response?.safetyState?.systemMode ?? 'NORMAL',
      },
    },
    market: response?.runtimeState?.market ?? {},
    logs: [],
    marketRegime: {
      available: true,
      environmentAdvisory: 'NEUTRAL',
      disagreementLevel: 'LOW',
      confidence: 1.0,
      sourceMeta: { status: 'ok', lastGoodTs: now },
    },
    exchangeHealth: response?.exchangeHealth ?? {
      overallRisk: 'ok',
      criticalIssues: [],
      allSources: [],
      lastCheckTs: now,
    },
    disciplineState: {
      diagnostics: {},
      cooldownUntilTs: null,
    },
    riskNews: [],
    lastDecision: null,
    lastUpdated: response?.runtimeState?.lastUpdated ?? now,
  };

  return normalized as DashboardState;
}

function normalizeLocalDashboard(raw: any): DashboardState {
  const now = Date.now();
  const account = raw?.account ?? {};
  const systemStatus = raw?.systemStatus ?? {};
  const marketRegime = raw?.marketRegime
    ? {
        ...FALLBACK_MARKET_REGIME,
        ...raw.marketRegime,
        sourceMeta: {
          ...FALLBACK_MARKET_REGIME.sourceMeta,
          ...(raw.marketRegime.sourceMeta ?? {}),
          lastGoodTs: raw.marketRegime.sourceMeta?.lastGoodTs ?? now,
        },
      }
    : {
        ...FALLBACK_MARKET_REGIME,
        sourceMeta: {
          ...FALLBACK_MARKET_REGIME.sourceMeta,
          lastGoodTs: now,
        },
      };
  const disciplineState = raw?.disciplineState
    ? {
        ...FALLBACK_DISCIPLINE_STATE,
        ...raw.disciplineState,
        lastReviewTs: raw.disciplineState.lastReviewTs ?? now,
      }
    : {
        ...FALLBACK_DISCIPLINE_STATE,
        lastReviewTs: now,
      };

  const normalized: any = {
    ...raw,
    session: {
      sid: raw?.session?.sid ?? LOCAL_SESSION_ID,
      status: raw?.session?.status ?? 'STOPPED',
      startedAt: raw?.session?.startedAt ?? raw?.lastUpdated ?? now,
      lastTickAt: raw?.session?.lastTickAt ?? raw?.lastUpdated ?? now,
      tradeEnabled: Boolean(raw?.session?.tradeEnabled),
    },
    account: {
      totalCapital: Number(account.totalCapital ?? account.equityNowUsd ?? 0),
      availableCapital: Number(account.availableCapital ?? account.totalCapital ?? 0),
      equityNowUsd: Number(account.equityNowUsd ?? account.totalCapital ?? 0),
      equityPeakUsd: Number(account.equityPeakUsd ?? account.totalCapital ?? 0),
      currentLeverage: Number(account.currentLeverage ?? 0),
      openPositions: account.openPositions ?? [],
      closedTrades: account.closedTrades ?? [],
      externalAlerts: account.externalAlerts ?? [],
    },
    systemStatus: {
      mode: systemStatus.mode ?? 'NORMAL',
      brakeReason: systemStatus.brakeReason ?? null,
      brakeSinceTs: systemStatus.brakeSinceTs ?? null,
      activeRiskClamp: systemStatus.activeRiskClamp ?? { ...FALLBACK_ACTIVE_CLAMP },
    },
    market: raw?.market ?? {},
    logs: raw?.logs ?? [],
    marketRegime,
    exchangeHealth: raw?.exchangeHealth ?? {
      overallRisk: 'ok',
      criticalIssues: [],
      allSources: [],
      lastCheckTs: now,
    },
    disciplineState,
    recentExternalAlerts: raw?.recentExternalAlerts ?? [],
    riskLimits: raw?.riskLimits,
    accountRiskState: raw?.accountRiskState,
    lastStrategySnapshot: raw?.lastStrategySnapshot,
    riskNews: raw?.riskNews ?? [],
    lastDecision: raw?.lastDecision ?? null,
    lastUpdated: raw?.lastUpdated ?? now,
  };

  return normalized as DashboardState;
}

// API 客户端类
class ApiClient {
  private get timeout(): number {
    return getCurrentApiConfig().TIMEOUT;
  }

  // 通用请求方法
  private async request<T>(
    endpoint: string, 
    options: RequestInit = {},
    params?: Record<string, string>
  ): Promise<T> {
    const url = buildApiUrl(endpoint, params);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  // 会话管理 API
  async startSession(config: UserSessionConfig): Promise<{ ok: boolean, sessionId: string }> {
    if (getApiEnv() === 'LOCAL') {
      try {
        backendStartBackend(config);
        return { ok: true, sessionId: LOCAL_SESSION_ID };
      } catch (error) {
        console.error('[API] Failed to start local session:', error);
        return { ok: false, sessionId: '' };
      }
    }

    try {
      const result = await this.request<{ sessionId: string }>(API_ENDPOINTS.SESSION_START, {
        method: 'POST',
        body: JSON.stringify({ config }),
      });
      return { ok: true, sessionId: result.sessionId };
    } catch (error) {
      console.error('[API] Failed to start session:', error);
      return { ok: false, sessionId: '' };
    }
  }

  async startSnapshot(config?: UserSessionConfig): Promise<{ ok: boolean }> {
    if (getApiEnv() === 'LOCAL') {
      try {
        backendStartSnapshot(config);
        return { ok: true };
      } catch (error) {
        console.error('[API] Failed to start snapshot mode:', error);
        return { ok: false };
      }
    }

    console.warn('[API] startSnapshot not implemented for remote env; assuming success.');
    return { ok: true };
  }

  async setTradeEnabled(enabled: boolean): Promise<{ ok: boolean; enabled?: boolean }> {
    if (getApiEnv() === 'LOCAL') {
      try {
        backendSetTradeEnabled(enabled);
        return { ok: true, enabled };
      } catch (error) {
        console.error('[API] Failed to toggle trade enabled:', error);
        return { ok: false };
      }
    }

    // REMOTE 模式实现
    const sessionId = loadSessionId();
    if (!sessionId) {
      console.error('[API] No session ID available for remote toggle');
      return { ok: false };
    }

    const config = getCurrentApiConfig();
    const url = buildApiUrl(API_ENDPOINTS.TRADE_ENABLED, { sessionId });

    // 创建 AbortController 用于超时控制
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6秒超时

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // 如果将来需要认证，可以从环境变量或配置中获取 token
      // const token = await auth.getAccessToken();
      // if (token) {
      //   headers['Authorization'] = `Bearer ${token}`;
      // }

      const response = await fetch(url, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ enabled }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMsg = {};
        try {
          errorMsg = await response.json();
        } catch {
          errorMsg = { error: `HTTP ${response.status}` };
        }

        console.warn('[API] Toggle remote failed', response.status, errorMsg);
        
        // 根据错误类型返回不同的错误信息
        if (response.status === 429) {
          console.warn('[API] Rate limit exceeded, please wait before retrying');
        } else if (response.status === 404) {
          console.error('[API] Session not found');
        } else if (response.status === 503) {
          console.error('[API] Backend executor unavailable');
        }

    return { ok: false };
      }

      const data = await response.json();
      
      // 成功响应，返回更新后的状态
      if (data.ok && typeof data.enabled === 'boolean') {
        return { ok: true, enabled: data.enabled };
      }

      return { ok: false };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[API] Toggle remote timeout (6s)');
      } else {
        console.error('[API] Toggle remote error', error);
      }
      
      return { ok: false };
    }
  }

  async getSessionState(sessionId: string): Promise<{ ok: boolean, dashboardState: DashboardState }> {
    try {
      if (getApiEnv() === 'LOCAL') {
        const raw = await backendGetDashboardState();
        const dashboardState = normalizeLocalDashboard(raw);
        return { ok: true, dashboardState };
      }

      const response = await this.request<any>(API_ENDPOINTS.SESSION_STATE, {
        method: 'GET',
      }, { sessionId });

      const dashboardState = normalizeCloudDashboard(sessionId, response);
      return { ok: true, dashboardState };
    } catch (error) {
      console.error('[API] Failed to get session state:', error);
      return { ok: false, dashboardState: {} as DashboardState };
    }
  }

  async haltSession(sessionId: string): Promise<{ ok: boolean, message?: string }> {
    if (getApiEnv() === 'LOCAL') {
      try {
        backendStopBackend();
        return { ok: true, message: 'Local session halted' };
      } catch (error) {
        console.error('[API] Failed to halt local session:', error);
        return { ok: false, message: 'Failed to halt local session' };
      }
    }

    try {
      const result = await this.request<{ message?: string }>(API_ENDPOINTS.SESSION_HALT, {
        method: 'POST',
      }, { sessionId });
      return { ok: true, message: result.message };
    } catch (error) {
      console.error('[API] Failed to halt session:', error);
      return { ok: false, message: 'Failed to halt session' };
    }
  }

  async resumeSession(sessionId: string): Promise<{ ok: boolean, message?: string }> {
    if (getApiEnv() === 'LOCAL') {
      try {
        backendStartBackend(backendGetCurrentConfig());
        return { ok: true, message: 'Local session resumed' };
      } catch (error) {
        console.error('[API] Failed to resume local session:', error);
        return { ok: false, message: 'Failed to resume local session' };
      }
    }

    try {
      const result = await this.request<{ message?: string }>(API_ENDPOINTS.SESSION_RESUME, {
        method: 'POST',
      }, { sessionId });
      return { ok: true, message: result.message };
    } catch (error) {
      console.error('[API] Failed to resume session:', error);
      return { ok: false, message: 'Failed to resume session' };
    }
  }

  async getSessionLogs(sessionId: string): Promise<any[]> {
    if (getApiEnv() === 'LOCAL') {
      console.warn('[API] Local session logs not implemented. Returning empty list.');
      return [];
    }
    return this.request(API_ENDPOINTS.SESSION_LOGS, {
      method: 'GET',
    }, { sessionId });
  }

  // AI 策略师 API
  async callStrategist(prompt: string): Promise<any> {
    return this.request(API_ENDPOINTS.AI_STRATEGIST, {
      method: 'POST',
      body: JSON.stringify({ prompt }),
    });
  }

  // 兼容性方法 - 为了保持与现有代码的兼容性
  async fetchMarketData(): Promise<MarketData> {
    try {
      // 从后端获取当前状态，提取市场数据
      const dashboardState = await backendGetDashboardState();
      if (dashboardState && dashboardState.market) {
        return dashboardState.market;
      }
      return {} as MarketData;
    } catch (error) {
      console.error('[API] Failed to fetch market data:', error);
      return {} as MarketData;
    }
  }

  async fetchAccountState(): Promise<AccountState> {
    try {
      // 从后端获取当前状态，提取账户数据
      const dashboardState = await backendGetDashboardState();
      if (dashboardState && dashboardState.account) {
        return dashboardState.account;
      }
      return {} as AccountState;
    } catch (error) {
      console.error('[API] Failed to fetch account state:', error);
      return {} as AccountState;
    }
  }
}

// 创建全局 API 客户端实例
export const apiClient = new ApiClient();

// 导出兼容性函数 - 直接使用本地后端API
export const initializeBackend = backendInitializeBackend;
export const getDashboardState = backendGetDashboardState;
export const stopBackend = backendStopBackend;
export const startBackend = backendStartBackend;
export const startSnapshot = backendStartSnapshot;
export const setTradeEnabled = backendSetTradeEnabled;

export const fetchMarketData = apiClient.fetchMarketData.bind(apiClient);
export const fetchAccountState = apiClient.fetchAccountState.bind(apiClient);

// 配置管理函数 - 直接从后端API导入（同步）
export const updateSessionConfig = backendUpdateSessionConfig;
export const getCurrentConfig = backendGetCurrentConfig;
export const getCurrentAiConfig = backendGetCurrentAiConfig;
export const updateUserAiConfig = backendUpdateUserAiConfig;
export const getAiModelRegistry = backendGetAiModelRegistry;
export const updateRiskLimits = (patch: Partial<AccountRiskLimits>) => backendUpdateRiskLimits(patch);

// 重置函数
export const resetPaperAccount = backendResetPaperAccount;
export const resetShadowAccount = backendResetShadowAccount;
export const stopLiveTrading = backendStopLiveTrading;

export async function retryEngineInitialization(): Promise<boolean> {
  return backendRetryEngineInit();
}

// 环境切换相关导出
export const setApiEnv = (env: ApiEnv) => setApiEnvInternal(env);
export { getApiEnv };
export type { ApiEnv };