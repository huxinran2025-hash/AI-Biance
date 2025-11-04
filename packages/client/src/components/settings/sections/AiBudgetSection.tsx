import React, { useCallback, useEffect, useMemo, useState } from 'react';
import StrategyPresets from '../../StrategyPresets';

type RoleKey = 'attack' | 'risk' | 'pm' | 'news';

interface BudgetState {
  attack: number;
  risk: number;
  pm: number;
  news: number;
}

const STORAGE_KEY = 'biance.ai-budget';

const DEFAULT_BUDGET: BudgetState = {
  attack: 1000,
  risk: 500,
  pm: 500,
  news: 300,
};

const estimateCost = (budget: BudgetState) => {
  const total = budget.attack + budget.risk + budget.pm + budget.news;
  return Math.round(total / 10);
};

export const AiBudgetSection: React.FC = () => {
  const [budget, setBudget] = useState<BudgetState>(() => {
    if (typeof window === 'undefined') {
      return DEFAULT_BUDGET;
    }
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as BudgetState;
        return { ...DEFAULT_BUDGET, ...parsed };
      }
    } catch (error) {
      console.warn('[Settings] Failed to load AI budget from storage', error);
    }
    return DEFAULT_BUDGET;
  });

  const [lastSaved, setLastSaved] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const stored = window.localStorage.getItem(`${STORAGE_KEY}:savedAt`);
    if (stored) {
      setLastSaved(Number(stored));
    }
  }, []);

  const cost = useMemo(() => estimateCost(budget), [budget.attack, budget.news, budget.pm, budget.risk]);

  const applyPreset = useCallback((freq: BudgetState) => {
    setBudget(freq);
  }, []);

  const updateBudget = (role: RoleKey, value: number) => {
    setBudget((prev) => ({
      ...prev,
      [role]: Math.max(0, value),
    }));
  };

  const handleSave = () => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(budget));
      const savedAt = Date.now();
      window.localStorage.setItem(`${STORAGE_KEY}:savedAt`, savedAt.toString());
      setLastSaved(savedAt);
    } catch (error) {
      console.error('[Settings] Failed to persist AI budget', error);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <div className="h2" style={{ fontSize: 18 }}>预设策略</div>
        <p data-muted style={{ marginTop: 6, fontSize: 13 }}>
          选择攻防四角色的调用频率预设，立即同步至预算表格。
        </p>
        <div style={{ marginTop: 16 }}>
          <StrategyPresets
            onApply={(freq) =>
              applyPreset({
                attack: freq.attack,
                risk: freq.risk,
                pm: freq.pm,
                news: freq.news,
              })
            }
          />
        </div>
      </section>

      <section>
        <div className="h2" style={{ fontSize: 18 }}>角色调用频率</div>
        <p data-muted style={{ marginTop: 6, fontSize: 13 }}>
          单位：次/天。根据模型调用费用估算当日预算。
        </p>
        <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
          {(
            [
              { key: 'attack' as RoleKey, label: '进攻 (Attack Strategist)' },
              { key: 'risk' as RoleKey, label: '风控 (Risk Guardian)' },
              { key: 'pm' as RoleKey, label: '管家 (Portfolio Manager)' },
              { key: 'news' as RoleKey, label: '资讯 (News Sentinel)' },
            ]
          ).map((item) => (
            <label key={item.key} style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{item.label}</span>
              <input
                type="number"
                min={0}
                step={50}
                value={budget[item.key]}
                onChange={(event) => updateBudget(item.key, Number(event.target.value))}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid var(--border)',
                  fontSize: 14,
                }}
              />
            </label>
          ))}
        </div>
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 16,
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'var(--elev)',
            padding: '14px 18px',
          }}
        >
          <div>
            <div className="h2" style={{ fontSize: 18 }}>预计日成本</div>
            <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--brand-ink)' }}>≈ ${cost}</div>
            <div data-muted style={{ fontSize: 13 }}>估算公式：(总调用次数 / 10)。可根据价格模型调整。</div>
          </div>
          <button type="button" className="btn btn--solid" onClick={handleSave}>
            保存设置
          </button>
          {lastSaved && (
            <span data-muted style={{ fontSize: 12 }}>
              上次保存：{new Date(lastSaved).toLocaleString()}
            </span>
          )}
        </div>
      </section>
    </div>
  );
};

export default AiBudgetSection;
