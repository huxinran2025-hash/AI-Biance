import React from 'react';
import { useGlobalStore } from '../state/useGlobalStore';
import { Language } from '../types';

interface LanguageSwitcherProps {
  className?: string;
}

const LanguageSwitcher: React.FC<LanguageSwitcherProps> = ({ className = '' }) => {
  const { state: { language }, dispatch } = useGlobalStore();

  const setLanguage = (lang: Language) => {
    dispatch({ type: 'SET_LANGUAGE', payload: lang });
  };

  const renderButton = (code: Language, label: string) => {
    const isActive = language === code;
    return (
      <button
        key={code}
        type="button"
        onClick={() => setLanguage(code)}
        className={`tab ${isActive ? 'tab--active' : ''}`}
        style={{
          padding: '6px 14px',
          borderRadius: 999,
          borderColor: isActive ? 'var(--brand)' : 'transparent',
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--elev)',
        borderRadius: 999,
        padding: 4,
        border: '1px solid var(--border)',
      }}
    >
      {renderButton('zh', '中')}
    </div>
  );
};

export default LanguageSwitcher;
