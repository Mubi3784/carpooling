import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Clock, Calendar, Trash2, PlusCircle, ArrowRight, HandHeart, Inbox, CheckCircle2, Ban, Hourglass, CircleDot } from 'lucide-react';
import { getMyRequests, getRequestMatchCounts, deleteRequest, deleteRequestSeries } from '../services/api';
import { groupRequestsBySeries, statusLabel } from '../utils/requests';
import { formatDateChip } from '../utils/scheduling';
import { formatTime12Hour } from '../utils/dateUtils';
import ConfirmationModal from '../components/ConfirmationModal';
import OfflineNotice from '../components/OfflineNotice';
import VehicleBadge from '../components/VehicleBadge';
import { isNetworkError } from '../utils/networkError';

const STATUS_STYLE = {
  ACTIVE: { cls: 'bg-emerald-100 text-emerald-800', Icon: CircleDot },
  MATCHED: { cls: 'bg-sky-100 text-sky-800', Icon: CheckCircle2 },
  CANCELLED: { cls: 'bg-slate-200 text-slate-700', Icon: Ban },
  EXPIRED: { cls: 'bg-amber-100 text-amber-800', Icon: Hourglass },
};

// Text + icon, so status is never shown by color alone
const StatusBadge = ({ status }) => {
  const { cls, Icon } = STATUS_STYLE[status] || STATUS_STYLE.CANCELLED;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${cls}`}>
      <Icon className="w-3 h-3" aria-hidden="true" />
      {statusLabel(status)}
    </span>
  );
};

const DEFAULT_EMPTY = {
  title: 'No requests yet',
  body: 'Post a request and drivers can offer you a seat.',
  ctaLabel: 'Post a Request',
  ctaTo: '/request-ride',
};

const MyRequestsList = ({ empty = DEFAULT_EMPTY }) => {
  const requestId = useRef(0);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [matchCounts, setMatchCounts] = useState(null); // null = unavailable (hidden)
  const [toDelete, setToDelete] = useState(null);
  const [seriesToDelete, setSeriesToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const groups = useMemo(() => groupRequestsBySeries(requests), [requests]);
  const pendingTotal = requests.reduce((n, r) => n + (r.pendingMatchCount || 0), 0);

  const fetchRequests = useCallback(async () => {
    const id = ++requestId.current; // ignore stale responses (unmount, Retry)
    setLoading(true);
    setError('');
    setOffline(false);
    try {
      const res = await getMyRequests();
      if (id !== requestId.current) return;
      setRequests(res.data.data);
      // Non-fatal: one batched call; if it fails the counts are simply hidden
      getRequestMatchCounts()
        .then((c) => setMatchCounts(c.data.data))
        .catch(() => setMatchCounts(null));
    } catch (err) {
      if (id !== requestId.current) return;
      console.error(err);
      if (isNetworkError(err)) {
        setRequests([]);
        setOffline(true);
        return;
      }
      setError('Unable to load your requests. Please try again.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
    return () => {
      requestId.current += 1;
    };
  }, [fetchRequests]);

  const closeModal = () => {
    setToDelete(null);
    setSeriesToDelete(null);
  };

  const handleConfirm = async () => {
    setDeleteLoading(true);
    try {
      if (seriesToDelete) {
        await deleteRequestSeries(seriesToDelete.seriesId);
        const ids = new Set(seriesToDelete.requests.map((r) => r.id));
        setRequests((prev) => prev.filter((r) => !ids.has(r.id)));
      } else if (toDelete) {
        await deleteRequest(toDelete.id);
        setRequests((prev) => prev.filter((r) => r.id !== toDelete.id));
      }
      closeModal();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to cancel request.');
    } finally {
      setDeleteLoading(false);
    }
  };

  const canCancel = (r) => r.status === 'ACTIVE' || r.status === 'MATCHED';

  const renderRow = (r) => {
    const { weekday, label } = formatDateChip(r.requestDate);
    return (
      <li key={r.id} className={`py-3 flex flex-wrap items-center justify-between gap-2 ${r.status === 'EXPIRED' ? 'opacity-70' : ''}`}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700">
          <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
          <span className="font-medium">{weekday}, {label}</span>
          <StatusBadge status={r.status} />
          {r.pendingMatchCount > 0 && (
            <span className="text-xs font-semibold text-sky-700">{r.pendingMatchCount} pending offer{r.pendingMatchCount === 1 ? '' : 's'}</span>
          )}
        </div>
        {r.status === 'ACTIVE' && matchCounts && matchCounts[r.id] && (
          <Link
            to={`/requests/${r.id}/matches`}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border ${
              matchCounts[r.id].total > 0
                ? 'text-emerald-800 border-emerald-300 bg-emerald-50 hover:bg-emerald-100'
                : 'text-slate-500 border-slate-200 hover:bg-slate-50'
            }`}
          >
            Possible matches ({matchCounts[r.id].total})
          </Link>
        )}
        {canCancel(r) && (
          <button type="button" onClick={() => setToDelete(r)} className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition">
            <Trash2 className="w-3.5 h-3.5" />
            <span>Cancel</span>
          </button>
        )}
      </li>
    );
  };

  const modalTarget = seriesToDelete ? seriesToDelete.requests[0] : toDelete;

  return (
    <div>
      {pendingTotal > 0 && (
        <Link to="/matches" className="mb-4 flex items-center gap-2 p-3 bg-sky-50 border border-sky-200 text-sky-800 text-sm rounded-xl">
          <Inbox className="w-4 h-4" aria-hidden="true" />
          <span>{pendingTotal} pending offer{pendingTotal === 1 ? '' : 's'}. Open Offers &amp; Requests</span>
        </Link>
      )}

      {loading ? (
        <div className="py-12 text-center text-slate-500" role="status">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm">Loading your requests...</p>
        </div>
      ) : offline ? (
        <OfflineNotice what="your requests" onRetry={fetchRequests} />
      ) : error ? (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm text-center">
          <p>{error}</p>
          <button
            type="button"
            onClick={fetchRequests}
            className="mt-3 px-4 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      ) : requests.length > 0 ? (
        <div className="space-y-4">
          {groups.map((group) => {
            const first = group.requests[0];
            return (
              <div key={group.key} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                    <span>{first.pickupLocation}</span>
                    <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
                    <span>{first.destination}</span>
                  </div>
                  <div className="self-start sm:self-auto flex items-center gap-2">
                    <VehicleBadge vehicleType={first.vehiclePreference} />
                    <span className="text-xs text-slate-600">{first.passengerCount} passenger{first.passengerCount === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs sm:text-sm font-medium text-slate-700 mb-2">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                  <span>{formatTime12Hour(first.departureTime)}</span>
                </div>
                <ul className="divide-y divide-slate-100 border-t border-slate-100">{group.requests.map(renderRow)}</ul>
                {group.seriesId && group.requests.some(canCancel) && (
                  <div className="pt-3 border-t border-slate-100 flex justify-end">
                    <button type="button" onClick={() => setSeriesToDelete(group)} className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition">
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Cancel all dates</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <HandHeart className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">{empty.title}</h3>
          <p className="text-xs sm:text-sm text-slate-500 mb-5">{empty.body}</p>
          <Link to={empty.ctaTo} className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition">
            <PlusCircle className="w-4 h-4" />
            <span>{empty.ctaLabel}</span>
          </Link>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!(toDelete || seriesToDelete)}
        onClose={closeModal}
        onConfirm={handleConfirm}
        loading={deleteLoading}
        title={seriesToDelete ? 'Cancel All Dates' : 'Cancel Request'}
        message={
          seriesToDelete
            ? `Cancel all ${seriesToDelete.requests.length} dates of the request from ${modalTarget?.pickupLocation} to ${modalTarget?.destination}? Any accepted seats will be released.`
            : `Cancel the request from ${modalTarget?.pickupLocation} to ${modalTarget?.destination} on ${modalTarget?.requestDate}? Any accepted seat will be released.`
        }
        confirmText={seriesToDelete ? 'Yes, Cancel All' : 'Yes, Cancel Request'}
      />
    </div>
  );
};

export default MyRequestsList;
