import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getAlertCount } from '../services/api';
import { useAuth } from './AuthContext';

const AlertContext = createContext({ count: 0, refresh: () => {} });
const POLL_MS = 20000;

export const AlertProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await getAlertCount();
      setCount(res.data?.data?.count || 0);
    } catch {
      // Badge is best-effort; ignore network/server hiccups
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    tick();
    const timer = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, [isAuthenticated, refresh]);

  const shown = isAuthenticated ? count : 0;
  return <AlertContext.Provider value={{ count: shown, refresh }}>{children}</AlertContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAlerts = () => useContext(AlertContext);
