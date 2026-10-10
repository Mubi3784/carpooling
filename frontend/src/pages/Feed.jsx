import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Search, PlusCircle, Car, AlertCircle } from 'lucide-react';
import api from '../services/api';
import RideCard from '../components/RideCard';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { getTodayDateString, getTomorrowDateString } from '../utils/dateUtils';
import {
  parseCommuteQuery,
  matchesLandmark,
  isDepartureInTimeWindow,
  TIME_WINDOWS,
} from '../utils/nlpSearchParser';

const Feed = () => {
  const todayStr = getTodayDateString();
  const tomorrowStr = getTomorrowDateString();

  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'tomorrow' | 'custom'
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [rides, setRides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch rides whenever date changes
  useEffect(() => {
    fetchRides(selectedDate);
  }, [selectedDate]);

  const fetchRides = async (date) => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get(`/rides?date=${date}`);
      setRides(res.data.data);
    } catch (err) {
      console.error(err);
      setError('Unable to load rides. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    if (tab === 'today') {
      setSelectedDate(todayStr);
    } else if (tab === 'tomorrow') {
      setSelectedDate(tomorrowStr);
    }
  };

  const handleCustomDateChange = (e) => {
    const val = e.target.value;
    setSelectedDate(val);
    setActiveTab('custom');
  };

  // Natural-language / Roman Urdu intent detected in the search box
  const parsed = useMemo(() => parseCommuteQuery(searchKeyword), [searchKeyword]);

  // Run the parser on every keystroke; switch date tabs only when the detected
  // date intent changes, so a manual tab click afterwards still wins.
  const handleSearchChange = (value) => {
    const previous = parseCommuteQuery(searchKeyword);
    const next = parseCommuteQuery(value);
    setSearchKeyword(value);

    const dateIntentChanged =
      next.targetDateTab !== previous.targetDateTab || next.customDate !== previous.customDate;
    if (!next.targetDateTab || !dateIntentChanged) return;

    if (next.targetDateTab === 'today' || next.targetDateTab === 'tomorrow') {
      handleTabClick(next.targetDateTab);
    } else if (next.targetDateTab === 'custom' && next.customDate) {
      setSelectedDate(next.customDate);
      setActiveTab('custom');
    }
  };

  // Clear search text and any NLP-driven date selection
  const handleClearSearch = () => {
    const hadDateIntent = Boolean(parsed.targetDateTab);
    setSearchKeyword('');
    if (hadDateIntent) {
      handleTabClick('today');
    }
  };

  // Human-readable summary of detected tokens for the pill badge
  const detectedLabels = [];
  if (parsed.targetDateTab === 'today') detectedLabels.push('Today');
  if (parsed.targetDateTab === 'tomorrow') detectedLabels.push('Tomorrow');
  if (parsed.targetDateTab === 'custom' && parsed.customDate) {
    detectedLabels.push(`Day after tomorrow (${parsed.customDate})`);
  }
  if (parsed.timeOfDay) detectedLabels.push(TIME_WINDOWS[parsed.timeOfDay].label);
  detectedLabels.push(...parsed.parsedLocations);
  if (parsed.hasTokens && parsed.cleanKeyword) detectedLabels.push(`“${parsed.cleanKeyword}”`);

  // Filter rides in memory by keyword (pickup or destination)
  const filteredRides = rides.filter((ride) => {
    if (!searchKeyword.trim()) return true;

    // No NLP tokens detected: keep the original plain substring search
    if (!parsed.hasTokens) {
      const term = searchKeyword.toLowerCase();
      return (
        ride.pickupLocation.toLowerCase().includes(term) ||
        ride.destination.toLowerCase().includes(term)
      );
    }

    const locationsMatch = parsed.parsedLocations.every(
      (label) => matchesLandmark(ride.pickupLocation, label) || matchesLandmark(ride.destination, label)
    );
    if (!locationsMatch) return false;

    if (!isDepartureInTimeWindow(ride.departureTime, parsed.timeOfDay)) return false;

    if (parsed.cleanKeyword) {
      const term = parsed.cleanKeyword.toLowerCase();
      return (
        ride.pickupLocation.toLowerCase().includes(term) ||
        ride.destination.toLowerCase().includes(term)
      );
    }
    return true;
  });

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8">
      {/* Title & Offer Action Banner */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Available Carpools
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Share rides, split fuel, and travel comfortably
          </p>
        </div>
        <Link
          to="/offer-ride"
          className="hidden sm:flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium shadow-sm transition-all"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Offer Ride</span>
        </Link>
      </div>

      {/* Segmented Day Filters */}
      <div className="bg-slate-200/70 p-1.5 rounded-2xl flex items-center gap-1 mb-4">
        {/* Today Tab */}
        <button
          onClick={() => handleTabClick('today')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === 'today'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Today
        </button>

        {/* Tomorrow Tab */}
        <button
          onClick={() => handleTabClick('tomorrow')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === 'tomorrow'
              ? 'bg-white text-slate-900 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Tomorrow
        </button>

        {/* Pick Custom Date */}
        <div className="relative flex-1">
          <input
            type="date"
            min={todayStr}
            value={selectedDate}
            onChange={handleCustomDateChange}
            className={`w-full py-2 px-2 text-xs sm:text-sm font-semibold rounded-xl bg-transparent outline-none cursor-pointer text-center transition-all ${
              activeTab === 'custom'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          />
        </div>
      </div>

      {/* Search Filter Box */}
      <div className={parsed.hasTokens ? 'mb-3' : 'mb-6'}>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label="Search rides by location, day or time"
            placeholder='Try "kal subah nust" or Blue Area, F-10...'
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm"
          />
          {searchKeyword && (
            <button
              onClick={() => setSearchKeyword('')}
              aria-label="Clear search"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

        {/* Detected NLP intent pill */}
        <div role="status" aria-live="polite">
          {parsed.hasTokens && (
            <div className="mt-2 inline-flex flex-wrap items-center gap-2 px-3 py-1 bg-emerald-50 border border-emerald-200 rounded-full text-xs text-emerald-800">
              <span>
                <span aria-hidden="true">🎯 </span>
                Detected: {detectedLabels.join(' | ')}
              </span>
              <button
                type="button"
                onClick={handleClearSearch}
                aria-label="Clear search and detected filters"
                className="font-semibold text-emerald-900 hover:text-emerald-700 underline-offset-2 hover:underline"
              >
                × Clear
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Rides List Section */}
      {loading ? (
        <LoadingSkeleton />
      ) : error ? (
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center text-rose-700 text-sm">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" />
          <p>{error}</p>
          <button
            onClick={() => fetchRides(selectedDate)}
            className="mt-3 px-4 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      ) : filteredRides.length > 0 ? (
        <div className="space-y-3">
          {filteredRides.map((ride) => (
            <RideCard key={ride.id} ride={ride} />
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white border border-slate-200 rounded-2xl p-8 md:p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Car className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">
            No rides found for {selectedDate === todayStr ? 'Today' : selectedDate === tomorrowStr ? 'Tomorrow' : selectedDate}
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
            {searchKeyword
              ? `No rides match "${searchKeyword}". Try clearing the search.`
              : 'No drivers have scheduled a ride for this date yet. Be the first to offer one!'}
          </p>
          <Link
            to="/offer-ride"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Offer a Ride</span>
          </Link>
        </div>
      )}
    </div>
  );
};

export default Feed;