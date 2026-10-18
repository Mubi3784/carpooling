// Returns 'ok' | 'ios-needs-install' | 'unsupported'
export const pushSupportState = ({ hasSW, hasPush, hasNotification, isIosNotStandalone } = {}) => {
  if (isIosNotStandalone) return 'ios-needs-install';
  return hasSW && hasPush && hasNotification ? 'ok' : 'unsupported';
};

// Pure view-model for the Home banner. state: 'loading' | 'off' | 'on' | 'denied' | 'ios-needs-install' | 'unsupported'
// dismissed: true when the user closed the (dismissible) banner for this state. Returns null to render nothing.
export const bannerViewFor = (state, dismissed = false) => {
  switch (state) {
    case 'off':
      return {
        kind: 'off',
        title: 'Get notified about new messages and ride requests',
        body: 'Notifications never include message text.',
        cta: 'Turn On Notifications',
        dismissible: false,
      };
    case 'on':
      return { kind: 'on', title: 'Notifications Enabled', body: '', cta: null, dismissible: false };
    case 'denied':
      return dismissed ? null : {
        kind: 'denied',
        title: 'Notifications are blocked',
        body: 'Android/Chrome: tap the lock icon, then Permissions, then Notifications, then Allow. iPhone: Settings, then Notifications, then this app. Desktop: open site settings, allow Notifications, then reload.',
        cta: null,
        dismissible: true,
      };
    case 'ios-needs-install':
      return dismissed ? null : {
        kind: 'ios-needs-install',
        title: 'Add to Home Screen to turn on notifications',
        body: 'On iPhone, tap Share, then Add to Home Screen, then open the app from your Home Screen.',
        cta: null,
        dismissible: true,
      };
    case 'unsupported':
      return dismissed ? null : {
        kind: 'unsupported',
        title: "This browser can't show notifications",
        body: "You'll still see the unread badge in the app.",
        cta: null,
        dismissible: true,
      };
    default:
      return null;
  }
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
