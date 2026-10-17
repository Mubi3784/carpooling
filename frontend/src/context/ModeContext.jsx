import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { MODE_KEY, normalizeMode, readMode, writeMode } from '../utils/mode';

// Passenger/Driver mode is a UI filter ONLY. It is NOT a security boundary:
// the backend authorizes every action regardless of the active mode.
const ModeContext = createContext({ mode: 'passenger', setMode: () => {}, isDriver: false });

export const ModeProvider = ({ children }) => {
  const [mode, setModeState] = useState(() => readMode(localStorage));

  const setMode = useCallback((next) => {
    const m = normalizeMode(next);
    setModeState(m);
    writeMode(localStorage, m);
  }, []);

  // Keep tabs in sync
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === MODE_KEY) setModeState(normalizeMode(e.newValue));
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <ModeContext.Provider value={{ mode, setMode, isDriver: mode === 'driver' }}>{children}</ModeContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useMode = () => useContext(ModeContext);
