export const NAV_ITEMS = [
  { key: 'home', label: 'Home', to: '/', protected: false },
  { key: 'active', label: 'Active Rides', to: '/active', protected: true },
  { key: 'chat', label: 'Chat', to: '/chat', protected: true },
  { key: 'profile', label: 'Profile', to: '/profile', protected: true },
];

// Badge number per nav item: pending offers/requests on Active Rides, unread messages on Chat.
export const badgeFor = (itemKey, { alerts = 0, chatUnread = 0 } = {}) => {
  if (itemKey === 'active') return alerts > 0 ? alerts : 0;
  if (itemKey === 'chat') return chatUnread > 0 ? chatUnread : 0;
  return 0;
};

// Post-login redirect: only same-origin paths, never the auth pages themselves.
export const safeRedirectPath = (from) => {
  let path = from;
  if (from && typeof from === 'object') {
    path = `${from.pathname ?? ''}${from.search ?? ''}${from.hash ?? ''}`;
  }
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\\\u0000-\u001f\u007f]/.test(path)) return null;
  if (/^\/(login|register)(?:[/?#]|$)/i.test(path)) return null;
  return path;
};

const REDIRECT_KEY = 'postAuthRedirect';
const store = () => {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
};

export const savePostAuthRedirect = (from) => {
  const path = safeRedirectPath(from);
  try {
    // No valid target on this visit: clear any stale one so a later plain login goes home.
    if (path) store()?.setItem(REDIRECT_KEY, path);
    else store()?.removeItem(REDIRECT_KEY);
  } catch { /* storage unavailable */ }
};

// Reads then clears the saved target.
export const consumePostAuthRedirect = () => {
  const s = store();
  if (!s) return null;
  try {
    const value = s.getItem(REDIRECT_KEY);
    s.removeItem(REDIRECT_KEY);
    return safeRedirectPath(value);
  } catch {
    return null;
  }
};

// Where to go after login/register: router state first, then the saved target, else home.
export const resolvePostAuthTarget = (from) => {
  const saved = consumePostAuthRedirect();
  return safeRedirectPath(from) ?? saved ?? '/';
};

// Guests tapping a protected tab are sent to login.
export const guestTarget = (item, isAuthenticated) =>
  item.protected && !isAuthenticated ? '/login' : item.to;
