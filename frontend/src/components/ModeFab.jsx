import React from 'react';
import { Link } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useMode } from '../context/ModeContext';
import { useAuth } from '../context/AuthContext';
import { fabConfig } from '../utils/mode';

// One mode-aware "+" action. Sits above the 56px bottom nav on mobile.
const ModeFab = () => {
  const { mode } = useMode();
  const { isAuthenticated } = useAuth();
  const { label, to } = fabConfig(mode);

  return (
    <Link
      to={isAuthenticated ? to : '/login'}
      state={isAuthenticated ? undefined : { from: { pathname: to } }}
      aria-label={label}
      className="fixed right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-6 z-30 flex items-center gap-2 h-12 pl-3 pr-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full shadow-lg text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
    >
      <Plus className="w-5 h-5" aria-hidden="true" />
      <span>{label}</span>
    </Link>
  );
};

export default ModeFab;
