import React, { useState } from 'react';
import { Bell, BellRing, CheckCircle2, Info, X } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { bannerViewFor } from '../utils/pushSupport';

const STYLES = {
  off: 'bg-emerald-50 border-emerald-200 text-emerald-900',
  denied: 'bg-amber-50 border-amber-200 text-amber-900',
  'ios-needs-install': 'bg-sky-50 border-sky-200 text-sky-900',
  unsupported: 'bg-slate-100 border-slate-200 text-slate-700',
};

const dismissKey = (state) => `notifBannerDismissed:${state}`;

const readDismissed = (state) => {
  try {
    return localStorage.getItem(dismissKey(state)) === '1';
  } catch {
    return false;
  }
};

// Home banner. The permission prompt only ever starts from the button's onClick.
const NotificationBanner = () => {
  const { state, busy, status, turnOn } = usePushNotifications({ resync: true });
  const [dismissedStates, setDismissedStates] = useState({});

  const dismissed = dismissedStates[state] ?? readDismissed(state);
  const view = bannerViewFor(state, dismissed);
  if (!view) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(dismissKey(state), '1');
    } catch {
      // storage unavailable: dismiss for this visit only
    }
    setDismissedStates((d) => ({ ...d, [state]: true }));
  };

  if (view.kind === 'on') {
    return (
      <div role="status" aria-live="polite" className="mb-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
        <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
        {view.title}
      </div>
    );
  }

  const Icon = view.kind === 'off' ? BellRing : view.kind === 'unsupported' ? Bell : Info;

  return (
    <section
      aria-label="Notifications"
      className={`mb-4 p-3 border rounded-xl flex flex-col sm:flex-row sm:items-center gap-3 ${STYLES[view.kind]}`}
    >
      <div className="flex items-start gap-2 flex-1 min-w-0">
        <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="text-sm min-w-0">
          <p className="font-semibold">{view.title}</p>
          {view.body && <p className="text-xs mt-0.5 opacity-90">{view.body}</p>}
          <p role="status" aria-live="polite" className="text-xs mt-1">{status}</p>
        </div>
      </div>
      {view.cta && (
        <button
          type="button"
          onClick={turnOn}
          disabled={busy}
          className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
        >
          {busy ? 'Turning on...' : view.cta}
        </button>
      )}
      {view.dismissible && (
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss notification message"
          className="self-end sm:self-auto min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl hover:bg-black/5"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </section>
  );
};

export default NotificationBanner;
