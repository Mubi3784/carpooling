import React from 'react';
import { WifiOff } from 'lucide-react';
import useOnlineStatus from '../hooks/useOnlineStatus';

const OfflineBanner = () => {
  const isOnline = useOnlineStatus();
  if (isOnline) return null;

  const handleRetry = () => {
    if (navigator.onLine) window.location.reload();
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full bg-amber-100 text-amber-900 border-b border-amber-200 text-xs sm:text-sm px-4 py-2 flex items-center justify-center gap-3"
    >
      <WifiOff className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      <span>You're offline. Live rides and road info can't load.</span>
      <button
        type="button"
        onClick={handleRetry}
        className="px-3 py-1 bg-white border border-amber-300 rounded-lg font-semibold hover:bg-amber-50"
      >
        Retry
      </button>
    </div>
  );
};

export default OfflineBanner;
