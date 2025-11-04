export type ApiEnv = 'LOCAL' | 'CLOUD_RUN';

const API_CONFIG: Record<ApiEnv, { BASE_URL: string; TIMEOUT: number }> = {
  LOCAL: {
    BASE_URL: 'http://localhost:8080',
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
  SESSION_START: '/api/session/start',
  SESSION_STATE: '/api/session/:sessionId/state',
  SESSION_HALT: '/api/session/:sessionId/halt',
  SESSION_RESUME: '/api/session/:sessionId/resume',
  AI_STRATEGIST: '/api/ai/strategist',
  SESSION_LOGS: '/api/session/:sessionId/logs',
  TRADE_ENABLED: '/api/session/:sessionId/trade-enabled',
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
