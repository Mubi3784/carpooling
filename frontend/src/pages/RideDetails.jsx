import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Clock,
  Calendar,
  Users,
  Car,
  Shield,
  MessageCircle,
  AlertTriangle,
  User,
  Info,
} from 'lucide-react';
import api from '../services/api';
import { formatTime12Hour } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';

const RideDetails = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const [ride, setRide] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchRideDetails = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await api.get(`/rides/${id}`);
        setRide(res.data.data);
      } catch (err) {
        console.error(err);
        setError('This ride has already departed or has been cancelled by the driver.');
      } finally {
        setLoading(false);
      }
    };

    fetchRideDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-12 text-center text-slate-500">
        <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
        <p className="text-sm">Loading ride details...</p>
      </div>
    );
  }

  if (error || !ride) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">Ride Unavailable</h2>
        <p className="text-sm text-slate-500 mb-6">{error}</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-xl transition"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Available Rides</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-8">
      {/* Back button */}
      <button
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 mb-6 transition"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to Rides</span>
      </button>

      {/* Main Details Card */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8 mb-6">
        {/* Route Details */}
        <div className="mb-6">
          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
            Route Details
          </span>
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-3 h-3 rounded-full bg-emerald-500 mt-1.5 ring-4 ring-emerald-50 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400 font-medium">Pickup Location</p>
                <p className="text-lg font-bold text-slate-900">{ride.pickupLocation}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-3 h-3 rounded-full bg-slate-900 mt-1.5 ring-4 ring-slate-100 flex-shrink-0" />
              <div>
                <p className="text-xs text-slate-400 font-medium">Destination</p>
                <p className="text-lg font-bold text-slate-900">{ride.destination}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Grid Info */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 mb-6 text-sm">
          <div>
            <p className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              <Calendar className="w-3.5 h-3.5" /> Date
            </p>
            <p className="font-semibold text-slate-800">{ride.rideDate}</p>
          </div>

          <div>
            <p className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              <Clock className="w-3.5 h-3.5" /> Departure
            </p>
            <p className="font-semibold text-slate-800">{formatTime12Hour(ride.departureTime)}</p>
          </div>

          <div>
            <p className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              <Users className="w-3.5 h-3.5" /> Seats
            </p>
            <p className="font-semibold text-emerald-700">
              {ride.availableSeats} of {ride.totalSeats} open
            </p>
          </div>

          <div>
            <p className="text-xs text-slate-400 mb-1">Price per Seat</p>
            <p className="font-bold text-slate-900 text-base">Rs. {ride.pricePerSeat}</p>
          </div>

          <div>
            <p className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              <Shield className="w-3.5 h-3.5" /> Preference
            </p>
            <p className="font-semibold text-slate-800">{ride.genderPreference}</p>
          </div>

          <div>
            <p className="text-xs text-slate-400 flex items-center gap-1 mb-1">
              <Car className="w-3.5 h-3.5" /> Vehicle
            </p>
            <p className="font-semibold text-slate-800 truncate">
              {ride.carDetails || 'Not specified'}
            </p>
          </div>
        </div>

        {/* Additional Notes */}
        {ride.notes && (
          <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <p className="text-xs font-semibold text-slate-500 mb-1 flex items-center gap-1">
              <Info className="w-3.5 h-3.5" /> Driver Instructions / Notes
            </p>
            <p className="text-sm text-slate-700 leading-relaxed">{ride.notes}</p>
          </div>
        )}

        {/* Driver Card */}
        <div className="flex items-center gap-3 p-4 border border-slate-200 rounded-2xl mb-6">
          <div className="w-11 h-11 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center">
            <User className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs text-slate-400">Driver</p>
            <p className="font-bold text-slate-900 text-base">{ride.driver?.name}</p>
          </div>
        </div>

        {/* Disclaimer Notice */}
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 leading-relaxed mb-6">
          <p className="font-bold mb-1 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            Important Notice
          </p>
          A listing on this platform does not guarantee a confirmed seat. Please coordinate directly with the driver via WhatsApp to confirm seat availability and pickup arrangements.
        </div>

        {/* Contact Action */}
        {isAuthenticated ? (
          <a
            href={ride.whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/20 text-sm sm:text-base"
          >
            <MessageCircle className="w-5 h-5" />
            <span>Contact Driver on WhatsApp</span>
          </a>
        ) : (
          <Link
            to="/login"
            className="w-full py-3.5 px-6 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-2xl transition flex items-center justify-center gap-2 text-sm sm:text-base"
          >
            <span>Log in to Contact Driver</span>
          </Link>
        )}
      </div>
    </div>
  );
};

export default RideDetails;