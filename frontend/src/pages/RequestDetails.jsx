import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Calendar, Clock, Users, User, Info } from 'lucide-react';
import { getRequestById } from '../services/api';
import { formatTime12Hour } from '../utils/dateUtils';
import { formatDateChip } from '../utils/scheduling';
import { isNetworkError } from '../utils/networkError';
import OfflineNotice from '../components/OfflineNotice';
import ListingUnavailable from '../components/ListingUnavailable';
import ShareWhatsAppButton from '../components/ShareWhatsAppButton';
import OfferPicker from '../components/OfferPicker';
import VehicleBadge from '../components/VehicleBadge';

// Deep-link target for /requests/:id (login required)
const RequestDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [request, setRequest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [offline, setOffline] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const [picker, setPicker] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setUnavailable(false);
      setOffline(false);
      try {
        const res = await getRequestById(id);
        if (!cancelled) setRequest(res.data.data);
      } catch (err) {
        if (cancelled) return;
        if (isNetworkError(err)) {
          setRequest(null);
          setOffline(true);
        } else {
          setRequest(null);
          setUnavailable(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, retryKey]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-slate-500" role="status">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-sm">Loading request...</p>
      </div>
    );
  }

  if (offline) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <OfflineNotice what="this request" onRetry={() => setRetryKey((k) => k + 1)} />
      </div>
    );
  }

  if (unavailable || !request) return <ListingUnavailable />;

  const isOwner = !request.passenger; // owner view carries no passenger object
  const isActive = request.status === 'ACTIVE';
  const { weekday, label } = formatDateChip(request.requestDate);

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 min-h-[44px] text-sm font-medium text-slate-500 hover:text-slate-900 mb-4 transition"
      >
        <ArrowLeft className="w-4 h-4" aria-hidden="true" />
        <span>Back</span>
      </button>

      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
            Ride Request
          </span>
          <VehicleBadge vehicleType={request.vehiclePreference} />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-lg font-bold text-slate-900 mb-4">
          <span>{request.pickupLocation}</span>
          <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
          <span>{request.destination}</span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 mb-4">
          <span className="flex items-center gap-1"><Calendar className="w-4 h-4" aria-hidden="true" />{weekday}, {label}</span>
          <span className="flex items-center gap-1"><Clock className="w-4 h-4 text-emerald-600" aria-hidden="true" />{formatTime12Hour(request.departureTime)}</span>
          <span className="flex items-center gap-1"><Users className="w-4 h-4" aria-hidden="true" />{request.passengerCount} passenger{request.passengerCount === 1 ? '' : 's'}</span>
          {request.passenger?.name && (
            <span className="flex items-center gap-1"><User className="w-4 h-4" aria-hidden="true" />{request.passenger.name}</span>
          )}
        </div>

        {request.notes && (
          <div className="mb-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" aria-hidden="true" /> Notes
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">{request.notes}</p>
          </div>
        )}

        {!isActive && (
          <p role="status" className="mb-4 text-sm text-amber-800">This request is no longer open ({String(request.status).toLowerCase()}).</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {isActive && !isOwner && (
            <button
              type="button"
              onClick={() => setPicker(request)}
              className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium"
            >
              Offer my ride
            </button>
          )}
          {isActive && <ShareWhatsAppButton kind="request" item={request} />}
        </div>
        {isActive && (
          <p className="mt-2 text-xs text-slate-500">Anyone with the link who is logged in can view this request.</p>
        )}
      </div>

      {picker && <OfferPicker key={picker.id} target={picker} onClose={() => setPicker(null)} />}
    </div>
  );
};

export default RequestDetails;
