import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Car, Clock, Calendar, Trash2, PlusCircle, ArrowRight } from 'lucide-react';
import api, { deleteRide, deleteRideSeries, getMyRides } from '../services/api';
import { groupRidesBySeries, formatDateChip } from '../utils/scheduling';
import { formatTime12Hour } from '../utils/dateUtils';
import ConfirmationModal from '../components/ConfirmationModal';
import OfflineNotice from '../components/OfflineNotice';
import { isNetworkError } from '../utils/networkError';
import VehicleBadge from '../components/VehicleBadge';
import ShareWhatsAppButton from '../components/ShareWhatsAppButton';
import { getMaxSeats } from '../utils/vehicle';
import { useMode } from '../context/ModeContext';

// Driver-mode shortcut to passenger requests that could fit this ride
const MatchingLink = ({ ride, show }) =>
  show && ride.status === 'ACTIVE' ? (
    <Link
      to={`/rides/${ride.id}/matching-requests`}
      className="text-xs font-semibold text-emerald-800 border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg"
    >
      Matching requests
    </Link>
  ) : null;

const DEFAULT_EMPTY = {
  title: 'No active rides offered',
  body: "You haven't posted any upcoming trips yet.",
  ctaLabel: 'Offer a Ride',
  ctaTo: '/offer-ride',
};

