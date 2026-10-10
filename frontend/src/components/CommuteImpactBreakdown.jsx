import React from 'react';
import { Leaf, Wallet, Info } from 'lucide-react';
import { calculateRideImpact, IMPACT_ASSUMPTIONS } from '../utils/impactCalculator';

const formatPKR = (value) => `PKR ${Number(value).toLocaleString('en-US')}`;

/**
 * "Commute Impact Breakdown" card for the ride details page.
 */
const CommuteImpactBreakdown = ({ ride }) => {
  const perSeat = calculateRideImpact(ride.pickupLocation, ride.destination, ride.pricePerSeat, 1);

  const totalSeats = Number(ride.totalSeats) || 0;
  const availableSeats = Number(ride.availableSeats) || 0;
  const bookedSeats = Math.max(0, totalSeats - availableSeats);

  const allSeats =
    totalSeats > 1
      ? calculateRideImpact(ride.pickupLocation, ride.destination, ride.pricePerSeat, totalSeats)
      : null;
  const booked =
    bookedSeats > 0
      ? calculateRideImpact(ride.pickupLocation, ride.destination, ride.pricePerSeat, bookedSeats)
      : null;

  const seatPrice = Number(ride.pricePerSeat) || 0;

  return (
    <section
      aria-labelledby="commute-impact-heading"
      className="p-4 sm:p-5 bg-white border border-emerald-200 rounded-2xl mb-6"
    >
      <h2
        id="commute-impact-heading"
        className="text-sm font-bold text-slate-900 mb-3 flex items-center gap-1.5"
      >
        <Leaf className="w-4 h-4 text-emerald-600" aria-hidden="true" />
        Commute Impact Breakdown
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        {/* Solo ride-hailing comparison */}
        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
          <h3 className="text-xs font-semibold text-emerald-800 mb-2 flex items-center gap-1">
            <Wallet className="w-3.5 h-3.5" aria-hidden="true" />
            Solo Ride-Hailing Comparison
          </h3>
          <dl className="space-y-1 text-xs text-slate-700">
            <div className="flex justify-between gap-2">
              <dt>Solo ride-hailing estimate</dt>
              <dd className="font-semibold text-slate-900">{formatPKR(perSeat.soloEstimate)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>This seat</dt>
              <dd className="font-semibold text-slate-900">{formatPKR(seatPrice)}</dd>
            </div>
            <div className="flex justify-between gap-2 pt-1 border-t border-emerald-100">
              <dt className="font-semibold text-emerald-800">You save</dt>
              <dd className="font-bold text-emerald-800">
                {formatPKR(perSeat.passengerSavings)} per seat
              </dd>
            </div>
          </dl>
        </div>

        {/* Carbon offset */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
          <h3 className="text-xs font-semibold text-slate-800 mb-2 flex items-center gap-1">
            <span aria-hidden="true">🌿</span>
            Carbon Offset
          </h3>
          <dl className="space-y-1 text-xs text-slate-700">
            <div className="flex justify-between gap-2">
              <dt>Per shared seat</dt>
              <dd className="font-semibold text-slate-900">{perSeat.co2KgSaved} kg CO₂</dd>
            </div>
            {booked && (
              <div className="flex justify-between gap-2">
                <dt>
                  {bookedSeats} booked seat{bookedSeats === 1 ? '' : 's'}
                </dt>
                <dd className="font-semibold text-slate-900">{booked.co2KgSaved} kg CO₂</dd>
              </div>
            )}
            {allSeats && (
              <div className="flex justify-between gap-2">
                <dt>If all {totalSeats} seats are shared</dt>
                <dd className="font-semibold text-emerald-800">{allSeats.co2KgSaved} kg CO₂</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      <p className="text-xs text-slate-600 mb-2">
        Route basis: {perSeat.corridorLabel} · ~{perSeat.distanceKm} km
        {perSeat.isIntercity && ' (Intercity / motorway estimate)'}
      </p>

      {/* Transparent assumptions */}
      <div className="flex items-start gap-1.5 text-[11px] text-slate-600 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-slate-500 mt-0.5 flex-shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold text-slate-700">Assumptions</p>
          <ul className="list-disc pl-4">
            {IMPACT_ASSUMPTIONS.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default CommuteImpactBreakdown;
