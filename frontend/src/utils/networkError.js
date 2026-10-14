// Pure helpers to classify axios errors (no imports so node:test can run them).

const isCanceled = (err) => err?.code === 'ERR_CANCELED' || err?.name === 'CanceledError';

// True when the request never got an HTTP response (offline, DNS, CORS, server down).
export function isNetworkError(err) {
  if (!err || isCanceled(err)) return false;
  if (err.code === 'ERR_NETWORK') return true;
  return !err.response;
}

// True when the server rejected the credentials.
export function isAuthError(err) {
  return [401, 403].includes(err?.response?.status);
}
