export type Role = 'Attack' | 'Risk' | 'PM';

export type Provider = 'GPT5' | 'Gemini' | 'DeepSeek';

export type ProviderState = 'OK' | 'LOW' | 'DEGRADED' | 'OUT';

export type SystemMode = 'NORMAL' | 'COOL_DOWN' | 'EMERGENCY_LANDING';

export interface ProviderHealth {
  state: ProviderState;
  remainingUsdPerDay?: number;
  rpm?: number;
  rps?: number;
  errorRate1m?: number;
  last429At?: number;
  note?: string;
}

export interface QuotaPolicy {
  lowUsdThreshold: number;
  maxRpm: number;
  maxConcurrent: number;
}

export interface RoleBinding {
  role: Role;
  provider: Provider | null;
  fallbackChain: Provider[];
}

export interface EmergencyPolicy {
  autoMitigate: boolean;
  criticalDrawdownPct: number;
  tightenSlPct: number;
  freezeOpen: boolean;
}

export interface SystemState {
  mode: SystemMode;
  roleBindings: Record<Role, RoleBinding>;
  providerHealth: Record<Provider, ProviderHealth>;
  emergency: EmergencyPolicy;
}

export interface RoutingEvent {
  timestamp: number;
  role: Role;
  from: Provider | null;
  to: Provider | null;
  reason: string;
}

