import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getChatUnread } from '../services/api';
import { useAuth } from './AuthContext';

const ChatUnreadContext = createContext({ count: 0, refresh: () => {} });
const POLL_MS = 20000;

export const ChatUnreadProvider = ({ children }) => {
  const { isAuthenticated } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const res = await getChatUnread();
      setCount(res.data?.data?.unreadMessages || 0);
    } catch {
      // Badge is best-effort
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

  return (
    <ChatUnreadContext.Provider value={{ count: isAuthenticated ? count : 0, refresh }}>
      {children}
    </ChatUnreadContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useChatUnread = () => useContext(ChatUnreadContext);
