import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../api-client';
import { useGlobalStore } from '../state/useGlobalStore';
import { usePageVisibility } from '../utils/pageVisibility';
import { useThrottledValue } from '../utils/dashboard/throttle';
import { DashboardState, SessionState, Language } from '../types';

const LOCAL_SESSION_ID = 'local-session';
const DASHBOARD_POLL_MS = 800;

export interface DashboardController {
  dashboard: DashboardState | null;
  session: SessionState | null;
  account: DashboardState['account'] | undefined;
  market: DashboardState['market'] | undefined;
  isInitializing: boolean;
  tradeEnabled: boolean;
  refresh: () => Promise<void>;
  startTrading: () => Promise<boolean>;
  pauseTrading: () => Promise<boolean>;
  toggleTrading: (enabled: boolean) => Promise<boolean>;
  setActiveSymbol: (symbol: string | null) => void;
  activeSymbol: string | null;
  language: Language;
  rightTab: 'chats' | 'logs';
  setRightTab: (tab: 'chats' | 'logs') => void;
}

export function useDashboard(): DashboardController {
  const {
    state,
    dispatch,
    actions: { setActiveSymbol, setRightTab },
  } = useGlobalStore();
  const isVisible = usePageVisibility();
  const [isInitializing, setInitializing] = useState(!state.dashboard);
  const pollerRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string>(state.session?.sid ?? LOCAL_SESSION_ID);
  const fetchingRef = useRef(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    sessionIdRef.current = state.session?.sid ?? sessionIdRef.current;
  }, [state.session?.sid]);

  const hydrate = useCallback(async () => {
    if (fetchingRef.current || cancelledRef.current) {
      return;
    }

    fetchingRef.current = true;
    try {
      const result = await apiClient.getSessionState(sessionIdRef.current);
      if (result.ok && !cancelledRef.current) {
        sessionIdRef.current = result.dashboardState.session?.sid ?? sessionIdRef.current;
        dispatch({ type: 'HYDRATE_DASHBOARD', payload: result.dashboardState });
        setInitializing(false);
      }
    } catch (error) {
      console.error('[Dashboard] Failed to hydrate state', error);
      // 即使 API 调用失败，也尝试从 localStorage 恢复状态
      try {
        const savedState = localStorage.getItem('biance-dashboard-state');
        if (savedState && !cancelledRef.current) {
          const parsed = JSON.parse(savedState);
          // 验证解析后的数据格式
          if (parsed && typeof parsed === 'object' && parsed.session) {
            dispatch({ type: 'HYDRATE_DASHBOARD', payload: parsed });
            setInitializing(false);
            console.log('[Dashboard] Restored state from localStorage');
          }
        }
      } catch (parseError) {
        // SyntaxError 导致白屏，静默处理
        console.warn('[Dashboard] Failed to parse saved state', parseError);
      }
      // 即使恢复失败，也设置初始化完成，避免白屏
      if (!cancelledRef.current) {
        setInitializing(false);
      }
    } finally {
      fetchingRef.current = false;
    }
  }, [dispatch]);

  useEffect(() => {
    cancelledRef.current = false;
    let mounted = true;

    const bootstrap = async () => {
      try {
        await apiClient.startSnapshot();
      } catch (error) {
        console.warn('[Dashboard] startSnapshot failed', error);
        // 即使 startSnapshot 失败，也继续尝试 hydrate
      }

      if (!mounted) return;

      // 确保 hydrate() 失败时不影响快照显示
      try {
        await hydrate();
      } catch (error) {
        console.error('[Dashboard] Bootstrap hydrate failed', error);
        // 设置初始化完成，避免白屏
        if (mounted) {
          setInitializing(false);
        }
      }
    };

    void bootstrap();

    return () => {
      mounted = false;
      cancelledRef.current = true;
    };
  }, [hydrate]);

  useEffect(() => {
    if (!isVisible) {
      if (pollerRef.current !== null) {
        window.clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
      return;
    }

    if (pollerRef.current !== null) {
      return;
    }

    void hydrate();

    pollerRef.current = window.setInterval(() => {
      void hydrate();
    }, DASHBOARD_POLL_MS);

    return () => {
      if (pollerRef.current !== null) {
        window.clearInterval(pollerRef.current);
        pollerRef.current = null;
      }
    };
  }, [isVisible, hydrate]);

  const refresh = useCallback(async () => {
    await hydrate();
  }, [hydrate]);

  const toggleTrading = useCallback(
    async (enabled: boolean) => {
      // 乐观更新：先更新 UI 状态
      const previousSession = state.session;
      const nextSession: SessionState = previousSession
        ? { ...previousSession, tradeEnabled: enabled, status: 'RUNNING' }
        : {
            sid: sessionIdRef.current,
            status: 'RUNNING',
            startedAt: Date.now(),
            lastTickAt: Date.now(),
            tradeEnabled: enabled,
          };
      dispatch({ type: 'SET_SESSION_STATE', payload: nextSession });

      // 调用 API
      const result = await apiClient.setTradeEnabled(enabled);
      
      if (!result.ok) {
        // 失败回滚：恢复到之前的状态
        if (previousSession) {
          dispatch({ type: 'SET_SESSION_STATE', payload: previousSession });
        } else {
          dispatch({ type: 'SET_SESSION_STATE', payload: null });
        }
        
        // 显示错误提示（使用 console 或未来可以集成 toast 组件）
        console.error('[Dashboard] 切换失败，请重试');
        
        // 刷新状态以对齐服务端
        await hydrate();
        return false;
      }

      // 成功：使用服务端返回的状态（如果有）
      if (result.enabled !== undefined && result.enabled !== enabled) {
        // 如果服务端返回的状态与请求的不同，使用服务端状态
        const serverSession: SessionState = previousSession
          ? { ...previousSession, tradeEnabled: result.enabled, status: 'RUNNING' }
          : {
              sid: sessionIdRef.current,
              status: 'RUNNING',
              startedAt: Date.now(),
              lastTickAt: Date.now(),
              tradeEnabled: result.enabled,
            };
        dispatch({ type: 'SET_SESSION_STATE', payload: serverSession });
      }

      // 刷新状态以完全对齐服务端
      await hydrate();
      return true;
    },
    [dispatch, hydrate, state.session],
  );

  const startTrading = useCallback(async () => toggleTrading(true), [toggleTrading]);
  const pauseTrading = useCallback(async () => toggleTrading(false), [toggleTrading]);

  const dashboard = state.dashboard ?? null;
  const throttledAccount = useThrottledValue(dashboard?.account, 500);
  const throttledMarket = useThrottledValue(dashboard?.market, 250);

  const tradeEnabled = state.session?.tradeEnabled ?? false;

  return useMemo(
    () => ({
      dashboard,
      session: state.session ?? null,
      account: throttledAccount,
      market: throttledMarket,
      isInitializing,
      tradeEnabled,
      refresh,
      startTrading,
      pauseTrading,
      toggleTrading,
      setActiveSymbol,
      activeSymbol: state.activeSymbol ?? null,
      language: state.language,
      rightTab: state.rightTab,
      setRightTab,
    }),
    [
      dashboard,
      throttledAccount,
      throttledMarket,
      isInitializing,
      tradeEnabled,
      refresh,
      startTrading,
      pauseTrading,
      toggleTrading,
      setActiveSymbol,
      state.activeSymbol,
      state.language,
      state.session,
      state.rightTab,
      setRightTab,
    ],
  );
}

