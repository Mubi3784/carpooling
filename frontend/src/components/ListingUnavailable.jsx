import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowLeft } from 'lucide-react';

// Shown for deleted, expired or otherwise unavailable ride/request links
const ListingUnavailable = ({ message = 'This listing has expired, been cancelled, or is no longer available.' }) => (
  <div className="max-w-md mx-auto px-4 py-16 text-center">
    <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
      <AlertTriangle className="w-7 h-7" aria-hidden="true" />
    </div>
    <h2 className="text-xl font-bold text-slate-900 mb-2">Listing Expired or Unavailable</h2>
    <p className="text-sm text-slate-500 mb-6">{message}</p>
    <Link
      to="/"
      className="inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition"
    >
      <ArrowLeft className="w-4 h-4" aria-hidden="true" />
      <span>Back to Home</span>
    </Link>
  </div>
);

export default ListingUnavailable;
