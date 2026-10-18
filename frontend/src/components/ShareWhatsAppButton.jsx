import React from 'react';
import { MessageCircle } from 'lucide-react';
import {
  buildRideLink, buildRequestLink, buildRideShareText, buildRequestShareText, openWhatsAppShare,
} from '../utils/share';

// Opens WhatsApp with a pre-filled, privacy-safe message. Only whitelisted listing fields are used.
const ShareWhatsAppButton = ({ kind, item, className = '' }) => {
  if (!item?.id) return null;
  const isRide = kind === 'ride';

  const onClick = (e) => {
    // Safe inside a parent <Link>: do not navigate
    e.preventDefault();
    e.stopPropagation();
    const text = isRide
      ? buildRideShareText(item, buildRideLink(item.id))
      : buildRequestShareText(item, buildRequestLink(item.id));
    openWhatsAppShare(text);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isRide ? 'Share ride on WhatsApp' : 'Share request on WhatsApp'}
      className={`inline-flex items-center justify-center gap-1.5 min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs sm:text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 ${className}`}
    >
      <MessageCircle className="w-4 h-4" aria-hidden="true" />
      <span>Share on WhatsApp</span>
    </button>
  );
};

export default ShareWhatsAppButton;
