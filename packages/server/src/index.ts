import express from 'express';
import cors from 'cors';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import type { AccountRiskLimits, DashboardState, UserAIConfig, UserSessionConfig } from './types';
import {
  startBackend,
  stopBackend,
  getDashboardState,
  updateSessionConfig,
  getCurrentConfig,
  startSnapshot,
  setTradeEnabled,
  getCurrentAiConfig,
  updateUserAiConfig,
  getAiModelRegistry,
  updateRiskLimits,
  resetPaperAccount,
  resetShadowAccount,
  stopLiveTrading,
  retryEngineInitialization,
  initializeBackend,
} from './backend/api.js';
import { DEFAULT_SESSION_CONFIG, SYSTEM_TIMINGS } from './constants';

// Provide a minimal browser-like global for legacy modules that expect window APIs
const globalAny = globalThis as any;
if (!globalAny.window) {
  globalAny.window = globalAny;
}
if (!globalAny.window.setInterval) {
  globalAny.window.setInterval = setInterval.bind(globalAny);
}
if (!globalAny.window.clearInterval) {
  globalAny.window.clearInterval = clearInterval.bind(globalAny);
}
if (!globalAny.window.setTimeout) {
  globalAny.window.setTimeout = setTimeout.bind(globalAny);
}
if (!globalAny.window.clearTimeout) {
  globalAny.window.clearTimeout = clearTimeout.bind(globalAny);
}
if (typeof globalAny.window.CustomEvent !== 'function') {
  globalAny.window.CustomEvent = class CustomEvent<T = unknown> {
    type: string;
    detail: T | null;
    constructor(type: string, init?: { detail?: T }) {
      this.type = type;
      this.detail = init?.detail ?? null;
    }
  };
}
if (typeof globalAny.window.dispatchEvent !== 'function') {
  globalAny.window.dispatchEvent = () => false;
}
if (typeof globalAny.window.addEventListener !== 'function') {
  globalAny.window.addEventListener = () => void 0;
}
if (typeof globalAny.window.removeEventListener !== 'function') {
  globalAny.window.removeEventListener = () => void 0;
}

type ApiResponse<T> = { ok: true; data: T } | { ok: false; error: string };

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT || 4000);
let backendStarted = false;

function ensureBackend(config?: UserSessionConfig) {
  if (!backendStarted) {
    const startConfig = config ?? DEFAULT_SESSION_CONFIG;
    startBackend(startConfig);
    backendStarted = true;
  }
}

app.get('/api/dashboard-state', async (_req, res) => {
  try {
    ensureBackend();
    const state = await getDashboardState();
    res.json({ ok: true, data: state } satisfies ApiResponse<DashboardState>);
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) } satisfies ApiResponse<DashboardState>);
  }
});

app.get('/api/session/:sessionId/state', async (req, res) => {
  try {
    ensureBackend();
    const state = await getDashboardState();
    res.json({
      ok: true,
      data: {
        sessionId: req.params.sessionId,
        dashboardState: state,
      },
    });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post('/api/session/start', async (req, res) => {
  try {
    const config = req.body as UserSessionConfig | undefined;
    ensureBackend(config);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post('/api/session/:sessionId/halt', async (_req, res) => {
  try {
    if (backendStarted) {
      stopBackend();
      backendStarted = false;
    }
    res.json({ ok: true, message: 'Session halted' });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post('/api/session/:sessionId/resume', async (_req, res) => {
  try {
    ensureBackend();
    res.json({ ok: true, message: 'Session resumed' });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.get('/api/session/config', (_req, res) => {
  try {
    ensureBackend();
    res.json({ ok: true, data: getCurrentConfig() });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.patch('/api/session/config', async (req, res) => {
  try {
    ensureBackend();
    const patch = req.body as Partial<UserSessionConfig>;
    await updateSessionConfig(patch);
    res.json({ ok: true, data: getCurrentConfig() });
  } catch (error) {
    res.status(400).json({ ok: false, error: String(error) });
  }
});

app.post('/api/session/snapshot', (req, res) => {
  try {
    ensureBackend();
    const config = (req.body as { config?: UserSessionConfig } | undefined)?.config;
    startSnapshot(config);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post('/api/session/trade-enabled', (req, res) => {
  try {
    ensureBackend();
    const { enabled } = req.body as { enabled: boolean };
    setTradeEnabled(Boolean(enabled));
    res.json({ ok: true, enabled: Boolean(enabled) });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.get('/api/ai/config', (_req, res) => {
  try {
    ensureBackend();
    const config = getCurrentAiConfig();
    res.json({ ok: true, data: config });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.patch('/api/ai/config', (req, res) => {
  try {
    ensureBackend();
    const patch = req.body as Partial<UserAIConfig>;
    const updated = updateUserAiConfig(patch);
    res.json({ ok: true, data: updated });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.get('/api/ai/models', (_req, res) => {
  try {
    ensureBackend();
    const models = getAiModelRegistry();
    res.json({ ok: true, data: models });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.patch('/api/session/risk-limits', (req, res) => {
  try {
    ensureBackend();
    const patch = req.body as Partial<AccountRiskLimits>;
    const updated = updateRiskLimits(patch);
    res.json({ ok: true, data: updated });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post('/api/session/reset-paper', async (_req, res) => {
  try {
    ensureBackend();
    await resetPaperAccount();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post('/api/session/reset-shadow', async (_req, res) => {
  try {
    ensureBackend();
    await resetShadowAccount();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post('/api/session/stop-live', async (_req, res) => {
  try {
    ensureBackend();
    await stopLiveTrading();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post('/api/session/retry-engine', async (_req, res) => {
  try {
    ensureBackend();
    const success = await retryEngineInitialization();
    res.json({ ok: success });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

app.post('/api/session/initialize', (_req, res) => {
  try {
    ensureBackend();
    initializeBackend();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: String(error) });
  }
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ type: 'connected' }));
});

setInterval(async () => {
  if (wss.clients.size === 0) {
    return;
  }
  try {
    ensureBackend();
    const state = await getDashboardState();
    const payload = JSON.stringify({ type: 'dashboard:update', data: state });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) {
        client.send(payload);
      }
    }
  } catch (error) {
    console.error('[Server] Failed to broadcast dashboard state', error);
  }
}, SYSTEM_TIMINGS.DASHBOARD_POLL_MS);

httpServer.listen(PORT, () => {
  console.log(`✅ BIANCE backend server listening on http://localhost:${PORT}`);
});
