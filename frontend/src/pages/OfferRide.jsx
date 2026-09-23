import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusCircle, MapPin, Calendar, Clock, Users, DollarSign, Phone, Car, FileText, Shield, AlertCircle } from 'lucide-react';
import api from '../services/api';
import { getTodayDateString } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';

const OfferRide = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const todayStr = getTodayDateString();

  const [formData, setFormData] = useState({
    pickupLocation: '',
    destination: '',
    rideDate: todayStr,
    departureTime: '',
    availableSeats: 3,
    pricePerSeat: '',
    whatsappNumber: user?.phone || '',
    genderPreference: 'Anyone',
    carDetails: '',
    notes: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSeatChange = (delta) => {
    setFormData((prev) => {
      const updated = prev.availableSeats + delta;
      if (updated >= 1 && updated <= 6) {
        return { ...prev, availableSeats: updated };
      }
      return prev;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

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

    if (!formData.whatsappNumber.trim()) {
      setError('Please provide a WhatsApp contact number.');
      return;
    }

    setLoading(true);

    try {
      await api.post('/rides', {
        ...formData,
        availableSeats: Number(formData.availableSeats),
        pricePerSeat: Number(formData.pricePerSeat),
      });

      // Navigate to My Rides upon success
      navigate('/my-rides');
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to offer ride. Please check your inputs.');
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
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ride Date <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  name="rideDate"
                  required
                  min={todayStr}
                  value={formData.rideDate}
                  onChange={handleChange}
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
                  WhatsApp Contact <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  name="whatsappNumber"
                  required
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
                placeholder="e.g. White Honda Civic / Red Alto"
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
            {loading ? 'Publishing Ride...' : 'Publish Ride'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default OfferRide;