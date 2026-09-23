import React from 'react';
import { X, PhoneCall, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NoticeModal = () => {
  const { showNoticeModal, closeNoticeModal } = useAuth();

  if (!showNoticeModal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
      {/* Full Page Modal Card */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 md:p-8 text-center">
        {/* Clearly Visible Close (×) Button */}
        <button
          onClick={closeNoticeModal}
          className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Close Notice"
        >
          <X className="w-6 h-6" />
        </button>

        {/* Header Icon */}
        <div className="mx-auto w-14 h-14 bg-emerald-50 text-primary rounded-full flex items-center justify-center mb-5">
          <ShieldAlert className="w-8 h-8" />
        </div>

        {/* Notice Heading */}
        <h2 className="text-xl md:text-2xl font-bold text-slate-900 mb-4">
          Free Trial Notice
        </h2>

        {/* Notice Verbatim Content */}
        <div className="text-slate-600 text-sm md:text-base leading-relaxed space-y-4 mb-6">
          <p className="bg-slate-50 p-4 rounded-xl border border-slate-100 text-slate-700">
            Notice: This application is currently operating under a free trial.
          </p>
          <p>
            If you would like to contribute, share feedback, or report an issue, please contact us at:
          </p>
        </div>

        {/* Phone Contact Block */}
        <div className="flex items-center justify-center gap-3 bg-emerald-50 text-emerald-800 font-semibold text-lg py-3 px-6 rounded-xl border border-emerald-200 mb-6">
          <PhoneCall className="w-5 h-5 text-primary" />
          <a href="tel:03105517386" className="hover:underline tracking-wide">
            0310-5517386
          </a>
        </div>

        {/* Action Button */}
        <button
          onClick={closeNoticeModal}
          className="w-full py-3 px-6 bg-primary hover:bg-primary-hover text-white font-medium rounded-xl transition-all shadow-md hover:shadow-lg"
        >
          Continue to Carpool
        </button>
      </div>
    </div>
  );
};

export default NoticeModal;