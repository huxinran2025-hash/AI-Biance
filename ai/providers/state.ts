import {
  EmergencyPolicy,
  Provider,
  ProviderHealth,
  ProviderState,
  Role,
  RoleBinding,
  RoutingEvent,
  SystemMode,
  SystemState,
} from './types.js';

const ROLE_PRIORITY: Role[] = ['Attack', 'Risk', 'PM'];

export function pickProviderForRole(role: Role, state: SystemState): Provider | null {
  const binding = state.roleBindings[role];
  for (const provider of binding.fallbackChain) {
    const health = state.providerHealth[provider];
    if (!health) continue;
    if (health.state === 'OUT') continue;
    return provider;
  }
  return null;
}

export interface RebalanceResult {
  state: SystemState;
  events: RoutingEvent[];
}

export function rebalanceBindings(state: SystemState): RebalanceResult {
  const next = structuredClone(state);
  const events: RoutingEvent[] = [];

  for (const role of ROLE_PRIORITY) {
    const current = next.roleBindings[role].provider;
    const chosen = pickProviderForRole(role, next);
    if (current !== chosen) {
      events.push({
        timestamp: Date.now(),
        role,
        from: current ?? null,
        to: chosen ?? null,
        reason: current === null ? 'initial_bind' : 'auto_rebind',
      });
      next.roleBindings[role].provider = chosen;
    }
  }

  next.mode = deriveSystemMode(next);
  return { state: next, events };
}

export function deriveSystemMode(state: SystemState): SystemMode {
  const providers = ROLE_PRIORITY.map((role) => state.roleBindings[role].provider);
  if (providers.some((p) => p === null)) {
    return 'EMERGENCY_LANDING';
  }

  const attackProvider = state.roleBindings.Attack.provider!;
  const riskProvider = state.roleBindings.Risk.provider!;
  const attackState = state.providerHealth[attackProvider]?.state;
  const riskState = state.providerHealth[riskProvider]?.state;

  if (attackState === 'OUT' || riskState === 'OUT') {
    return 'COOL_DOWN';
  }

  const anyDegraded = providers.find((provider) => {
    const status = provider ? state.providerHealth[provider]?.state : 'OUT';
    return status === 'LOW' || status === 'DEGRADED';
  });

  return anyDegraded ? 'COOL_DOWN' : 'NORMAL';
}

export interface DegradeDirectives {
  freezeOpen: boolean;
  maxLeverageMultiplier: number;
  tightenStopMultiplier: number;
  autoMitigate: boolean;
}

export function deriveDegradeDirectives(mode: SystemMode, policy: EmergencyPolicy): DegradeDirectives {
  if (mode === 'NORMAL') {
    return {
      freezeOpen: false,
      maxLeverageMultiplier: 1,
      tightenStopMultiplier: 1,
      autoMitigate: false,
    };
  }

  if (mode === 'COOL_DOWN') {
    return {
      freezeOpen: true,
      maxLeverageMultiplier: 1,
      tightenStopMultiplier: policy.tightenSlPct,
      autoMitigate: false,
    };
  }

  return {
    freezeOpen: policy.freezeOpen,
    maxLeverageMultiplier: 1,
    tightenStopMultiplier: policy.tightenSlPct,
    autoMitigate: policy.autoMitigate,
  };
}

export function updateProviderHealth(
  state: SystemState,
  provider: Provider,
  health: Partial<ProviderHealth>,
): SystemState {
  const next = structuredClone(state);
  next.providerHealth[provider] = {
    ...next.providerHealth[provider],
    ...health,
  };
  next.mode = deriveSystemMode(next);
  return next;
}

export function createDefaultState(): SystemState {
  const roleBindings: Record<Role, RoleBinding> = {
    Attack: { role: 'Attack', provider: 'GPT5', fallbackChain: ['GPT5', 'Gemini', 'DeepSeek'] },
    Risk: { role: 'Risk', provider: 'DeepSeek', fallbackChain: ['DeepSeek', 'Gemini', 'GPT5'] },
    PM: { role: 'PM', provider: 'Gemini', fallbackChain: ['Gemini', 'DeepSeek', 'GPT5'] },
  };

  const providerHealth = {
    GPT5: { state: 'OK' as ProviderState },
    Gemini: { state: 'OK' as ProviderState },
    DeepSeek: { state: 'OK' as ProviderState },
  };

  return {
    mode: 'NORMAL',
    roleBindings,
    providerHealth,
    emergency: {
      autoMitigate: true,
      criticalDrawdownPct: 3,
      tightenSlPct: 0.8,
      freezeOpen: true,
    },
  };
}

