import {
  AccountRiskLimits,
  AccountState,
  DashboardState,
  MarketData,
  UserAIConfig,
  UserSessionConfig,
} from '@biance/shared';
import {
  ApiEnv,
  API_ENDPOINTS,
  buildApiUrl,
  getApiEnv,
  getCurrentApiConfig,
  setApiEnv as setApiEnvInternal,
} from './api-config';
import { loadSessionId } from './utils/sessionPersistence';

interface SessionStateResponse {
  ok: boolean;
  dashboardState?: DashboardState;
  message?: string;
}

const LOCAL_SESSION_ID = 'local-session';

class ApiClient {
  private buildUrl(endpoint: string, params?: Record<string, string>): string {
    return buildApiUrl(endpoint, params);
  }

  private async request<T>(endpoint: string, init?: RequestInit, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(endpoint, params);
    const timeout = getCurrentApiConfig().TIMEOUT;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text}`);
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return (await response.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }

  async getDashboardState(): Promise<DashboardState> {
    const result = await this.request<{ ok: boolean; data: DashboardState }>(API_ENDPOINTS.DASHBOARD_STATE);
    if (!result.ok) {
      throw new Error('Failed to fetch dashboard state');
    }
    return result.data;
  }

  async getSessionState(sessionId: string): Promise<SessionStateResponse> {
    try {
      const response = await this.request<{ ok: boolean; data: { dashboardState: DashboardState } }>(
        API_ENDPOINTS.SESSION_STATE,
        undefined,
        { sessionId }
      );
      if (!response.ok) {
        return { ok: false, message: 'Failed to fetch dashboard state' };
      }
      return { ok: true, dashboardState: response.data.dashboardState };
    } catch (error) {
      console.error('[API] Failed to get session state', error);
      return { ok: false, message: String(error) };
    }
  }

  async startSnapshot(config?: UserSessionConfig): Promise<void> {
    await this.request(API_ENDPOINTS.SESSION_SNAPSHOT, {
      method: 'POST',
      body: JSON.stringify({ config }),
    });
  }

  async setTradeEnabled(enabled: boolean): Promise<{ ok: boolean; enabled?: boolean }> {
    const response = await this.request<{ ok: boolean; enabled?: boolean }>(API_ENDPOINTS.TRADE_ENABLED, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    });
    return response;
  }

  async startBackend(config: UserSessionConfig): Promise<void> {
    await this.request(API_ENDPOINTS.SESSION_START, {
      method: 'POST',
      body: JSON.stringify(config),
    });
  }

  async stopBackend(): Promise<void> {
    const sessionId = loadSessionId() ?? LOCAL_SESSION_ID;
    await this.request(API_ENDPOINTS.SESSION_HALT, { method: 'POST' }, { sessionId });
  }

  async initializeBackend(): Promise<void> {
    await this.request(API_ENDPOINTS.SESSION_INITIALIZE, { method: 'POST' });
  }

  async updateSessionConfig(patch: Partial<UserSessionConfig>): Promise<void> {
    await this.request(API_ENDPOINTS.SESSION_CONFIG, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  async getCurrentConfig(): Promise<UserSessionConfig> {
    const response = await this.request<{ ok: boolean; data: UserSessionConfig }>(API_ENDPOINTS.SESSION_CONFIG);
    if (!response.ok) {
      throw new Error('Failed to fetch session config');
    }
    return response.data;
  }

  async getCurrentAiConfig(): Promise<UserAIConfig> {
    const response = await this.request<{ ok: boolean; data: UserAIConfig }>(API_ENDPOINTS.AI_CONFIG);
    if (!response.ok) {
      throw new Error('Failed to fetch AI config');
    }
    return response.data;
  }

  async updateUserAiConfig(patch: Partial<UserAIConfig>): Promise<UserAIConfig> {
    const response = await this.request<{ ok: boolean; data: UserAIConfig }>(API_ENDPOINTS.AI_CONFIG, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      throw new Error('Failed to update AI config');
    }
    return response.data;
  }

  async getAiModelRegistry(): Promise<Record<string, unknown>> {
    const response = await this.request<{ ok: boolean; data: Record<string, unknown> }>(API_ENDPOINTS.AI_MODELS);
    if (!response.ok) {
      throw new Error('Failed to fetch AI model registry');
    }
    return response.data;
  }

  async updateRiskLimits(patch: Partial<AccountRiskLimits>): Promise<AccountRiskLimits> {
    const response = await this.request<{ ok: boolean; data: AccountRiskLimits }>(API_ENDPOINTS.SESSION_RISK_LIMITS, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
    if (!response.ok) {
      throw new Error('Failed to update risk limits');
    }
    return response.data;
  }

  async resetPaperAccount(): Promise<void> {
    await this.request(API_ENDPOINTS.SESSION_RESET_PAPER, { method: 'POST' });
  }

  async resetShadowAccount(): Promise<void> {
    await this.request(API_ENDPOINTS.SESSION_RESET_SHADOW, { method: 'POST' });
  }

  async stopLiveTrading(): Promise<void> {
    await this.request(API_ENDPOINTS.SESSION_STOP_LIVE, { method: 'POST' });
  }

  async retryEngineInitialization(): Promise<boolean> {
    const response = await this.request<{ ok: boolean }>(API_ENDPOINTS.SESSION_RETRY_ENGINE, { method: 'POST' });
    return Boolean(response.ok);
  }

  async fetchMarketData(): Promise<MarketData> {
    try {
      const state = await this.getDashboardState();
      return state.market ?? ({} as MarketData);
    } catch (error) {
      console.error('[API] Failed to fetch market data', error);
      return {} as MarketData;
    }
  }

  async fetchAccountState(): Promise<AccountState> {
    try {
      const state = await this.getDashboardState();
      return state.account ?? ({} as AccountState);
    } catch (error) {
      console.error('[API] Failed to fetch account state', error);
      return {} as AccountState;
    }
  }
}

export const apiClient = new ApiClient();

export const initializeBackend = () => apiClient.initializeBackend();
export const getDashboardState = () => apiClient.getDashboardState();
export const stopBackend = () => apiClient.stopBackend();
export const startBackend = (config: UserSessionConfig) => apiClient.startBackend(config);
export const startSnapshot = (config?: UserSessionConfig) => apiClient.startSnapshot(config);
export const setTradeEnabled = (enabled: boolean) => apiClient.setTradeEnabled(enabled);

export const fetchMarketData = apiClient.fetchMarketData.bind(apiClient);
export const fetchAccountState = apiClient.fetchAccountState.bind(apiClient);

export const updateSessionConfig = (patch: Partial<UserSessionConfig>) => apiClient.updateSessionConfig(patch);
export const getCurrentConfig = () => apiClient.getCurrentConfig();
export const getCurrentAiConfig = () => apiClient.getCurrentAiConfig();
export const updateUserAiConfig = (patch: Partial<UserAIConfig>) => apiClient.updateUserAiConfig(patch);
export const getAiModelRegistry = () => apiClient.getAiModelRegistry();
export const updateRiskLimits = (patch: Partial<AccountRiskLimits>) => apiClient.updateRiskLimits(patch);

export const resetPaperAccount = () => apiClient.resetPaperAccount();
export const resetShadowAccount = () => apiClient.resetShadowAccount();
export const stopLiveTrading = () => apiClient.stopLiveTrading();

export const retryEngineInitialization = () => apiClient.retryEngineInitialization();

export const setApiEnv = (env: ApiEnv) => setApiEnvInternal(env);
export { getApiEnv };
export type { ApiEnv };

export type DashboardResponse = SessionStateResponse;
export type TradeToggleResponse = Promise<{ ok: boolean; enabled?: boolean }>;
export type SessionConfigResponse = Promise<void>;
