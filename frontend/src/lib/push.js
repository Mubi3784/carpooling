import { getPushPublicKey, pushSubscribe, pushUnsubscribe } from '../services/api';
import { pushSupportState, urlBase64ToUint8Array, subscriptionToPayload } from '../utils/pushSupport';

// Browser glue for Web Push. enablePush() must be called from a user gesture (click).
export const getPushSupport = () => {
  const hasSW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const hasPush = typeof window !== 'undefined' && 'PushManager' in window;
  const hasNotification = typeof window !== 'undefined' && 'Notification' in window;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isIos = /iPad|iPhone|iPod/.test(ua);
  const standalone =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (typeof navigator !== 'undefined' && navigator.standalone === true);
  return pushSupportState({ hasSW, hasPush, hasNotification, isIosNotStandalone: isIos && !standalone });
};

// 'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on'
export const currentPushState = async () => {
  const support = getPushSupport();
  if (support !== 'ok') return support;
  if (Notification.permission === 'denied') return 'denied';
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub && Notification.permission === 'granted' ? 'on' : 'off';
  } catch {
    return 'off';
  }
};

export const enablePush = async () => {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' };

  const res = await getPushPublicKey();
  const key = res.data?.data?.key;
  if (!key) return { ok: false, reason: 'server-not-configured' };

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ||
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }));
  await pushSubscribe(subscriptionToPayload(sub));
  return { ok: true };
};

export const disablePush = async () => {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (sub) {
    await pushUnsubscribe(sub.endpoint).catch(() => {});
    await sub.unsubscribe();
  }
  return { ok: true };
};
