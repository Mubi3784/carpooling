import React from 'react';
import { Car, Bike } from 'lucide-react';
import { normalizeVehicleType, getVehicleLabel } from '../utils/vehicle';

// Icon + visible text, so the type is never conveyed by color alone
const VehicleBadge = ({ vehicleType, className = '' }) => {
  const type = normalizeVehicleType(vehicleType);
  const Icon = type === 'BIKE' ? Bike : Car;
  const colors =
    type === 'BIKE'
      ? 'bg-violet-50 text-violet-700 border-violet-200'
      : 'bg-sky-50 text-sky-700 border-sky-200';

  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium border ${colors} ${className}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      <span>{getVehicleLabel(type)}</span>
    </span>
  );
};

export default VehicleBadge;
