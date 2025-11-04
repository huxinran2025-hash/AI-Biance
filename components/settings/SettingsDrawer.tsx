import React, { useEffect, useMemo, useState } from 'react';
import EnvironmentSection from './sections/EnvironmentSection';
import ExchangeSection from './sections/ExchangeSection';
import RiskSection from './sections/RiskSection';
import AiBudgetSection from './sections/AiBudgetSection';
import AppearanceSection from './sections/AppearanceSection';
import { PaperTradingSection } from './sections/PaperTradingSection';

interface SettingsDrawerProps {
  open: boolean;
  onClose: () => void;
}

type SectionKey = 'environment' | 'exchange' | 'risk' | 'budget' | 'appearance' | 'paper';

export function SettingsDrawer({ open, onClose }: SettingsDrawerProps) {
  const [activeSection, setActiveSection] = useState<SectionKey>('environment');

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    if (open) {
      setActiveSection('environment');
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const navItems: Array<{ id: SectionKey; label: string }> = useMemo(
    () => [
      { id: 'environment', label: '环境与模式' },
      { id: 'exchange', label: '交易所' },
      { id: 'risk', label: '名义杠杆&风险' },
      { id: 'budget', label: 'AI 预算' },
      { id: 'paper', label: '模拟盘' },
      { id: 'appearance', label: '外观' },
    ],
    [],
  );

  const content = useMemo(() => {
    switch (activeSection) {
      case 'environment':
        return <EnvironmentSection />;
      case 'exchange':
        return <ExchangeSection />;
      case 'risk':
        return <RiskSection />;
      case 'budget':
        return <AiBudgetSection />;
      case 'paper':
        return <PaperTradingSection />;
      case 'appearance':
        return <AppearanceSection />;
      default:
        return null;
    }
  }, [activeSection]);

  if (!open) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.25)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
      }}
      onClick={onClose}
    >
      <div
        className="card"
        style={{
          width: 880,
          maxWidth: '94vw',
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="h2" style={{ fontSize: 22 }}>系统设置</div>
          <button type="button" className="btn btn--solid" onClick={onClose}>
            完成
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', gap: 20 }}>
          <nav className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`tab ${activeSection === item.id ? 'tab--active' : ''}`}
                onClick={() => setActiveSection(item.id)}
                style={{
                  justifyContent: 'flex-start',
                  borderColor: activeSection === item.id ? 'var(--brand)' : 'transparent',
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <section className="card" style={{ padding: 24, minHeight: 480 }}>
            {content}
          </section>
        </div>
      </div>
    </div>
  );
}

export default SettingsDrawer;

