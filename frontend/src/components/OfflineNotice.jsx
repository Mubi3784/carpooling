import React from 'react';
import { WifiOff } from 'lucide-react';

// Shown in place of live data when a request fails with no response.
const OfflineNotice = ({ what, onRetry }) => (
  <div
    role="alert"
    className="p-6 bg-amber-50 border border-amber-200 rounded-2xl text-center text-amber-900 text-sm"
  >
    <WifiOff className="w-8 h-8 mx-auto mb-2 text-amber-600" aria-hidden="true" />
    <p>You appear to be offline — can't load {what}.</p>
    <button
      type="button"
      onClick={onRetry}
      className="mt-3 px-4 py-1.5 bg-white border border-amber-200 rounded-lg text-xs font-semibold hover:bg-amber-100"
    >
      Retry
    </button>
  </div>
);

export default OfflineNotice;
