import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';
import { getRidesForOffer, createMatch } from '../services/api';
import { createClientRequestId } from '../utils/scheduling';
import { formatTime12Hour } from '../utils/dateUtils';
import { isNetworkError } from '../utils/networkError';

const OfferPicker = ({ target, onClose }) => {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(null);
  // One key per rides picker opening; retries reuse it so no duplicate offers are made
  const [clientMatchId] = useState(() => createClientRequestId());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getRidesForOffer(target.id);
        if (!cancelled) setRides(res.data.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.message || 'Could not load your rides.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [target.id]);

  const offer = async (ride) => {
    if (sending) return;
    setSending(ride.id);
    setError('');
    try {
      await createMatch({ rideId: ride.id, requestId: target.id, clientMatchId: `${clientMatchId}-${ride.id}`.slice(0, 64) });
      setMessage('Offer sent. The passenger can accept or decline.');
      setRides((prev) => prev.map((r) => (r.id === ride.id ? { ...r, alreadyOffered: true } : r)));
    } catch (err) {
      setError(
        isNetworkError(err)
          ? 'No connection. Try again; it will not send twice.'
          : err.response?.data?.message || 'Could not send the offer.'
      );
    } finally {
      setSending(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true" aria-label="Offer my ride">
      <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-white rounded-2xl shadow-xl p-6">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg">
          <X className="w-5 h-5" />
        </button>
        <h3 className="text-lg font-bold text-slate-900 mb-1">Offer my ride</h3>
        <p className="text-xs text-slate-500 mb-4">
          {target.pickupLocation} to {target.destination} on {target.requestDate}. A request or offer does not guarantee a seat until accepted.
        </p>
        {error && <div role="alert" className="mb-3 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl">{error}</div>}
        {message && <div role="status" className="mb-3 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm rounded-xl">{message}</div>}
        {loading ? (
          <p className="text-sm text-slate-500" role="status">Loading your rides...</p>
        ) : rides.length === 0 ? (
          <div className="text-sm text-slate-600">
            <p className="mb-3">You have no eligible ride on this date, post one first.</p>
            <Link to="/offer-ride" className="inline-flex px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium">Offer a Ride</Link>
          </div>
        ) : (
          <ul className="space-y-2">
            {rides.map((ride) => (
              <li key={ride.id} className="p-3 border border-slate-200 rounded-xl flex items-center justify-between gap-3">
                <div className="text-sm">
                  <p className="font-semibold text-slate-900">{ride.pickupLocation} to {ride.destination}</p>
                  <p className="text-xs text-slate-500">{formatTime12Hour(ride.departureTime)} · {ride.availableSeats} of {ride.totalSeats} seats open</p>
                </div>
                <button
                  type="button"
                  onClick={() => offer(ride)}
                  disabled={!!sending || ride.alreadyOffered}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold disabled:opacity-50"
                >
                  {ride.alreadyOffered ? 'Offered' : sending === ride.id ? 'Sending...' : 'Offer'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default OfferPicker;
