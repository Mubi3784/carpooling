import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Clock, Info, Users, User } from 'lucide-react';
import { getRideMatchingRequests, createMatch } from '../services/api';
import { createClientRequestId, formatDateChip } from '../utils/scheduling';
import { formatTime12Hour } from '../utils/dateUtils';
import { groupByLevel, emptyMessage, SAFETY_NOTE } from '../utils/matches';
import { isNetworkError } from '../utils/networkError';
import OfflineNotice from '../components/OfflineNotice';
import VehicleBadge from '../components/VehicleBadge';
import ReasonChips from '../components/ReasonChips';

const RideMatchingRequests = () => {
  const { id } = useParams();
  const [items, setItems] = useState([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(null);
  const [actionError, setActionError] = useState('');
  // One key per page visit; retries reuse it so an offer is never sent twice
  const [clientId] = useState(() => createClientRequestId());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setOffline(false);
    try {
      const res = await getRideMatchingRequests(id);
      setItems(res.data.data);
      setReason(res.data.reason || '');
    } catch (err) {
      if (isNetworkError(err)) {
        setOffline(true);
        return;
      }
      setError(err.response?.status === 404 ? 'Ride not found.' : 'Unable to load matching requests.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const { groups } = useMemo(() => groupByLevel(items), [items]);

  const offer = async (r) => {
    if (sending) return;
    setSending(r.id);
    setActionError('');
    try {
      await createMatch({ rideId: id, requestId: r.id, clientMatchId: `${clientId}-${r.id}`.slice(0, 64) });
      setItems((prev) => prev.map((x) => (x.id === r.id ? { ...x, existingMatch: 'PENDING' } : x)));
    } catch (err) {
      setActionError(
        isNetworkError(err)
          ? 'No connection. Try again; it will not send twice.'
          : err.response?.data?.message || 'Could not send the offer.'
      );
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 pb-24">
      <Link to="/my-rides" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-3">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> My Rides
      </Link>
      <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Matching passenger requests</h1>

      <div className="my-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-start gap-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span>{SAFETY_NOTE} The passenger must accept your offer first.</span>
      </div>

      {actionError && <div role="alert" className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">{actionError}</div>}

      {loading ? (
        <div className="py-12 text-center text-slate-500" role="status"><p className="text-sm">Finding passengers...</p></div>
      ) : offline ? (
        <OfflineNotice what="matching requests" onRetry={load} />
      ) : error ? (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm text-center">{error}</div>
      ) : items.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-600">
          {reason || emptyMessage()}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.level} className="mb-6" aria-labelledby={`grp-${group.level}`}>
            <h2 id={`grp-${group.level}`} className="text-base font-bold text-slate-900 mb-2">{group.label}</h2>
            <ul className="space-y-3">
              {group.items.map((r) => {
                const { weekday, label } = formatDateChip(r.requestDate);
                return (
                  <li key={r.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <span>{r.pickupLocation}</span>
                        <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                        <span>{r.destination}</span>
                      </div>
                      <VehicleBadge vehicleType={r.vehiclePreference} />
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-600">
                      <span>{weekday}, {label}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />{formatTime12Hour(r.departureTime)}</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden="true" />{r.passengerCount} passenger{r.passengerCount === 1 ? '' : 's'}</span>
                      <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" aria-hidden="true" />{r.passenger?.name}</span>
                    </div>
                    <ReasonChips reasons={r.reasons} />
                    {r.canOffer ? (
                      <button
                        type="button"
                        onClick={() => offer(r)}
                        disabled={!!sending || !!r.existingMatch}
                        className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium disabled:opacity-60"
                      >
                        {r.existingMatch === 'ACCEPTED' ? 'Accepted' : r.existingMatch === 'PENDING' ? 'Offer sent' : sending === r.id ? 'Sending...' : 'Offer my ride'}
                      </button>
                    ) : (
                      <p className="mt-3 text-xs text-slate-500">Vehicle differs: the passenger can request to join your ride.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  );
};

export default RideMatchingRequests;
