import React, { useState } from 'react';

type PresetKey = 'lean' | 'moderate' | 'heavy';

const PRESETS: Record<
  PresetKey,
  {
    label: string;
    tips: string;
    freq: { attack: number; risk: number; pm: number; news: number };
  }
> = {
  lean: {
    label: '精简',
    tips: '事件触发',
    freq: { attack: 300, risk: 300, pm: 300, news: 300 },
  },
  moderate: {
    label: '均衡',
    tips: '较频繁',
    freq: { attack: 1000, risk: 300, pm: 300, news: 1000 },
  },
  heavy: {
    label: '高频',
    tips: '高频压力测试',
    freq: { attack: 5000, risk: 1000, pm: 1000, news: 5000 },
  },
};

interface StrategyPresetsProps {
  onApply: (freq: { attack: number; risk: number; pm: number; news: number }) => void;
  disabled?: boolean;
}

export function StrategyPresets({ onApply, disabled }: StrategyPresetsProps) {
  const [active, setActive] = useState<PresetKey | null>(null);

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {(Object.keys(PRESETS) as PresetKey[]).map((key) => {
        const preset = PRESETS[key];
        const isActive = active === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            className={`tab ${isActive ? 'tab--active' : ''}`}
            style={{
              opacity: disabled ? 0.5 : 1,
              cursor: disabled ? 'not-allowed' : 'pointer',
            }}
            onClick={() => {
              if (disabled) return;
              setActive(key);
              onApply(preset.freq);
            }}
            title={preset.tips}
            aria-pressed={isActive}
          >
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}

export default StrategyPresets;


