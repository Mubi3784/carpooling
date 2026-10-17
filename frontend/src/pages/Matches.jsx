import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useChatUnread } from '../context/ChatUnreadContext';
import { ArrowRight, Calendar, Clock, Info, Inbox, MessageCircle, User } from 'lucide-react';
import { getMatches, getConversations, acceptMatch, declineMatch, cancelMatch, markMatchSeen } from '../services/api';
import { useAlerts } from '../context/AlertContext';
import { useMode } from '../context/ModeContext';
import { splitInbox, otherModeCount, conversationForMatch, chatTargetAfterAccept } from '../utils/matchInbox';
import ModeSwitcher from '../components/ModeSwitcher';
import { statusLabel } from '../utils/requests';
import { formatTime12Hour } from '../utils/dateUtils';
import ConfirmationModal from '../components/ConfirmationModal';
import OfflineNotice from '../components/OfflineNotice';
import VehicleBadge from '../components/VehicleBadge';
import { isNetworkError } from '../utils/networkError';

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'incoming', label: 'Incoming' },
  { key: 'outgoing', label: 'Outgoing' },
];

const STATUS_CLASS = {
  PENDING: 'bg-sky-100 text-sky-800',
  ACCEPTED: 'bg-emerald-100 text-emerald-800',
  DECLINED: 'bg-slate-200 text-slate-700',
  CANCELLED: 'bg-slate-200 text-slate-700',
  EXPIRED: 'bg-amber-100 text-amber-800',
};

