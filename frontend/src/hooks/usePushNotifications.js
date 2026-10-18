import { useCallback, useEffect, useState } from 'react';
import { currentPushState, enablePush, disablePush } from '../lib/push';
import { pushSubscribe } from '../services/api';
import { subscriptionToPayload } from '../utils/pushSupport';

const RESYNC_KEY = 'pushResyncedAt';

const session = () => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

// Silently refresh an existing subscription once per session. Never asks for permission.
const resyncOncePerSession = async () => {
  const s = session();
  if (s?.getItem(RESYNC_KEY)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    s?.setItem(RESYNC_KEY, String(Date.now()));
    await pushSubscribe(subscriptionToPayload(sub));
  } catch {
    // best effort
  }
};

// Shared push state machine (Profile card and Home banner).
// turnOn must only be called from a user gesture (it triggers the permission prompt).
export const usePushNotifications = ({ resync = false } = {}) => {
  const [state, setState] = useState('loading');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');

  useEffect(() => {
    let alive = true;
    currentPushState().then((s) => {
      if (!alive) return;
      setState(s);
      if (resync && s === 'on') resyncOncePerSession();
    });
    return () => { alive = false; };
  }, [resync]);

  const turnOn = useCallback(async () => {
    setBusy(true);
    setStatus('');
    try {
      const r = await enablePush();
      if (r.ok) {
        setState('on');
        setStatus('Notifications are on.');
      } else if (r.reason === 'denied') {
        setState('denied');
      } else if (r.reason === 'server-not-configured') {
        setStatus("Notifications aren't available right now.");
      } else {
        setStatus('Permission was not given, so notifications stay off.');
      }
    } catch {
      setStatus("Couldn't turn on notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  const turnOff = useCallback(async () => {
    setBusy(true);
    setStatus('');
    try {
      await disablePush();
      setState('off');
      setStatus('Notifications are off.');
    } catch {
      setStatus("Couldn't turn off notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { state, busy, status, turnOn, turnOff };
};

export default usePushNotifications;
