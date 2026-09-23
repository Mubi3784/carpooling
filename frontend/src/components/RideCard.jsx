import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, ArrowRight, User, Car, Shield } from 'lucide-react';
import { formatTime12Hour } from '../utils/dateUtils';

const RideCard = ({ ride }) => {
  // Gender badge styling
  const getGenderBadge = (preference) => {
    switch (preference) {
      case 'Female Only':
        return 'bg-rose-50 text-rose-700 border-rose-200';
      case 'Male Only':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      default:
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    }
  };

  return (
    <Link
      to={`/rides/${ride.id}`}
      className="block bg-white rounded-2xl p-5 border border-slate-200 shadow-sm hover:shadow-md hover:border-emerald-300 transition-all duration-200"
    >
      {/* Route Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 text-base md:text-lg font-bold text-slate-900 tracking-tight">
          <span className="truncate max-w-[140px] sm:max-w-[200px]" title={ride.pickupLocation}>
            {ride.pickupLocation}
          </span>
          <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" />
          <span className="truncate max-w-[140px] sm:max-w-[200px]" title={ride.destination}>
            {ride.destination}
          </span>
        </div>

        {/* Price Contribution Badge */}
        <div className="self-start sm:self-auto bg-emerald-50 text-emerald-800 font-bold px-3 py-1 rounded-xl text-sm border border-emerald-200">
          Rs. {ride.pricePerSeat} <span className="text-xs font-normal text-emerald-600">/ seat</span>
        </div>
      </div>

      {/* Ride Metadata */}
      <div className="flex flex-wrap items-center gap-y-2 gap-x-4 text-xs sm:text-sm text-slate-500 mb-4">
        {/* Time */}
        <div className="flex items-center gap-1.5 font-medium text-slate-700">
          <Clock className="w-4 h-4 text-emerald-600" />
          <span>{formatTime12Hour(ride.departureTime)}</span>
        </div>

        {/* Available Seats */}
        <div className="flex items-center gap-1.5">
          <span
            className={`font-semibold px-2 py-0.5 rounded-lg text-xs ${
              ride.availableSeats === 1
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-slate-100 text-slate-700'
            }`}
          >
            {ride.availableSeats} {ride.availableSeats === 1 ? 'seat left' : 'seats left'}
          </span>
        </div>

        {/* Gender Preference Badge */}
        <div
          className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${getGenderBadge(
            ride.genderPreference
          )}`}
        >
          <Shield className="w-3 h-3" />
          <span>{ride.genderPreference}</span>
        </div>
      </div>

      {/* Driver Footer */}
      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold">
            <User className="w-3 h-3" />
          </div>
          <span className="font-medium text-slate-700">{ride.driver?.name}</span>
        </div>

        {ride.carDetails && (
          <div className="flex items-center gap-1 text-slate-500 truncate max-w-[150px]">
            <Car className="w-3.5 h-3.5 text-slate-400" />
            <span className="truncate">{ride.carDetails}</span>
          </div>
        )}
      </div>
    </Link>
  );
};

export default RideCard;