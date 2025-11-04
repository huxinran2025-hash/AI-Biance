import React from 'react';
import { useGlobalStore } from '../../state/useGlobalStore';
import { t } from '../../i18n';
import AiDecisionDetailDrawer from './sections/AiDecisionDetailDrawer';
import CommitteeConfigDrawer from './sections/CommitteeConfigDrawer';
import RiskModeDetailDrawer from './sections/RiskModeDetailDrawer';
import { RightDrawerSection, Language, DashboardState } from '@biance/shared';

interface RightDrawerProps {
    drawer?: { isOpen: boolean; activeSection: RightDrawerSection; data?: any };
    language?: Language;
    dashboard?: DashboardState | null;
    onClose?: () => void;
}

const RightDrawer: React.FC<RightDrawerProps> = ({ drawer: drawerProp, language: languageProp, dashboard: dashboardProp, onClose: onCloseProp }) => {
    const store = useGlobalStore();
    const drawer = drawerProp || store.state.drawerState;
    const language = languageProp || store.state.language;
    const dashboard = dashboardProp || store.state.dashboard;

    const handleClose = () => {
        if (onCloseProp) {
            onCloseProp();
        } else {
            store.actions.closeDrawer();
        }
    };

    const sections: Record<RightDrawerSection, { title: string; component: React.ReactNode }> = {
        AI_DECISION: { title: t('aiDecisionDetail', language), component: <AiDecisionDetailDrawer /> },
        COMMITTEE_CONFIG: { title: t('committeeConfig', language), component: <CommitteeConfigDrawer /> },
        RISK_MODE: { title: t('riskModeDetail', language), component: <RiskModeDetailDrawer /> },
    };
    
    const currentSection = sections[drawer.activeSection];

    const overlayStyle: React.CSSProperties = {
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 9, 21, 0.7)',
        backdropFilter: 'blur(6px)',
        transition: 'opacity 0.2s ease',
        opacity: drawer.isOpen ? 1 : 0,
        pointerEvents: drawer.isOpen ? 'auto' : 'none',
        zIndex: 40,
    };

    const drawerStyle: React.CSSProperties = {
        position: 'fixed',
        top: 0,
        right: 0,
        height: '100%',
        width: '100%',
        maxWidth: 360,
        borderLeft: '1px solid var(--border)',
        background: 'var(--card)',
        boxShadow: 'var(--shadow)',
        zIndex: 50,
        transform: drawer.isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease-in-out',
        display: 'flex',
        flexDirection: 'column',
    };

    const headerStyle: React.CSSProperties = {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--elev)',
    };

    const closeButtonStyle: React.CSSProperties = {
        height: 32,
        width: 32,
        borderRadius: '50%',
        border: '1px solid transparent',
        background: 'transparent',
        color: 'var(--ink-muted)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
    };

    return (
        <>
            <div style={overlayStyle} onClick={handleClose} />
            <div style={drawerStyle}>
                <header style={headerStyle}>
                    <h2 className="h2" style={{ fontSize: 16, color: 'var(--ink)' }}>{currentSection.title}</h2>
                    <button
                        onClick={handleClose}
                        style={closeButtonStyle}
                        aria-label="关闭侧边栏"
                        onMouseEnter={(event) => {
                            event.currentTarget.style.color = 'var(--ink)';
                            event.currentTarget.style.borderColor = 'var(--border)';
                        }}
                        onMouseLeave={(event) => {
                            event.currentTarget.style.color = 'var(--ink-muted)';
                            event.currentTarget.style.borderColor = 'transparent';
                        }}
                    >
                        ×
                    </button>
                </header>
                <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                    <div className="card" style={{ padding: 16, borderRadius: 16 }}>
                        {currentSection.component}
                    </div>
                </div>
            </div>
        </>
    );
};

export default RightDrawer;