const Matches = ({ embedded = false }) => {
  const { refresh } = useAlerts();
  const { refresh: refreshChat } = useChatUnread();
  const navigate = useNavigate();
  const { mode, setMode } = useMode();
  const [allMatches, setAllMatches] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState('');
  const [toCancel, setToCancel] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setOffline(false);
    try {
      // Fetch everything once; tab + mode filters are applied client-side
      const res = await getMatches({});
      const list = res.data.data;
      setAllMatches(list);
      if (list.some((m) => m.status === 'ACCEPTED')) {
        await getConversations().then((r) => setConversations(r.data.data || [])).catch(() => {});
      }
      // Viewing marks updates as seen (never changes a request's status)
      await Promise.all(list.filter((m) => m.unread && m.status !== 'PENDING').map((m) => markMatchSeen(m.id).catch(() => {})));
      refresh();
    } catch (err) {
      if (isNetworkError(err)) {
        setAllMatches([]);
        setOffline(true);
        return;
      }
      setError('Unable to load offers and requests. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [refresh]);

  const byTab = allMatches.filter((m) => tab === 'all' || m.direction === tab);
  // Pending items awaiting my response show in BOTH modes; the mode filter applies to the rest
  const { needsResponse, rest } = splitInbox(byTab, mode);
  const matches = [...needsResponse, ...rest];
  const otherCount = otherModeCount(allMatches, mode);
  const otherLabel = mode === 'driver' ? 'Passenger Mode' : 'Driver Mode';

  useEffect(() => {
    load();
  }, [load]);

  const run = async (m, fn, okMessage) => {
    if (busyId) return;
    setBusyId(m.id);
    setNotice('');
    setError('');
    try {
      const res = await fn(m.id);
      setNotice(okMessage);
      if (fn === acceptMatch) {
        let target = chatTargetAfterAccept(res, [], m.id);
        if (!target) {
          try {
            const list = await getConversations();
            target = chatTargetAfterAccept(null, list.data.data || [], m.id);
          } catch {
            // fall through to the notice below
          }
        }
        refresh();
        refreshChat();
        if (target) {
          navigate(target);
          return;
        }
        setNotice('Accepted. Open it from Chat.');
        await load();
        return;
      }
      await load();
      refreshChat();
    } catch (err) {
      setError(err.response?.data?.message || 'Something went wrong. Please try again.');
      refresh();
    } finally {
      setBusyId(null);
    }
  };

  const confirmCancel = async () => {
    const m = toCancel;
    setToCancel(null);
    if (m) await run(m, cancelMatch, 'Cancelled. The seat was released.');
  };

  return (
    <div className={embedded ? 'mt-8' : 'max-w-3xl mx-auto px-4 py-6 md:py-8 pb-24'}>
      {embedded ? (
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight mb-4">Offers &amp; Requests</h2>
      ) : (
        <>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Offers &amp; Requests</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 mb-4">Accepting reserves a seat and opens a chat for this ride.</p>
          <ModeSwitcher />
        </>
      )}

      {otherCount > 0 && (
        <button
          type="button"
          onClick={() => setMode(mode === 'driver' ? 'passenger' : 'driver')}
          className="mb-4 w-full text-left p-3 bg-sky-50 border border-sky-200 text-sky-800 text-sm rounded-xl"
        >
          You have {otherCount} pending item{otherCount === 1 ? '' : 's'} in {otherLabel}. Switch to {otherLabel}
        </button>
      )}

      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-start gap-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span>A request or offer does not guarantee a seat until accepted.</span>
      </div>

      <div role="tablist" aria-label="Filter" className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
              tab === t.key ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {notice && <div role="status" className="mb-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl">{notice}</div>}
      {error && !loading && <div role="alert" className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">{error}</div>}

      {loading ? (
        <div className="py-12 text-center text-slate-500" role="status">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm">Loading...</p>
        </div>
      ) : offline ? (
        <OfflineNotice what="your offers and requests" onRetry={load} />
      ) : matches.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">Nothing here yet</h3>
          <p className="text-xs sm:text-sm text-slate-500">
            {mode === 'driver'
              ? 'Join requests from passengers will show up here.'
              : 'Offers from drivers and your join requests will show up here.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {matches.map((m) => {
            const route = m.ride || m.request;
            const date = m.ride?.rideDate || m.request?.requestDate;
            const vehicle = m.ride?.vehicleType || m.request?.vehiclePreference;
            const summary =
              m.initiatedBy === 'DRIVER'
                ? m.role === 'DRIVER'
                  ? `You offered your ride to ${m.counterpart.name}`
                  : `${m.counterpart.name} offered you a ride`
                : m.role === 'DRIVER'
                  ? `${m.counterpart.name} wants to join your ride`
                  : `You asked to join ${m.counterpart.name}'s ride`;
            return (
              <li key={m.id} className={`bg-white rounded-2xl p-5 border shadow-sm ${m.unread ? 'border-emerald-400' : 'border-slate-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <p className="text-sm font-semibold text-slate-800 flex items-center gap-1.5">
                    <User className="w-4 h-4 text-slate-400" aria-hidden="true" />
                    {summary}
                  </p>
                  <span className="flex items-center gap-2">
                    {m.unread && <span className="text-[10px] font-bold uppercase text-emerald-700">New</span>}
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${STATUS_CLASS[m.status] || STATUS_CLASS.CANCELLED}`}>
                      {statusLabel(m.status)}
                    </span>
                  </span>
                </div>
                {route && (
                  <div className="flex items-center gap-2 text-base font-bold text-slate-900 mb-2">
                    <span>{route.pickupLocation}</span>
                    <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                    <span>{route.destination}</span>
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-slate-600 mb-3">
                  {date && <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" aria-hidden="true" />{date}</span>}
                  {route?.departureTime && <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />{formatTime12Hour(route.departureTime)}</span>}
                  {vehicle && <VehicleBadge vehicleType={vehicle} />}
                  <span>{m.passengerCount} seat{m.passengerCount === 1 ? '' : 's'}</span>
                </div>
                {m.status === 'ACCEPTED' && (
                  <p className="text-xs text-emerald-800 mb-3">Accepted. Seat reserved. You can chat about this ride in the app.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  {m.status === 'ACCEPTED' && (() => {
                    const convo = conversationForMatch(conversations, m.id);
                    return (
                      <Link
                        to={convo ? `/chat/${convo.id}` : '/chat'}
                        className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium"
                      >
                        <MessageCircle className="w-4 h-4" aria-hidden="true" />
                        Open chat
                      </Link>
                    );
                  })()}
                  {m.canAccept && (
                    <button type="button" disabled={!!busyId} onClick={() => run(m, acceptMatch, 'Accepted. A seat is reserved.')} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
                      Accept
                    </button>
                  )}
                  {m.canDecline && (
                    <button type="button" disabled={!!busyId} onClick={() => run(m, declineMatch, 'Declined.')} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-medium disabled:opacity-50">
                      Decline
                    </button>
                  )}
                  {m.canCancel && (
                    <button type="button" disabled={!!busyId} onClick={() => (m.status === 'ACCEPTED' ? setToCancel(m) : run(m, cancelMatch, 'Cancelled.'))} className="px-4 py-2 text-rose-600 hover:bg-rose-50 rounded-xl text-sm font-medium disabled:opacity-50">
                      Cancel
                    </button>
                  )}
                  {m.unread && m.status === 'PENDING' && m.direction === 'incoming' && (
                    <button type="button" onClick={() => markMatchSeen(m.id).then(() => { refresh(); setAllMatches((p) => p.map((x) => (x.id === m.id ? { ...x, unread: false } : x))); }).catch(() => {})} className="px-3 py-2 text-xs text-slate-500 hover:bg-slate-100 rounded-xl">
                      Mark as seen
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmationModal
        isOpen={!!toCancel}
        onClose={() => setToCancel(null)}
        onConfirm={confirmCancel}
        loading={false}
        title="Cancel accepted match"
        message="The reserved seat will be released and the other person will be notified. Continue?"
        confirmText="Yes, Cancel"
      />
    </div>
  );
};

export default Matches;
