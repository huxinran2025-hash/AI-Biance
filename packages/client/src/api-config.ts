export type ApiEnv = 'LOCAL' | 'CLOUD_RUN';

const API_CONFIG: Record<ApiEnv, { BASE_URL: string; TIMEOUT: number }> = {
  LOCAL: {
    BASE_URL: 'http://localhost:4000',
    TIMEOUT: 5000,
  },
  CLOUD_RUN: {
    BASE_URL: 'https://biance-backend-495185885743.asia-east1.run.app',
    TIMEOUT: 5000,
  },
};

let currentEnv: ApiEnv = 'LOCAL';

export function getApiEnv(): ApiEnv {
  return currentEnv;
}

export function setApiEnv(env: ApiEnv) {
  currentEnv = env;
}

export function getCurrentApiConfig() {
  return API_CONFIG[currentEnv];
}

export const API_ENDPOINTS = {
  DASHBOARD_STATE: '/api/dashboard-state',
  SESSION_START: '/api/session/start',
  SESSION_STATE: '/api/session/:sessionId/state',
  SESSION_HALT: '/api/session/:sessionId/halt',
  SESSION_RESUME: '/api/session/:sessionId/resume',
  SESSION_CONFIG: '/api/session/config',
  SESSION_SNAPSHOT: '/api/session/snapshot',
  TRADE_ENABLED: '/api/session/trade-enabled',
  AI_CONFIG: '/api/ai/config',
  AI_MODELS: '/api/ai/models',
  SESSION_RISK_LIMITS: '/api/session/risk-limits',
  SESSION_RESET_PAPER: '/api/session/reset-paper',
  SESSION_RESET_SHADOW: '/api/session/reset-shadow',
  SESSION_STOP_LIVE: '/api/session/stop-live',
  SESSION_RETRY_ENGINE: '/api/session/retry-engine',
  SESSION_INITIALIZE: '/api/session/initialize',
};

export function buildApiUrl(endpoint: string, params?: Record<string, string>): string {
  const config = getCurrentApiConfig();
  let url = `${config.BASE_URL}${endpoint}`;

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url = url.replace(`:${key}`, value);
    });
  }

  return url;
}
