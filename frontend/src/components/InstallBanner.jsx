import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useInstallAction } from '../hooks/useInstallPrompt';
import { isMobilePlatform } from '../lib/installPlatform';
import InstallDialog from './InstallDialog';

const DISMISS_KEY = 'carpool_install_banner_dismissed_at';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

const wasRecentlyDismissed = () => {
  try {
    const value = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(value) && Date.now() - value < DISMISS_MS;
  } catch {
    return false;
  }
};

const InstallBanner = () => {
  const action = useInstallAction();
  const [hidden, setHidden] = useState(wasRecentlyDismissed);

  const eligible = isMobilePlatform(action.platform) || action.platform === 'in-app';
  if (!eligible || action.isInstalled || hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      // Storage unavailable; banner returns next visit.
    }
    setHidden(true);
  };

  const inApp = action.platform === 'in-app';

  return (
    <div className="sticky top-16 z-30 md:hidden bg-emerald-50 border-b border-emerald-100">
      <div className="flex items-center gap-2 px-3 py-1">
        <p className="flex-1 text-sm text-slate-700">
          {inApp ? 'Open in Chrome or Safari to install Carpooling' : 'Get Carpooling on your home screen'}
        </p>
        <button
          type="button"
          onClick={action.onClick}
          className="min-h-11 px-3 text-sm font-semibold text-emerald-700 hover:text-emerald-800 rounded-lg"
        >
          {inApp ? 'How' : 'Get the App'}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install banner"
          className="inline-flex items-center justify-center min-h-11 min-w-11 text-slate-500 hover:text-slate-800 rounded-lg"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
      <InstallDialog
        open={action.dialogOpen}
        onClose={action.closeDialog}
        platform={action.platform}
        note={action.note}
      />
    </div>
  );
};

export default InstallBanner;
