// Passenger/Driver mode. UI filter ONLY - not a security boundary.
export const MODE_KEY = 'carpool_mode';
export const MODES = ['passenger', 'driver'];

export const normalizeMode = (v) => (v === 'driver' ? 'driver' : 'passenger');

export const readMode = (storage) => {
  try {
    return normalizeMode(storage?.getItem(MODE_KEY));
  } catch {
    return 'passenger';
  }
};

export const writeMode = (storage, mode) => {
  try {
    storage?.setItem(MODE_KEY, normalizeMode(mode));
  } catch {
    // storage unavailable: mode just won't persist
  }
};

export const fabConfig = (mode) =>
  normalizeMode(mode) === 'driver'
    ? { label: 'Offer Ride', to: '/offer-ride' }
    : { label: 'Post Request', to: '/request-ride' };

export const modeLabel = (mode) => (normalizeMode(mode) === 'driver' ? 'Driver Mode' : 'Passenger Mode');

// Keyboard handling for the two-option radiogroup. Returns the next mode (or current if key is unhandled).
export const nextModeFromKey = (current, key) => {
  const cur = normalizeMode(current);
  switch (key) {
    case 'ArrowRight':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowUp':
      return cur === 'passenger' ? 'driver' : 'passenger';
    case 'Home':
      return 'passenger';
    case 'End':
      return 'driver';
    default:
      return cur;
  }
};
