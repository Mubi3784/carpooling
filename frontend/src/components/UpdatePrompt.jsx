import React from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Registers the service worker and asks before activating a new version.
// Never reloads on its own.
const UpdatePrompt = () => {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh && !offlineReady) return null;

  return (
    <div
      role="alert"
      className="fixed z-50 left-4 right-4 md:left-auto md:right-4 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] md:bottom-4 md:w-80 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 text-sm"
    >
      {needRefresh ? (
        <>
          <p className="font-semibold text-slate-900 mb-3">New version available</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => updateServiceWorker(true)}
              className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium"
            >
              Reload
            </button>
            <button
              type="button"
              onClick={() => setNeedRefresh(false)}
              className="flex-1 py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-medium"
            >
              Later
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <p className="text-slate-700">
            App ready to open offline. Live data still needs a connection.
          </p>
          <button
            type="button"
            onClick={() => setOfflineReady(false)}
            className="py-1.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default UpdatePrompt;
