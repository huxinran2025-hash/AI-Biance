import React, { useEffect, useState } from 'react';

type FontSizeOption = 'medium' | 'large';

const FONT_SIZE_STORAGE_KEY = 'biance.font-size';

export const AppearanceSection: React.FC = () => {
  const [fontSize, setFontSize] = useState<FontSizeOption>(() => {
    if (typeof window === 'undefined') {
      return 'medium';
    }
    const stored = window.localStorage.getItem(FONT_SIZE_STORAGE_KEY) as FontSizeOption | null;
    return stored ?? 'medium';
  });

  useEffect(() => {
    const value = fontSize === 'large' ? '18px' : '16px';
    if (typeof document !== 'undefined') {
      document.documentElement.style.setProperty('--font-size-base', value);
    }
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSize);
    }
  }, [fontSize]);

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <div className="h2" style={{ fontSize: 18 }}>主题模式</div>
        <p data-muted style={{ marginTop: 6, fontSize: 13 }}>
          深色主题将在后续版本开放。目前默认使用 Light 模式。
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px solid var(--brand)',
              background: 'var(--brand-soft)',
              fontWeight: 600,
              color: 'var(--ink)',
            }}
          >
            <input type="radio" name="theme" checked readOnly />
            Light
          </label>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 12,
              border: '1px dashed var(--border)',
              color: 'var(--ink-muted)',
              fontWeight: 600,
              cursor: 'not-allowed',
            }}
          >
            <input type="radio" name="theme" disabled />
            Dark（预留）
          </label>
        </div>
      </section>

      <section>
        <div className="h2" style={{ fontSize: 18 }}>字号</div>
        <p data-muted style={{ marginTop: 6, fontSize: 13 }}>
          Medium 建议用于桌面端调试，Large 适合演示或远距离查看。
        </p>
        <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
          {[
            { value: 'medium' as FontSizeOption, label: '中号 (16px)' },
            { value: 'large' as FontSizeOption, label: '大号 (18px)' },
          ].map((option) => (
            <label
              key={option.value}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
                borderRadius: 12,
                border: fontSize === option.value ? '1px solid var(--brand)' : '1px solid var(--border)',
                background: fontSize === option.value ? 'var(--brand-soft)' : 'var(--card)',
                fontWeight: 600,
                color: 'var(--ink)',
                cursor: 'pointer',
              }}
            >
              <input
                type="radio"
                name="font-size"
                value={option.value}
                checked={fontSize === option.value}
                onChange={() => setFontSize(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AppearanceSection;
