import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, MapPin, Calendar, Clock, Users, DollarSign, Phone, Car, Bike, FileText, Shield, AlertCircle } from 'lucide-react';
import { createRides, getProfile } from '../services/api';
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

const OfferRide = () => {
  const navigate = useNavigate();
  const todayStr = getTodayDateString();
  const lastDateStr = getDateStringWithOffset(WINDOW_DAYS);

  // One idempotency key per form mount; reused on every retry so no duplicates are made
  const [clientRequestId] = useState(() => createClientRequestId());
  const [dayCount, setDayCount] = useState(1);
  const [startDate, setStartDate] = useState(todayStr);
  const [selectedDates, setSelectedDates] = useState([todayStr]);

  const [formData, setFormData] = useState({
    pickupLocation: '',
    destination: '',
    departureTime: '',
    vehicleType: 'CAR',
    availableSeats: 3,
    pricePerSeat: '',
    whatsappNumber: '',
    genderPreference: 'Anyone',
    carDetails: '',
    notes: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Prefill the optional WhatsApp number from the private profile into LOCAL form state only
  useEffect(() => {
    let alive = true;
    getProfile()
      .then((res) => {
        const phone = res.data?.data?.profile?.phone;
        if (alive && phone) {
          setFormData((prev) => (prev.whatsappNumber ? prev : { ...prev, whatsappNumber: phone }));
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const isBike = formData.vehicleType === 'BIKE';

  const handleVehicleChange = (type) => {
    setFormData((prev) => ({
      ...prev,
      vehicleType: type,
      availableSeats: type === 'BIKE' ? 1 : prev.vehicleType === 'BIKE' ? 3 : prev.availableSeats,
    }));
  };

  const handleSeatChange = (delta) => {
    if (formData.vehicleType === 'BIKE') return;
    setFormData((prev) => {
      const updated = prev.availableSeats + delta;
      if (updated >= 1 && updated <= 6) {
        return { ...prev, availableSeats: updated };
      }
      return prev;
    });
  };

  const handleDayCountChange = (delta) => {
    const next = dayCount + delta;
    if (next < 1 || next > MAX_DATES) return;
    setDayCount(next);
    setSelectedDates((prev) => prev.slice(0, next)); // drop the latest dates
  };

  const handleStartDateChange = (e) => {
    let value = e.target.value;
    if (!value) return;
    if (value < todayStr) value = todayStr;
    if (value > lastDateStr) value = lastDateStr;
    setStartDate(value);
    setSelectedDates([value]);
  };

  const handleToggleDate = (date) => {
    setSelectedDates((prev) => toggleDate(prev, date, dayCount));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    if (selectedDates.length !== dayCount) {
      setError(`Please select ${dayCount} date${dayCount === 1 ? '' : 's'}.`);
      return;
    }

    // Quick client validations
    if (!formData.pickupLocation.trim() || !formData.destination.trim()) {
      setError('Please provide both pickup location and destination.');
      return;
    }

    if (!formData.departureTime) {
      setError('Please select a departure time.');
      return;
    }

    if (formData.pricePerSeat === '' || Number(formData.pricePerSeat) < 0) {
      setError('Price per seat must be 0 or higher.');
      return;
    }

    setLoading(true);

    try {
      await createRides({
        ...formData,
        dates: selectedDates,
        clientRequestId,
        vehicleType: formData.vehicleType,
        availableSeats: formData.vehicleType === 'BIKE' ? 1 : Number(formData.availableSeats),
        pricePerSeat: Number(formData.pricePerSeat),
      });

      // Navigate to My Rides upon success
      navigate('/my-rides');
    } catch (err) {
      console.error(err);
      if (isNetworkError(err)) {
        setError('No connection. Tap Publish again to retry; it will not create duplicates.');
      } else {
        setError(err.response?.data?.message || 'Failed to offer ride. Please check your inputs.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 md:py-10">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <PlusCircle className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-900">Offer a Carpool Ride</h1>
            <p className="text-xs sm:text-sm text-slate-500">Publish your route to share fuel costs</p>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-xl flex items-start gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Vehicle Type */}
          <fieldset>
            <legend className="text-xs font-semibold text-slate-700 mb-1.5">Vehicle Type</legend>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'CAR', label: 'Car', Icon: Car },
                { value: 'BIKE', label: 'Bike', Icon: Bike },
              ].map(({ value, label, Icon }) => (
                <label key={value} className="block cursor-pointer">
                  <input
                    type="radio"
                    name="vehicleType"
                    value={value}
                    checked={formData.vehicleType === value}
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

          {/* Route Section */}
          <div className="space-y-4">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <MapPin className="w-4 h-4" /> 1. Route Details
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Pickup Location <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="pickupLocation"
                required
                value={formData.pickupLocation}
                onChange={handleChange}
                placeholder="e.g. F-10 Markaz (near Shell pump)"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Destination <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="destination"
                required
                value={formData.destination}
                onChange={handleChange}
                placeholder="e.g. Blue Area / Centaurus Islamabad"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Timing Section */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> 2. Date & Departure Time
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="startDate" className="block text-xs font-semibold text-slate-700 mb-1">
                  Start Date <span className="text-rose-500">*</span>
                </label>
                <input
                  id="startDate"
                  type="date"
                  required
                  min={todayStr}
                  max={lastDateStr}
                  value={startDate}
                  onChange={handleStartDateChange}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Departure Time (24h) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="time"
                  name="departureTime"
                  required
                  value={formData.departureTime}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                />
              </div>
            </div>

            {/* How many days */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">How many days?</label>
              <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50 h-[42px] max-w-[200px]">
                <button
                  type="button"
                  onClick={() => handleDayCountChange(-1)}
                  disabled={dayCount <= 1}
                  aria-label="Fewer days"
                  className="w-10 h-full flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                >
                  -
                </button>
                <span className="flex-1 text-center font-bold text-sm text-slate-800" aria-live="polite">
                  {dayCount}
                </span>
                <button
                  type="button"
                  onClick={() => handleDayCountChange(1)}
                  disabled={dayCount >= MAX_DATES}
                  aria-label="More days"
                  className="w-10 h-full flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                >
                  +
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Select {dayCount} day{dayCount === 1 ? '' : 's'} ({selectedDates.length} chosen). Up to {MAX_DATES} days, within the next 14 days.
              </p>
            </div>

            <div role="group" aria-label="Choose ride dates" className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {getSelectableDates(startDate).map((date) => {
                const chosen = selectedDates.includes(date);
                const { weekday, label } = formatDateChip(date);
                return (
                  <button
                    key={date}
                    type="button"
                    aria-pressed={chosen}
                    disabled={!chosen && selectedDates.length >= dayCount}
                    onClick={() => handleToggleDate(date)}
                    className={`min-h-[44px] py-1.5 px-2 text-xs font-semibold rounded-xl border transition disabled:opacity-40 ${
                      chosen
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
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

          {/* Seats, Price & Contact */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-emerald-700 flex items-center gap-1.5">
              <Users className="w-4 h-4" /> 3. Seats, Price & WhatsApp
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Seat Stepper */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Available Seats <span className="text-rose-500">*</span>
                </label>
                {isBike ? (
                  <>
                    <div
                      aria-disabled="true"
                      aria-describedby="bike-seat-hint"
                      className="flex items-center justify-center border border-slate-200 rounded-xl bg-slate-100 h-[42px] font-bold text-sm text-slate-500"
                    >
                      1 seat
                    </div>
                    <p id="bike-seat-hint" className="text-xs text-slate-500 mt-1">
                      A bike carries 1 passenger, so seats are fixed at 1.
                    </p>
                  </>
                ) : (
                <div className="flex items-center border border-slate-200 rounded-xl overflow-hidden bg-slate-50 h-[42px]">
                  <button
                    type="button"
                    onClick={() => handleSeatChange(-1)}
                    disabled={formData.availableSeats <= 1}
                    className="w-10 h-full flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                  >
                    -
                  </button>
                  <span className="flex-1 text-center font-bold text-sm text-slate-800">
                    {formData.availableSeats}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSeatChange(1)}
                    disabled={formData.availableSeats >= 6}
                    className="w-10 h-full flex items-center justify-center font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
                )}
              </div>

              {/* Price per Seat */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Price per Seat (PKR) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  name="pricePerSeat"
                  required
                  min="0"
                  value={formData.pricePerSeat}
                  onChange={handleChange}
                  placeholder="e.g. 200"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* WhatsApp Contact */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  My WhatsApp number (optional, private, never shown to others)
                </label>
                <input
                  type="tel"
                  name="whatsappNumber"
                  value={formData.whatsappNumber}
                  onChange={handleChange}
                  placeholder="0310-5517386"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Gender Preference */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1">
                <Shield className="w-3.5 h-3.5 text-emerald-600" /> Gender Preference
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['Anyone', 'Male Only', 'Female Only'].map((pref) => (
                  <button
                    key={pref}
                    type="button"
                    onClick={() => setFormData({ ...formData, genderPreference: pref })}
                    className={`py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl border transition ${
                      formData.genderPreference === pref
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {pref}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Optional Details */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
              <Car className="w-4 h-4" /> 4. Optional Vehicle & Notes
            </h2>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Vehicle Details (Optional)
              </label>
              <input
                type="text"
                name="carDetails"
                value={formData.carDetails}
                onChange={handleChange}
                placeholder={isBike ? 'e.g. Red Honda CG-125 / Yamaha YBR' : 'e.g. White Honda Civic / Red Alto'}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Instructions or Trip Notes (Optional)
              </label>
              <textarea
                name="notes"
                rows="2"
                maxLength="300"
                value={formData.notes}
                onChange={handleChange}
                placeholder="e.g. Leaving on time from Shell pump. AC will be running. Light luggage only."
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
              ></textarea>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-6 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl transition shadow-md disabled:opacity-50 text-base"
          >
            {loading
              ? dayCount > 1 ? 'Publishing Rides...' : 'Publishing Ride...'
              : dayCount > 1 ? `Publish ${dayCount} Rides` : 'Publish Ride'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default OfferRide;