const MyRidesList = ({ empty = DEFAULT_EMPTY }) => {
  const { isDriver } = useMode();
  const requestId = useRef(0);
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [rideToDelete, setRideToDelete] = useState(null);
  const [seriesToDelete, setSeriesToDelete] = useState(null);
  const groups = useMemo(() => groupRidesBySeries(rides), [rides]);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const fetchMyRides = useCallback(async () => {
    const id = ++requestId.current; // ignore stale responses (unmount, Retry)
    setLoading(true);
    setError('');
    setOffline(false);
    try {
      const res = await getMyRides();
      if (id !== requestId.current) return;
      setRides(res.data.data);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error(err);
      if (isNetworkError(err)) {
        setRides([]);
        setOffline(true);
        return;
      }
      setError('Unable to load your rides. Please try again.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyRides();
    return () => {
      requestId.current += 1;
    };
  }, [fetchMyRides]);

  // Quick seat decrement/increment
  const handleUpdateSeats = async (ride, delta) => {
    const rideId = ride.id;
    const newSeats = ride.availableSeats + delta;
    if (newSeats < 0 || newSeats > getMaxSeats(ride)) return;

    try {
      await api.patch(`/rides/${rideId}/seats`, { availableSeats: newSeats });
      // Optimistic update of local state
      setRides((prev) =>
        prev.map((r) =>
          r.id === rideId
            ? { ...r, availableSeats: newSeats, status: newSeats === 0 ? 'FULL' : 'ACTIVE' }
            : r
        )
      );
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Could not update seats.');
    }
  };

  const openDeleteModal = (ride) => {
    setRideToDelete(ride);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setRideToDelete(null);
    setSeriesToDelete(null);
    setDeleteModalOpen(false);
  };

  const openSeriesDeleteModal = (group) => {
    setSeriesToDelete(group);
    setDeleteModalOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!rideToDelete && !seriesToDelete) return;
    setDeleteLoading(true);

    try {
      if (seriesToDelete) {
        await deleteRideSeries(seriesToDelete.seriesId);
        const ids = new Set(seriesToDelete.rides.map((r) => r.id));
        setRides((prev) => prev.filter((r) => !ids.has(r.id)));
      } else {
        await deleteRide(rideToDelete.id);
        setRides((prev) => prev.filter((r) => r.id !== rideToDelete.id));
      }
      closeDeleteModal();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to delete ride.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div>
      {loading ? (
        <div className="py-12 text-center text-slate-500">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm">Loading your rides...</p>
        </div>
      ) : offline ? (
        <OfflineNotice what="your rides" onRetry={fetchMyRides} />
      ) : error ? (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm text-center">
          <p>{error}</p>
          <button
            type="button"
            onClick={fetchMyRides}
            className="mt-3 px-4 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      ) : rides.length > 0 ? (
        <div className="space-y-4">
          {groups.map((group) => group.seriesId ? (
            <div
              key={group.key}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm"
            >
              {(() => {
                const first = group.rides[0];
                return (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                        <span>{first.pickupLocation}</span>
                        <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                        <span>{first.destination}</span>
                      </div>
                      <div className="self-start sm:self-auto flex items-center gap-2">
                        <VehicleBadge vehicleType={first.vehicleType} />
                        <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                          {group.rides.length} days
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-500 mb-3">
                      <div className="flex items-center gap-1 font-medium text-slate-700">
                        <Clock className="w-3.5 h-3.5 text-emerald-600" />
                        <span>{formatTime12Hour(first.departureTime)}</span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800">Rs. {first.pricePerSeat}</span> / seat
                      </div>
                    </div>

                    <ul className="divide-y divide-slate-100 border-t border-slate-100">
                      {group.rides.map((ride) => {
                        const { weekday, label } = formatDateChip(ride.rideDate);
                        return (
                          <li key={ride.id} className="py-3 flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-sm text-slate-700">
                              <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                              <span className="font-medium">{weekday}, {label}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                  ride.status === 'FULL'
                                    ? 'bg-amber-100 text-amber-800'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}
                              >
                                {ride.status}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <MatchingLink ride={ride} show={isDriver} />
                              {ride.status === 'ACTIVE' && <ShareWhatsAppButton kind="ride" item={ride} />}
                              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50 h-8">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSeats(ride, -1)}
                                  disabled={ride.availableSeats <= 0}
                                  aria-label={`Decrease seats for ${label}`}
                                  className="w-8 h-full flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-30 text-sm"
                                >
                                  -
                                </button>
                                <span className="px-3 font-bold text-xs text-slate-900">
                                  {ride.availableSeats}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateSeats(ride, 1)}
                                  disabled={ride.availableSeats >= getMaxSeats(ride)}
                                  aria-label={`Increase seats for ${label}`}
                                  className="w-8 h-full flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-30 text-sm"
                                >
                                  +
                                </button>
                              </div>
                              <button
                                type="button"
                                onClick={() => openDeleteModal(ride)}
                                className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Cancel</span>
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="pt-3 border-t border-slate-100 flex justify-end">
                      <button
                        type="button"
                        onClick={() => openSeriesDeleteModal(group)}
                        className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Cancel all dates</span>
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          ) : group.rides.map((ride) => (
            <div
              key={ride.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm"
            >
              {/* Route & Status */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 text-base font-bold text-slate-900">
                  <span>{ride.pickupLocation}</span>
                  <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>{ride.destination}</span>
                </div>

                <div className="self-start sm:self-auto flex items-center gap-2">
                  <VehicleBadge vehicleType={ride.vehicleType} />
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                      ride.status === 'FULL'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {ride.status}
                  </span>
                </div>
              </div>

              {/* Trip Time & Date */}
              <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-500 mb-4">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{ride.rideDate}</span>
                </div>
                <div className="flex items-center gap-1 font-medium text-slate-700">
                  <Clock className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{formatTime12Hour(ride.departureTime)}</span>
                </div>
                <div>
                  <span className="font-semibold text-slate-800">Rs. {ride.pricePerSeat}</span> / seat
                </div>
              </div>

              {/* Management Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100">
                {/* Seats Live Adjuster */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Available Seats:</span>
                  <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50 h-8">
                    <button
                      type="button"
                      onClick={() => handleUpdateSeats(ride, -1)}
                      disabled={ride.availableSeats <= 0}
                      className="w-8 h-full flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-30 text-sm"
                      title="Decrease seats (someone confirmed outside the app)"
                    >
                      -
                    </button>
                    <span className="px-3 font-bold text-xs text-slate-900">
                      {ride.availableSeats}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateSeats(ride, 1)}
                      disabled={ride.availableSeats >= getMaxSeats(ride)}
                      className="w-8 h-full flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-30 text-sm"
                      title={getMaxSeats(ride) === 1 ? 'A bike has only 1 seat' : 'Increase seats'}
                    >
                      +
                    </button>
                  </div>
                </div>

                <MatchingLink ride={ride} show={isDriver} />
                {ride.status === 'ACTIVE' && <ShareWhatsAppButton kind="ride" item={ride} />}
                {/* Cancel / Delete Button */}
                <button
                  type="button"
                  onClick={() => openDeleteModal(ride)}
                  className="flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-3 py-1.5 rounded-lg transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Cancel Ride</span>
                </button>
              </div>
            </div>
          )))}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <Car className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">{empty.title}</h3>
          <p className="text-xs sm:text-sm text-slate-500 mb-5">{empty.body}</p>
          <Link
            to={empty.ctaTo}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>{empty.ctaLabel}</span>
          </Link>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
        title={seriesToDelete ? 'Cancel All Dates' : 'Cancel & Delete Ride'}
        message={
          seriesToDelete
            ? `Cancel all ${seriesToDelete.rides.length} upcoming dates of the ride from ${seriesToDelete.rides[0].pickupLocation} to ${seriesToDelete.rides[0].destination}? They will be permanently removed.`
            : `Are you sure you want to cancel the ride from ${rideToDelete?.pickupLocation} to ${rideToDelete?.destination}${rideToDelete?.seriesId ? ` on ${rideToDelete.rideDate}` : ''}? It will be permanently removed immediately.`
        }
        confirmText={seriesToDelete ? 'Yes, Cancel All' : 'Yes, Cancel Ride'}
      />
    </div>
  );
};

export default MyRidesList;