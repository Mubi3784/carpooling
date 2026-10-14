import React, { useEffect, useState } from 'react';
import { Share, X, Download } from 'lucide-react';

const DISMISS_KEY = 'carpool_install_dismissed_at';
const DISMISS_MS = 14 * 24 * 60 * 60 * 1000;

const isStandalone = () =>
  (typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches) ||
  window.navigator.standalone === true;

const isIosSafari = () => {
  const ua = window.navigator.userAgent || '';
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
  return isIos && /safari/i.test(ua) && !/crios|fxios|edgios/i.test(ua);
};

const wasRecentlyDismissed = () => {
  try {
    const value = Number(localStorage.getItem(DISMISS_KEY));
    return Boolean(value) && Date.now() - value < DISMISS_MS;
  } catch {
    return false;
  }
};

const rememberDismiss = () => {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage unavailable (private mode); the prompt will just show again later.
  }
};

const InstallPrompt = () => {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(() => isStandalone());
  const [hidden, setHidden] = useState(() => wasRecentlyDismissed());
  const [showIos] = useState(() => isIosSafari());

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = () => {
    rememberDismiss();
    setHidden(true);
  };

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await deferredPrompt.userChoice;
    } finally {
      // The event can only be used once.
      setDeferredPrompt(null);
    }
  };

  if (installed || hidden) return null;
  if (!deferredPrompt && !showIos) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="install-prompt-title"
      className="fixed z-40 left-4 right-4 md:left-auto md:right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 md:w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 text-sm"
    >
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss install prompt"
        className="absolute top-2 right-2 p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
      <h2 id="install-prompt-title" className="font-semibold text-slate-900 mb-1 pr-6">
        Install Carpooling
      </h2>
      {deferredPrompt ? (
        <>
          <p className="text-slate-600 mb-3">Add the app to your home screen for quick access.</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleInstall}
              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium"
            >
              <Download className="w-4 h-4" aria-hidden="true" />
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
            >
              Not now
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-slate-600 mb-3">
            Tap the Share button <Share className="inline w-4 h-4 align-text-bottom" aria-hidden="true" />{' '}
            then choose “Add to Home Screen”.
          </p>
          <button
            type="button"
            onClick={dismiss}
            className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
          >
            Got it
          </button>
        </>
      )}
    </div>
  );
};

export default InstallPrompt;
