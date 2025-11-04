import React, { useEffect } from 'react';
import { GlobalStoreProvider, useGlobalStore } from './state/useGlobalStore';
import TradeTerminalPage from './pages/TradeTerminalPage';
import { loadSessionId } from './utils/sessionPersistence';

const AppInitializer: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { dispatch } = useGlobalStore();

  useEffect(() => {
    // On initial app load, try to restore the session from localStorage
    const savedSessionId = loadSessionId();
    if (savedSessionId) {
      console.log(`Restoring session: ${savedSessionId}`);
      // We don't have the full session state, but we have the ID.
      // The polling hook will use this ID to fetch the full state.
      dispatch({
        type: 'INITIALIZE_SESSION',
        payload: { sid: savedSessionId, status: 'RUNNING', tradeEnabled: false } // Assume running, polling will correct if not
      });
    }
  }, [dispatch]);

  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <GlobalStoreProvider>
      <AppInitializer>
        <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--ink)' }}>
          <TradeTerminalPage />
        </div>
      </AppInitializer>
    </GlobalStoreProvider>
  );
};

export default App;
