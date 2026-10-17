import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HandHeart, MapPin, Calendar, Clock, Car, Bike, AlertCircle, Info } from 'lucide-react';
import { createRequests } from '../services/api';
import { getTodayDateString, getDateStringWithOffset } from '../utils/dateUtils';
import { isNetworkError } from '../utils/networkError';
import {
  MAX_DATES,
  WINDOW_DAYS,
  createClientRequestId,
  getSelectableDates,
  formatDateChip,
  toggleDate,
} from '../utils/scheduling';

const inputClass =
  'w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

const RequestRide = () => {
  const navigate = useNavigate();
  const todayStr = getTodayDateString();
  const lastDateStr = getDateStringWithOffset(WINDOW_DAYS);

  // One idempotency key per form mount; reused on retries so no duplicates are made
  const [clientRequestId] = useState(() => createClientRequestId());
  const [dayCount, setDayCount] = useState(1);
  const [startDate, setStartDate] = useState(todayStr);
  const [selectedDates, setSelectedDates] = useState([todayStr]);
  const [formData, setFormData] = useState({
    pickupLocation: '',
    destination: '',
    departureTime: '',
    vehiclePreference: 'CAR',
    passengerCount: 1,
    notes: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isBike = formData.vehiclePreference === 'BIKE';

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleVehicleChange = (type) =>
    setFormData((prev) => ({
      ...prev,
      vehiclePreference: type,
      passengerCount: type === 'BIKE' ? 1 : prev.passengerCount,
    }));

  const handlePassengerChange = (delta) =>
    setFormData((prev) => {
      const next = prev.passengerCount + delta;
      return next >= 1 && next <= 6 ? { ...prev, passengerCount: next } : prev;
    });

  const handleDayCountChange = (delta) => {
    const next = dayCount + delta;
    if (next < 1 || next > MAX_DATES) return;
    setDayCount(next);
    setSelectedDates((prev) => prev.slice(0, next));
  };

  const handleStartDateChange = (e) => {
    let value = e.target.value;
    if (!value) return;
    if (value < todayStr) value = todayStr;
    if (value > lastDateStr) value = lastDateStr;
    setStartDate(value);
    setSelectedDates([value]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    if (selectedDates.length !== dayCount) {
      setError(`Please select ${dayCount} date${dayCount === 1 ? '' : 's'}.`);
      return;
    }
    if (!formData.pickupLocation.trim() || !formData.destination.trim()) {
      setError('Please provide both pickup location and destination.');
      return;
    }
    if (!formData.departureTime) {
      setError('Please select a departure time.');
      return;
    }

    setLoading(true);
    try {
      await createRequests({
        pickupLocation: formData.pickupLocation,
        destination: formData.destination,
        departureTime: formData.departureTime,
        vehiclePreference: formData.vehiclePreference,
        passengerCount: isBike ? 1 : Number(formData.passengerCount),
        notes: formData.notes,
        dates: selectedDates,
        clientRequestId,
      });
      navigate('/my-requests');
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        setError('No connection. Tap Post again to retry; it will not create duplicates.');
      } else {
        setError(err.response?.data?.message || 'Failed to post request. Please check your inputs.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <HandHeart className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Post a Ride Request</h1>
            <p className="text-xs sm:text-sm text-slate-500">Let drivers know where you need to go</p>
          </div>
        </div>

        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-start gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>A request or offer does not guarantee a seat until accepted.</span>
        </div>

        {error && (
          <div role="alert" className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <fieldset>
            <legend className="text-xs font-semibold text-slate-700 mb-1.5">Vehicle</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'CAR', label: 'Car', Icon: Car },
                { value: 'BIKE', label: 'Bike', Icon: Bike },
              ].map(({ value, label, Icon }) => (
                <label key={value} className="block cursor-pointer">
                  <input
                    type="radio"
                    name="vehiclePreference"
                    value={value}
                    checked={formData.vehiclePreference === value}
                    onChange={() => handleVehicleChange(value)}
                    className="sr-only peer"
                  />
                  <span className="flex items-center justify-center gap-2 min-h-[48px] px-3 text-sm font-semibold rounded-xl border bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 transition peer-checked:bg-emerald-50 peer-checked:border-emerald-500 peer-checked:text-emerald-800 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500">
                    <Icon className="w-5 h-5" aria-hidden="true" />
                    {label}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-4">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> 1. Route
            </h2>
            <div>
              <label htmlFor="pickupLocation" className="block text-xs font-semibold text-slate-700 mb-1">
                Pickup Location <span className="text-rose-500">*</span>
              </label>
              <input id="pickupLocation" type="text" name="pickupLocation" required maxLength={100} value={formData.pickupLocation} onChange={handleChange} placeholder="e.g. F-10 Markaz" className={inputClass} />
            </div>
            <div>
              <label htmlFor="destination" className="block text-xs font-semibold text-slate-700 mb-1">
                Destination <span className="text-rose-500">*</span>
              </label>
              <input id="destination" type="text" name="destination" required maxLength={100} value={formData.destination} onChange={handleChange} placeholder="e.g. Blue Area" className={inputClass} />
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> 2. Date & Time
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-xs font-semibold text-slate-700 mb-1">
                  Start Date <span className="text-rose-500">*</span>
                </label>
                <input id="startDate" type="date" required min={todayStr} max={lastDateStr} value={startDate} onChange={handleStartDateChange} className={inputClass} />
              </div>
              <div>
                <label htmlFor="departureTime" className="block text-xs font-semibold text-slate-700 mb-1">
                  Departure Time (24h) <span className="text-rose-500">*</span>
                </label>
                <input id="departureTime" type="time" name="departureTime" required value={formData.departureTime} onChange={handleChange} className={inputClass} />
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1">How many days?</span>
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50 h-[42px] max-w-[200px]">
                <button type="button" onClick={() => handleDayCountChange(-1)} disabled={dayCount <= 1} aria-label="Fewer days" className="w-10 h-full flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-30">-</button>
                <span className="flex-1 text-center font-bold text-sm text-slate-800" aria-live="polite">{dayCount}</span>
                <button type="button" onClick={() => handleDayCountChange(1)} disabled={dayCount >= MAX_DATES} aria-label="More days" className="w-10 h-full flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-30">+</button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Select {dayCount} day{dayCount === 1 ? '' : 's'} ({selectedDates.length} chosen). Up to {MAX_DATES} days, within the next 14 days.
              </p>
            </div>

            <div role="group" aria-label="Choose request dates" className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {getSelectableDates(startDate).map((date) => {
                const chosen = selectedDates.includes(date);
                const { weekday, label } = formatDateChip(date);
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={chosen}
                    disabled={!chosen && selectedDates.length >= dayCount}
                    onClick={() => setSelectedDates((prev) => toggleDate(prev, date, dayCount))}
                    className={`min-h-[44px] py-1.5 px-2 text-xs font-semibold rounded-xl border transition disabled:opacity-40 ${
                      chosen ? 'bg-emerald-50 border-emerald-500 text-emerald-800' : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="block">{weekday}</span>
                    <span className="block">{label}</span>
                  </button>
                );
              })}
            </div>

            {selectedDates.length > 0 && (
              <ul className="text-xs text-slate-600 space-y-0.5" aria-label="Selected dates">
                {selectedDates.map((date) => {
                  const { weekday, label } = formatDateChip(date);
                  return (
                    <li key={date} className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                      {weekday}, {label}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h2 className="text-sm font-bold uppercase tracking-wider text-emerald-700">3. Passengers & Notes</h2>
            <div>
              <span className="block text-xs font-semibold text-slate-700 mb-1">Passengers</span>
              {isBike ? (
                <p className="text-xs text-slate-500">A bike carries 1 passenger.</p>
              ) : (
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50 h-[42px] max-w-[200px]">
                  <button type="button" onClick={() => handlePassengerChange(-1)} disabled={formData.passengerCount <= 1} aria-label="Fewer passengers" className="w-10 h-full flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-30">-</button>
                  <span className="flex-1 text-center font-bold text-sm text-slate-800" aria-live="polite">{formData.passengerCount}</span>
                  <button type="button" onClick={() => handlePassengerChange(1)} disabled={formData.passengerCount >= 6} aria-label="More passengers" className="w-10 h-full flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-30">+</button>
                </div>
              )}
            </div>
            <div>
              <label htmlFor="notes" className="block text-xs font-semibold text-slate-700 mb-1">Notes (Optional)</label>
              <textarea id="notes" name="notes" rows="2" maxLength="300" value={formData.notes} onChange={handleChange} placeholder="e.g. Can be flexible by 10 minutes" className={`${inputClass} resize-none`}></textarea>
            </div>
          </div>

          <button type="submit" disabled={loading} className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition shadow-md disabled:opacity-50 text-base">
            {loading ? 'Posting...' : dayCount > 1 ? `Post ${dayCount} Requests` : 'Post Request'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default RequestRide;
