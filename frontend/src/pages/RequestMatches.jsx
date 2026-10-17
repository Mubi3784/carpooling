import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Clock, Info, Users } from 'lucide-react';
import api, { getRequestMatches, createMatch } from '../services/api';
import { createClientRequestId, formatDateChip } from '../utils/scheduling';
import { formatTime12Hour } from '../utils/dateUtils';
import { groupByLevel, joinPayloadFor, emptyMessage, SAFETY_NOTE } from '../utils/matches';
import { isNetworkError } from '../utils/networkError';
import OfflineNotice from '../components/OfflineNotice';
import VehicleBadge from '../components/VehicleBadge';
import ReasonChips from '../components/ReasonChips';

const RequestMatches = () => {
  const { id } = useParams();
  const [request, setRequest] = useState(null);
  const [matches, setMatches] = useState([]);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [sending, setSending] = useState(null);
  const [actionError, setActionError] = useState('');
  // One key per page visit; retries reuse it so a join is never sent twice
  const [clientId] = useState(() => createClientRequestId());

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setOffline(false);
    try {
      const [reqRes, matchRes] = await Promise.all([api.get(`/requests/${encodeURIComponent(id)}`), getRequestMatches(id)]);
      setRequest(reqRes.data.data);
      setMatches(matchRes.data.data);
      setReason(matchRes.data.reason || '');
    } catch (err) {
      if (isNetworkError(err)) {
        setOffline(true);
        return;
      }
      setError(err.response?.status === 404 ? 'Request not found.' : 'Unable to load matches.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const { groups } = useMemo(() => groupByLevel(matches), [matches]);

  const join = async (match) => {
    if (sending) return;
    setSending(match.ride.id);
    setActionError('');
    try {
      await createMatch(joinPayloadFor(match, request, `${clientId}-${match.ride.id}`));
      setMatches((prev) => prev.map((m) => (m.ride.id === match.ride.id ? { ...m, existingMatch: 'PENDING' } : m)));
    } catch (err) {
      setActionError(
        isNetworkError(err)
          ? 'No connection. Try again; it will not send twice.'
          : err.response?.data?.message || 'Could not send your request.'
      );
    } finally {
      setSending(null);
    }
  };

  const buttonLabel = (m) =>
    m.existingMatch === 'ACCEPTED' ? 'Accepted' : m.existingMatch === 'PENDING' ? 'Request sent' : sending === m.ride.id ? 'Sending...' : 'Request to Join';

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 pb-24">
      <Link to="/my-requests" className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900 mb-3">
        <ArrowLeft className="w-4 h-4" aria-hidden="true" /> My Requests
      </Link>
      <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Possible matches</h1>
      {request && (
        <p className="text-sm text-slate-600 mt-1 flex flex-wrap items-center gap-2">
          <span>{request.pickupLocation}</span>
          <ArrowRight className="w-4 h-4 text-emerald-600" aria-hidden="true" />
          <span>{request.destination}</span>
          <span>· {request.requestDate} · {formatTime12Hour(request.departureTime)}</span>
        </p>
      )}

      <div className="my-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-start gap-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span>{SAFETY_NOTE} A driver must accept your request first.</span>
      </div>

      {actionError && <div role="alert" className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">{actionError}</div>}

      {loading ? (
        <div className="py-12 text-center text-slate-500" role="status"><p className="text-sm">Finding matches...</p></div>
      ) : offline ? (
        <OfflineNotice what="possible matches" onRetry={load} />
      ) : error ? (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm text-center">{error}</div>
      ) : matches.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-600">
          {reason || emptyMessage()}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.level} className="mb-6" aria-labelledby={`grp-${group.level}`}>
            <h2 id={`grp-${group.level}`} className="text-base font-bold text-slate-900 mb-2">{group.label}</h2>
            <ul className="space-y-3">
              {group.items.map((m) => {
                const { weekday, label } = formatDateChip(m.ride.rideDate);
                return (
                  <li key={m.ride.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <span>{m.ride.pickupLocation}</span>
                        <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                        <span>{m.ride.destination}</span>
                      </div>
                      <VehicleBadge vehicleType={m.ride.vehicleType} />
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-600">
                      <span>{weekday}, {label}</span>
                      <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />{formatTime12Hour(m.ride.departureTime)}</span>
                      <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden="true" />{m.ride.availableSeats} seat{m.ride.availableSeats === 1 ? '' : 's'} open</span>
                      <span>Rs. {m.ride.pricePerSeat} / seat</span>
                      <span>Driver: {m.ride.driver?.name}</span>
                    </div>
                    <ReasonChips reasons={m.reasons} />
                    <button
                      type="button"
                      onClick={() => join(m)}
                      disabled={!!sending || !!m.existingMatch}
                      className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium disabled:opacity-60"
                    >
                      {buttonLabel(m)}
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}
      {!loading && !offline && !error && matches.length > 0 && !matches.some((m) => m.matchLevel === 'EXACT') && (
        <p className="text-xs text-slate-500">{emptyMessage()}</p>
      )}
    </div>
  );
};

export default RequestMatches;
