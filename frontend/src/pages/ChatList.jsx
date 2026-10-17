import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle } from 'lucide-react';
import { getConversations } from '../services/api';
import { useChatUnread } from '../context/ChatUnreadContext';
import { formatBadgeCount } from '../utils/requests';
import { formatTime12Hour } from '../utils/dateUtils';
import { formatDateChip } from '../utils/scheduling';
import { isNetworkError } from '../utils/networkError';
import { SAFETY_NOTE } from '../utils/chat';
import OfflineNotice from '../components/OfflineNotice';
import VehicleBadge from '../components/VehicleBadge';

const ChatList = () => {
  const { refresh } = useChatUnread();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setError('');
    setOffline(false);
    try {
      const res = await getConversations();
      setItems(res.data.data || []);
      refresh();
    } catch (err) {
      if (isNetworkError(err)) {
        setItems([]);
        setOffline(true);
      } else {
        setError("Couldn't load chats. Check your connection and try again.");
      }
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  useEffect(() => {
    load();
    const onVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [load]);

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 pb-24">
      <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mb-1">Chat</h1>
      <p className="text-xs text-slate-500 mb-4">{SAFETY_NOTE}</p>

      {loading ? (
        <p role="status" className="py-12 text-center text-sm text-slate-500">Loading chats...</p>
      ) : offline ? (
        <OfflineNotice what="your chats" onRetry={load} />
      ) : error ? (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm text-center">{error}</div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <MessageCircle className="w-7 h-7" aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-slate-800 mb-1">No chats yet</h2>
          <p className="text-xs sm:text-sm text-slate-500">A chat opens when a driver or passenger accepts a ride request.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((c) => {
            const first = String(c.otherParty?.name || '').split(' ')[0];
            const chip = c.ride?.rideDate ? formatDateChip(c.ride.rideDate) : null;
            return (
              <li key={c.id}>
                <Link
                  to={`/chat/${c.id}`}
                  className={`block bg-white rounded-2xl p-4 border shadow-sm hover:bg-slate-50 ${c.unread > 0 ? 'border-emerald-400' : 'border-slate-200'}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {first} <span className="text-xs font-normal text-slate-500">({c.otherParty?.roleLabel})</span>
                    </p>
                    {c.unread > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[11px] font-bold flex items-center justify-center" aria-label={`${c.unread} unread`}>
                        {formatBadgeCount(c.unread)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 min-w-0">
                    <span className="truncate">{c.ride?.pickupLocation}</span>
                    <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                    <span className="truncate">{c.ride?.destination}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 mt-1">
                    {chip && <span>{chip.weekday}, {chip.label}</span>}
                    {c.ride?.departureTime && <span>{formatTime12Hour(c.ride.departureTime)}</span>}
                    <VehicleBadge vehicleType={c.ride?.vehicleType} />
                    <span>You are the {c.role === 'DRIVER' ? 'driver' : 'passenger'}</span>
                  </div>
                  {c.lastMessagePreview && (
                    <p className="text-xs text-slate-500 mt-2 truncate">{c.lastMessagePreview}</p>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ChatList;
