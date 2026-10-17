// Returns 'ok' | 'ios-needs-install' | 'unsupported'
export const pushSupportState = ({ hasSW, hasPush, hasNotification, isIosNotStandalone } = {}) => {
  if (isIosNotStandalone) return 'ios-needs-install';
  return hasSW && hasPush && hasNotification ? 'ok' : 'unsupported';
};

export const urlBase64ToUint8Array = (b64) => {
  const padding = '='.repeat((4 - (b64.length % 4)) % 4);
  const base64 = (b64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
};

export const subscriptionToPayload = (sub) => {
  const json = typeof sub.toJSON === 'function' ? sub.toJSON() : sub;
  return {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
  };
};
