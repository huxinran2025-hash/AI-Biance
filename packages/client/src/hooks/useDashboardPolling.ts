import { useRef, useCallback, useEffect } from 'react';
import { useGlobalStore } from '../state/useGlobalStore';
import { apiClient } from '../api-client';
import { SYSTEM_TIMINGS } from '@biance/shared';
import { usePageVisibility } from '../utils/pageVisibility';

const useDashboardPolling = () => {
  const { state, dispatch } = useGlobalStore();
  const { session } = state;
  const pollingRef = useRef<number | null>(null);
  const isVisible = usePageVisibility();
  const isPollingActive = useRef(false);

  const poll = useCallback(async () => {
    if (!session?.sid) {
      console.warn('[Polling] No session ID, skipping poll.');
      return;
    }
    
    try {
      const response = await apiClient.getSessionState(session.sid);
      if (response.ok && response.dashboardState) {
        dispatch({ type: 'HYDRATE_DASHBOARD', payload: response.dashboardState });
      } else {
         console.error('[Polling] Failed to get valid dashboard state from API.');
      }
    } catch (error) {
      console.error('[Polling] Failed to fetch dashboard state:', error);
      // If session is not found (e.g., 404), stop polling and clear session
      if (error instanceof Error && error.message.includes('404')) {
          dispatch({ type: 'SET_SESSION_STATE', payload: null });
      }
    }
  }, [dispatch, session?.sid]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
      isPollingActive.current = false;
      console.log('[Polling] Stopped.');
    }
  }, []);
  
  const startPolling = useCallback(() => {
    if (isPollingActive.current) return; // Prevent multiple intervals
    
    stopPolling(); // Ensure no multiple intervals are running
    isPollingActive.current = true;
    console.log('[Polling] Started.');

    poll(); // Poll immediately on start
    pollingRef.current = window.setInterval(poll, SYSTEM_TIMINGS.DASHBOARD_POLL_MS);
  }, [poll, stopPolling]);

  useEffect(() => {
    if (session?.status === 'RUNNING' && isVisible) {
        startPolling();
    } else {
        stopPolling();
    }
  }, [session?.status, isVisible, startPolling, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);


  return { startPolling, stopPolling };
};

export { useDashboardPolling };
