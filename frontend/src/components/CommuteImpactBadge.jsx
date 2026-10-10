import React from 'react';
import { Info } from 'lucide-react';
import { calculateRideImpact } from '../utils/impactCalculator';

/**
 * Compact savings + CO₂ chip. Non-interactive so it can sit inside RideCard's <Link>.
 * variant: 'compact' (ride cards) | 'full' (shows the comparison note as visible text)
 */
const CommuteImpactBadge = ({ pickup, destination, pricePerSeat, seats = 1, variant = 'compact' }) => {
  const { passengerSavings, co2KgSaved, distanceKm } = calculateRideImpact(
    pickup,
    destination,
    pricePerSeat,
    seats
  );

  const savingsText = `Est. Savings: PKR ${passengerSavings.toLocaleString('en-US')} per seat`;
  const co2Text = `${co2KgSaved} kg CO₂ prevented`;
  const noteText = `Compared to solo ride-hailing; based on ~${distanceKm} km commute`;
  const isCompact = variant === 'compact';

  return (
    <div
      role="group"
      aria-label={`Commute impact: ${savingsText}, ${co2Text}. ${noteText}.`}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-200 bg-emerald-50 ${
        isCompact ? 'px-3 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
      }`}
    >
      <span className="font-semibold text-emerald-800">{savingsText}</span>
      <span className="text-slate-600">
        <span aria-hidden="true">🌿 </span>
        {co2Text}
      </span>
      <span className="inline-flex items-center gap-1 text-slate-600" title={noteText}>
        <Info className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" aria-hidden="true" />
        <span className={isCompact ? 'sr-only' : ''}>{noteText}</span>
      </span>
    </div>
  );
};

export default CommuteImpactBadge;
