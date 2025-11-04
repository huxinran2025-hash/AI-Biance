import React from 'react';

interface BudgetMeterProps {
  usdToday: number;
  usdBudget: number;
  onClick?: () => void;
}

export function BudgetMeter({ usdToday, usdBudget, onClick }: BudgetMeterProps) {
  const ratio = usdBudget ? Math.min(usdToday / usdBudget, 1) : 0;
  const percent = Math.round(ratio * 100);

  const color = percent < 70 ? 'var(--success)' : percent < 90 ? 'var(--warning)' : 'var(--danger)';

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 12px',
        borderRadius: 12,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        boxShadow: 'var(--shadow)',
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
      }}
    >
      <span data-muted style={{ fontSize: 12 }}>今日消耗</span>
      <span className="kpi" style={{ fontSize: 14 }}>
        ${usdToday.toFixed(2)} / ${usdBudget.toFixed(2)}
      </span>
      <div style={{ width: 96, height: 6, borderRadius: 999, background: 'var(--brand-soft)', overflow: 'hidden' }}>
        <div style={{ width: `${percent}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
    </button>
  );
}

export default BudgetMeter;


