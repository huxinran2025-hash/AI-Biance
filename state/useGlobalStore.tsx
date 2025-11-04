import React, { createContext, useReducer, useContext, Dispatch } from 'react';
import { DashboardState, UserSessionConfig, SessionState, Language, RightDrawerSection } from '../types';
import { saveSessionId, clearSessionId } from '../utils/sessionPersistence';

// --- ACTIONS ---
type Action =
  | { type: 'SET_SESSION_CONFIG'; payload: UserSessionConfig | null }
  | { type: 'SET_SESSION_STATE'; payload: SessionState | null }
  | { type: 'HYDRATE_DASHBOARD'; payload: DashboardState | null }
  | { type: 'SET_LANGUAGE'; payload: Language }
  | { type: 'TOGGLE_DRAWER'; payload?: RightDrawerSection }
  | { type: 'OPEN_DRAWER'; payload: { type: string; data?: any } }
  | { type: 'CLOSE_DRAWER' }
  | { type: 'SET_ACTIVE_SYMBOL'; payload: string | null }
  | { type: 'TOGGLE_RISK_SLIDE'; payload?: boolean }
  | { type: 'INITIALIZE_SESSION'; payload: { sid: string; status: 'RUNNING' | 'PAUSED'; tradeEnabled?: boolean } }
  | { type: 'SET_RIGHT_TAB'; payload: 'chats' | 'logs' };

// --- REDUCER ---
interface GlobalState {
  dashboard: DashboardState | null;
  config: UserSessionConfig | null;
  session: SessionState | null;
  drawer: {
    isOpen: boolean;
    activeSection: RightDrawerSection;
    data?: any;
  };
  activeSymbol: string | null;
  riskSlideOpen: boolean;
  language: Language;
  rightTab: 'chats' | 'logs';
}

const initialState: GlobalState = {
  dashboard: null,
  config: null,
  session: null,
  drawer: {
    isOpen: false,
    activeSection: 'AI_DECISION',
    data: null,
  },
  activeSymbol: null,
  riskSlideOpen: false,
  language: 'zh',
  rightTab: 'chats',
};

const globalStateReducer = (state: GlobalState, action: Action): GlobalState => {
  switch (action.type) {
    case 'INITIALIZE_SESSION':
      // This action is for restoring a session ID without the full dashboard state yet.
      // The polling hook will fetch the full state next.
      if (state.session?.sid === action.payload.sid) return state; // Avoid unnecessary updates
      const newInitialSession = {
        sid: action.payload.sid,
        status: action.payload.status,
        startedAt: 0, // Will be hydrated by polling
        lastTickAt: 0, // Will be hydrated by polling
        tradeEnabled: action.payload.tradeEnabled ?? false,
      };
      saveSessionId(action.payload.sid);
      return { ...state, session: newInitialSession };

    case 'SET_SESSION_CONFIG':
      return { ...state, config: action.payload };

    case 'SET_SESSION_STATE': {
      if (action.payload?.sid) {
        saveSessionId(action.payload.sid);
      } else {
        clearSessionId();
      }
      const nextSession = action.payload
        ? { ...action.payload, tradeEnabled: action.payload.tradeEnabled ?? false }
        : null;
      return { ...state, session: nextSession };
    }

    case 'HYDRATE_DASHBOARD':
      if (action.payload && action.payload.session?.sid) {
        saveSessionId(action.payload.session.sid);
        const hydratedSession = {
          ...action.payload.session,
          tradeEnabled: action.payload.session.tradeEnabled ?? false,
        };
        return { ...state, dashboard: action.payload, session: hydratedSession };
      }
      // Handle null payload to clear dashboard
      return { ...state, dashboard: null };

    case 'SET_LANGUAGE':
      return { ...state, language: action.payload };

    case 'TOGGLE_DRAWER':
      if (action.payload) {
        const isOpen = state.drawer.isOpen && state.drawer.activeSection === action.payload ? false : true;
        return { ...state, drawer: { isOpen, activeSection: action.payload, data: null } };
      }
      return { ...state, drawer: { ...state.drawer, isOpen: !state.drawer.isOpen } };

    case 'OPEN_DRAWER':
      const drawerTypeMap: Record<string, RightDrawerSection> = {
        'committeeConfig': 'COMMITTEE_CONFIG',
        'riskModeDetail': 'RISK_MODE',
        'aiLogDetail': 'AI_DECISION',
      };
      const section = drawerTypeMap[action.payload.type] || action.payload.type as RightDrawerSection;
      return { 
        ...state, 
        drawer: { 
          isOpen: true, 
          activeSection: section,
          data: action.payload.data || null,
        } 
      };

    case 'CLOSE_DRAWER':
      return { ...state, drawer: { ...state.drawer, isOpen: false, data: null } };

    case 'SET_ACTIVE_SYMBOL':
      return { ...state, activeSymbol: action.payload };

    case 'TOGGLE_RISK_SLIDE':
      return { ...state, riskSlideOpen: action.payload !== undefined ? action.payload : !state.riskSlideOpen };
      
    case 'SET_RIGHT_TAB':
      return { ...state, rightTab: action.payload };

    default:
      return state;
  }
};

// --- CONTEXT & PROVIDER ---
interface GlobalStoreContextType {
  state: GlobalState;
  dispatch: Dispatch<Action>;
}

const GlobalStoreContext = createContext<GlobalStoreContextType>({
  state: initialState,
  dispatch: () => null,
});

export const GlobalStoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(globalStateReducer, initialState);

  return (
    <GlobalStoreContext.Provider value={{ state, dispatch }}>
      {children}
    </GlobalStoreContext.Provider>
  );
};

// --- HOOK ---
export const useGlobalStore = () => {
  const { state, dispatch } = useContext(GlobalStoreContext);
  
  const actions = {
    setSessionConfig: (config: UserSessionConfig | null) => {
      dispatch({ type: 'SET_SESSION_CONFIG', payload: config });
    },
    setSessionState: (session: SessionState | null) => {
      dispatch({ type: 'SET_SESSION_STATE', payload: session });
    },
    hydrateDashboard: (dashboard: DashboardState) => {
      dispatch({ type: 'HYDRATE_DASHBOARD', payload: dashboard });
    },
    setLanguage: (language: Language) => {
      dispatch({ type: 'SET_LANGUAGE', payload: language });
    },
    openDrawer: (payload: { type: string; data?: any }) => {
      dispatch({ type: 'OPEN_DRAWER', payload });
    },
    closeDrawer: () => {
      dispatch({ type: 'CLOSE_DRAWER' });
    },
    setActiveSymbol: (symbol: string | null) => {
      dispatch({ type: 'SET_ACTIVE_SYMBOL', payload: symbol });
    },
    toggleRiskSlide: (open?: boolean) => {
      dispatch({ type: 'TOGGLE_RISK_SLIDE', payload: open });
    },
    setRightTab: (tab: 'chats' | 'logs') => {
      dispatch({ type: 'SET_RIGHT_TAB', payload: tab });
    },
  };

  return {
    state: {
      ...state,
      sessionConfig: state.config,
      drawerState: state.drawer,
    },
    actions,
    dispatch,
  };
};
