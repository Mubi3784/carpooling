import React from 'react';
import { ArrowRight, Calendar, Clock, User, Users } from 'lucide-react';
import { formatDateChip } from '../utils/scheduling';
import { formatTime12Hour } from '../utils/dateUtils';
import VehicleBadge from './VehicleBadge';

// One passenger request with the "Offer my ride" action (shared by Requests page and Home feed)
const RequestCard = ({ request: r, onOffer }) => {
  const { weekday, label } = formatDateChip(r.requestDate);
  return (
    <li className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 text-base font-bold text-slate-900">
          <span>{r.pickupLocation}</span>
          <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" aria-hidden="true" />
          <span>{r.destination}</span>
        </div>
        <VehicleBadge vehicleType={r.vehiclePreference} />
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm text-slate-600 mb-2">
        <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" aria-hidden="true" />{weekday}, {label}</span>
        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />{formatTime12Hour(r.departureTime)}</span>
        <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" aria-hidden="true" />{r.passengerCount} passenger{r.passengerCount === 1 ? '' : 's'}</span>
        <span className="flex items-center gap-1"><User className="w-3.5 h-3.5" aria-hidden="true" />{r.passenger?.name}</span>
      </div>
      {r.notes && <p className="text-sm text-slate-600 mb-3">{r.notes}</p>}
      <button type="button" onClick={() => onOffer(r)} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium">
        Offer my ride
      </button>
    </li>
  );
};

export default RequestCard;
