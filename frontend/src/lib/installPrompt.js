// Module-level install store. Imported first in main.jsx so that the
// `beforeinstallprompt` event is captured before React renders.

const LEGACY_KEY = 'carpool_install_dismissed_at';

let deferredEvent = null;
let snapshot = { canPromptNative: false, isInstalled: false };
const listeners = new Set();

function update(next) {
  const merged = { ...snapshot, ...next };
  if (
    merged.canPromptNative === snapshot.canPromptNative &&
    merged.isInstalled === snapshot.isInstalled
  ) {
    return;
  }
  snapshot = merged;
  listeners.forEach((l) => l());
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getSnapshot = () => snapshot;
export const getServerSnapshot = () => snapshot;

export function storeEvent(event) {
  deferredEvent = event;
  update({ canPromptNative: true });
}

export function markInstalled() {
  deferredEvent = null;
  update({ canPromptNative: false, isInstalled: true });
}

export async function promptInstall() {
  const event = deferredEvent;
  if (!event || typeof event.prompt !== 'function') return 'unavailable';
  // An event can be used once; clear it before awaiting.
  deferredEvent = null;
  update({ canPromptNative: false });
  try {
    await event.prompt();
    const choice = await event.userChoice;
    // Never mark installed on dismissal; only appinstalled / standalone do that.
    return choice && choice.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch {
    return 'unavailable';
  }
}

function isStandaloneNow(win) {
  const mq =
    typeof win.matchMedia === 'function' ? win.matchMedia('(display-mode: standalone)') : null;
  return Boolean((mq && mq.matches) || (win.navigator && win.navigator.standalone === true));
}

export function initInstallStore(win) {
  if (!win || win.__carpoolInstallInit) return;
  win.__carpoolInstallInit = true;

  try {
    win.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // Storage unavailable; nothing to clear.
  }

  win.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    if (!snapshot.isInstalled) storeEvent(e);
  });
  win.addEventListener('appinstalled', markInstalled);

  if (isStandaloneNow(win)) update({ isInstalled: true });

  if (typeof win.matchMedia === 'function') {
    const mq = win.matchMedia('(display-mode: standalone)');
    const onChange = (e) => {
      if (e.matches) markInstalled();
    };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }
}

if (typeof window !== 'undefined') initInstallStore(window);
