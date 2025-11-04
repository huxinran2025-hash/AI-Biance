import { AIModelId, UserAIConfig } from '../types';

const MODEL_REGISTRY: Record<AIModelId, { label: string; description: string }> = {
  'gemini-2.5-pro': {
    label: 'Gemini 2.5 Pro',
    description: '风控解释力强，擅长审视风险并生成理由说明。',
  },
  'deepseek-reasoner': {
    label: 'DeepSeek Reasoner',
    description: '倾向顺势与组合平衡，适合仓位管理与锁盈。',
  },
  'gpt-5': {
    label: 'GPT-5',
    description: '进攻型，善于捕捉行情机会并提出交易计划。',
  },
};

const DEFAULT_AI_CONFIG: UserAIConfig = {
  momentum_model: 'gpt-5',
  risk_model: 'gemini-2.5-pro',
  position_model: 'deepseek-reasoner',
  updatedAt: Date.now(),
};

const store = new Map<string, UserAIConfig>();

const DEFAULT_USER_ID = 'default';

export function getAvailableAiModels() {
  return MODEL_REGISTRY;
}

export function getUserAIConfig(userId: string = DEFAULT_USER_ID): UserAIConfig {
  if (!store.has(userId)) {
    store.set(userId, { ...DEFAULT_AI_CONFIG });
  }
  return store.get(userId)!;
}

export function updateUserAIConfig(partial: Partial<Omit<UserAIConfig, 'updatedAt'>>, userId: string = DEFAULT_USER_ID): UserAIConfig {
  const current = getUserAIConfig(userId);
  const next: UserAIConfig = {
    ...current,
    ...partial,
    updatedAt: Date.now(),
  };
  validateUserAIConfig(next);
  store.set(userId, next);
  return next;
}

function validateUserAIConfig(config: UserAIConfig) {
  const keys: Array<keyof UserAIConfig> = ['momentum_model', 'risk_model', 'position_model'];
  keys.forEach(key => {
    if (!MODEL_REGISTRY[config[key] as AIModelId]) {
      throw new Error(`Invalid AI model id: ${config[key]}`);
    }
  });
}

