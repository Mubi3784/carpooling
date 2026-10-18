import React from 'react';
import { Bell } from 'lucide-react';
import { usePushNotifications } from '../hooks/usePushNotifications';

const MESSAGES = {
  unsupported: "This browser doesn't support notifications. The unread badge in the app still works.",
  'ios-needs-install': 'On iPhone, add the app to your Home Screen first, then open it from there to turn on notifications.',
  denied: 'Notifications are blocked in your browser settings. Allow them there, then come back.',
};

const NotificationsCard = () => {
  const { state, busy, status, turnOn, turnOff } = usePushNotifications();

  return (
    <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm" aria-labelledby="notif-heading">
      <h2 id="notif-heading" className="flex items-center gap-2 text-base font-bold text-slate-900 mb-1">
        <Bell className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Notifications
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        Notifications are best effort. They work well on Android; on iPhone, add the app to your Home Screen first.
        The unread badge in the app is always the main way to see new messages. Notifications never include message text.
      </p>
      {MESSAGES[state] && <p className="text-sm text-slate-700">{MESSAGES[state]}</p>}
      {state === 'off' && (
        <button type="button" onClick={turnOn} disabled={busy} className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
          Enable notifications
        </button>
      )}
      {state === 'on' && (
        <button type="button" onClick={turnOff} disabled={busy} className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium disabled:opacity-50">
          Turn off notifications
        </button>
      )}
      <p role="status" aria-live="polite" className="text-sm text-slate-700 mt-2">{status}</p>
    </section>
  );
};

export default NotificationsCard;
