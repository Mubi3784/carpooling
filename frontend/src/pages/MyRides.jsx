import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Car, Clock, Calendar, Users, Trash2, PlusCircle, ArrowRight, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { formatTime12Hour } from '../utils/dateUtils';
import ConfirmationModal from '../components/ConfirmationModal';

const MyRides = () => {
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [rideToDelete, setRideToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchMyRides();
  }, []);

  const fetchMyRides = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/rides/my-rides');
      setRides(res.data.data);
    } catch (err) {
      console.error(err);
      setError('Unable to load your rides. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Quick seat decrement/increment
  const handleUpdateSeats = async (rideId, currentSeats, delta) => {
    const newSeats = currentSeats + delta;
    if (newSeats < 0 || newSeats > 6) return;

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
    setDeleteModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!rideToDelete) return;
    setDeleteLoading(true);

    try {
      await api.delete(`/rides/${rideToDelete.id}`);
      setRides((prev) => prev.filter((r) => r.id !== rideToDelete.id));
      closeDeleteModal();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to delete ride.');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            My Offered Rides
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Manage your seat availability or cancel trips
          </p>
        </div>
        <Link
          to="/offer-ride"
          className="flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium shadow-sm transition"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Ride</span>
        </Link>
      </div>

      {loading ? (
        <div className="py-12 text-center text-slate-500">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm">Loading your rides...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm text-center">
          {error}
        </div>
      ) : rides.length > 0 ? (
        <div className="space-y-4">
          {rides.map((ride) => (
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

                <span
                  className={`self-start sm:self-auto px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    ride.status === 'FULL'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {ride.status}
                </span>
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
              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {/* Seats Live Adjuster */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-600">Available Seats:</span>
                  <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-slate-50 h-8">
                    <button
                      type="button"
                      onClick={() => handleUpdateSeats(ride.id, ride.availableSeats, -1)}
                      disabled={ride.availableSeats <= 0}
                      className="w-8 h-full flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-30 text-sm"
                      title="Decrease seats (someone confirmed on WhatsApp)"
                    >
                      -
                    </button>
                    <span className="px-3 font-bold text-xs text-slate-900">
                      {ride.availableSeats}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleUpdateSeats(ride.id, ride.availableSeats, 1)}
                      disabled={ride.availableSeats >= 6}
                      className="w-8 h-full flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 disabled:opacity-30 text-sm"
                      title="Increase seats"
                    >
                      +
                    </button>
                  </div>
                </div>

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
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-3">
            <Car className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800 mb-1">No active rides offered</h3>
          <p className="text-xs sm:text-sm text-slate-500 mb-5">
            You haven't posted any upcoming trips yet.
          </p>
          <Link
            to="/offer-ride"
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Offer a Ride</span>
          </Link>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
        title="Cancel & Delete Ride"
        message={`Are you sure you want to cancel the ride from ${rideToDelete?.pickupLocation} to ${rideToDelete?.destination}? It will be permanently removed immediately.`}
        confirmText="Yes, Cancel Ride"
      />
    </div>
  );
};

export default MyRides;