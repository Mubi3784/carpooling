import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Search, PlusCircle, Car, Bike, AlertCircle, SlidersHorizontal } from 'lucide-react';
import { getRides, getRequests } from '../services/api';
import RideCard from './RideCard';
import RequestCard from './RequestCard';
import OfferPicker from './OfferPicker';
import LoadingSkeleton from './LoadingSkeleton';
import OfflineNotice from './OfflineNotice';
import { useAuth } from '../context/AuthContext';
import { useMode } from '../context/ModeContext';
import { isNetworkError } from '../utils/networkError';
import { getTodayDateString, getTomorrowDateString } from '../utils/dateUtils';
import { buildFeedParams, countActiveFilters, emptyMessage } from '../utils/matches';
import { parseCommuteQuery, TIME_WINDOWS } from '../utils/nlpSearchParser';
import { buildRequestFeedParams, filterByKeyword, emptyStateFor } from '../utils/homeTabs';

const EMPTY_FILTERS = { timeFrom: '', timeTo: '', pickup: '', destination: '', minSeats: '', passengers: '' };
const filterFieldClass =
  'w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

const COPY = {
  rides: {
    search: 'Search rides by location, day or time',
    loadError: 'Unable to load rides. Please check your connection.',
    offline: 'current rides',
    noun: 'rides',
    panelLabel: 'Ride filters',
  },
  requests: {
    search: 'Search passenger requests by location, day or time',
    loadError: 'Unable to load passenger requests. Please check your connection.',
    offline: 'passenger requests',
    noun: 'passenger requests',
    panelLabel: 'Request filters',
  },
};

// Public rides feed (kind="rides") or other users' open requests (kind="requests")
const DiscoveryFeed = ({ kind }) => {
  const isRides = kind === 'rides';
  const copy = COPY[isRides ? 'rides' : 'requests'];
  const { user, isAuthenticated } = useAuth();
  const { mode } = useMode();
  const todayStr = getTodayDateString();
  const tomorrowStr = getTomorrowDateString();

  const [activeTab, setActiveTab] = useState('today'); // 'today' | 'tomorrow' | 'custom'
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [picker, setPicker] = useState(null);

  const [vehicleFilter, setVehicleFilter] = useState('ALL'); // 'ALL' | 'CAR' | 'BIKE'
  const requestId = useRef(0);

  // Server-side filters (P5). Text inputs are debounced before they reach the server.
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(min-width: 768px)').matches
  );
  useEffect(() => {
    const t = setTimeout(() => setApplied(filters), 400);
    return () => clearTimeout(t);
  }, [filters]);
  const built = useMemo(
    () => (isRides ? buildFeedParams(applied) : buildRequestFeedParams({ filters: applied })),
    [applied, isRides]
  );
  const filterError = built.error || '';
  const paramsKey = JSON.stringify(built.params || {});
  const activeFilterCount = countActiveFilters({ ...filters, vehicle: vehicleFilter });
  const setFilter = (name) => (e) => setFilters((prev) => ({ ...prev, [name]: e.target.value }));
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setApplied(EMPTY_FILTERS);
    setVehicleFilter('ALL');
  };

  const fetchItems = async (date, vehicle, extra = {}) => {
    const id = ++requestId.current; // ignore out-of-order responses
    setLoading(true);
    setError('');
    setOffline(false);
    try {
      const params = { date, ...(vehicle !== 'ALL' ? { vehicleType: vehicle } : {}), ...extra };
      const res = await (isRides ? getRides(params) : getRequests(params));
      if (id !== requestId.current) return;
      setItems(res.data.data);
    } catch (err) {
      if (id !== requestId.current) return;
      console.error(err);
      if (isNetworkError(err)) {
        setItems([]);
        setOffline(true);
        return;
      }
      setError(copy.loadError);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  };

  // Fetch whenever kind, date, vehicle or server filters change
  useEffect(() => {
    if (filterError) return;
    fetchItems(selectedDate, vehicleFilter, JSON.parse(paramsKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, selectedDate, vehicleFilter, paramsKey, filterError]);

  const refetch = () => fetchItems(selectedDate, vehicleFilter, JSON.parse(paramsKey));

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    if (tab === 'today') setSelectedDate(todayStr);
    else if (tab === 'tomorrow') setSelectedDate(tomorrowStr);
  };

  const handleCustomDateChange = (e) => {
    setSelectedDate(e.target.value);
    setActiveTab('custom');
  };

  // Natural-language / Roman Urdu intent detected in the search box
  const parsed = useMemo(() => parseCommuteQuery(searchKeyword), [searchKeyword]);

  // Switch date tabs only when the detected date intent changes, so a manual tab click still wins.
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

  const handleClearSearch = () => {
    const hadDateIntent = Boolean(parsed.targetDateTab);
    setSearchKeyword('');
    if (hadDateIntent) handleTabClick('today');
  };

  const detectedLabels = [];
  if (parsed.targetDateTab === 'today') detectedLabels.push('Today');
  if (parsed.targetDateTab === 'tomorrow') detectedLabels.push('Tomorrow');
  if (parsed.targetDateTab === 'custom' && parsed.customDate) {
    detectedLabels.push(`Day after tomorrow (${parsed.customDate})`);
  }
  if (parsed.timeOfDay) detectedLabels.push(TIME_WINDOWS[parsed.timeOfDay].label);
  detectedLabels.push(...parsed.parsedLocations);
  if (parsed.hasTokens && parsed.cleanKeyword) detectedLabels.push(`“${parsed.cleanKeyword}”`);

  const filtered = filterByKeyword(items, searchKeyword, parsed);
  const empty = emptyStateFor({ mode, tab: 'feed' });
  const dayLabel = selectedDate === todayStr ? 'Today' : selectedDate === tomorrowStr ? 'Tomorrow' : selectedDate;
  const idp = isRides ? 'ff' : 'fr'; // unique id prefix per kind

  const emptyBody = searchKeyword
    ? `No ${copy.noun} match "${searchKeyword}". Try clearing the search.`
    : countActiveFilters(filters) > 0
    ? `${emptyMessage()}. You can also clear the filters.`
    : vehicleFilter !== 'ALL'
    ? `No ${vehicleFilter === 'BIKE' ? 'bike' : 'car'} ${copy.noun} found for this date. Try another filter or day.`
    : empty.body;

  return (
    <div>
      {/* Segmented Day Filters */}
      <div className="bg-slate-200/70 p-1.5 rounded-2xl flex items-center gap-1 mb-4">
        <button
          type="button"
          aria-pressed={activeTab === 'today'}
          onClick={() => handleTabClick('today')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === 'today' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Today
        </button>
        <button
          type="button"
          aria-pressed={activeTab === 'tomorrow'}
          onClick={() => handleTabClick('tomorrow')}
          className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all ${
            activeTab === 'tomorrow' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          Tomorrow
        </button>
        <div className="relative flex-1">
          <input
            type="date"
            min={todayStr}
            value={selectedDate}
            onChange={handleCustomDateChange}
            aria-label="Pick a date"
            className={`w-full py-2 px-2 text-xs sm:text-sm font-semibold rounded-xl bg-transparent outline-none cursor-pointer text-center transition-all ${
              activeTab === 'custom' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          />
        </div>
      </div>

      {/* Vehicle Type Filter */}
      <div role="group" aria-label="Filter by vehicle type" className="flex items-center gap-2 mb-4">
        {[
          { value: 'ALL', label: 'All', Icon: null },
          { value: 'CAR', label: 'Car', Icon: Car },
          { value: 'BIKE', label: 'Bike', Icon: Bike },
        ].map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={vehicleFilter === value}
            onClick={() => setVehicleFilter(value)}
            className={`flex items-center gap-1.5 min-h-[40px] px-4 text-sm font-semibold rounded-xl border transition ${
              vehicleFilter === value
                ? 'bg-emerald-50 border-emerald-500 text-emerald-800'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
            {label}
          </button>
        ))}
      </div>

      {/* Filters panel */}
      <div className="mb-4">
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          aria-expanded={filtersOpen}
          aria-controls={`${idp}-filter-panel`}
          className="flex items-center gap-2 min-h-[40px] px-4 text-sm font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
        >
          <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
          Filters
          {activeFilterCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px]">{activeFilterCount}</span>
          )}
        </button>
        {filtersOpen && (
          <div id={`${idp}-filter-panel`} role="group" aria-label={copy.panelLabel} className="mt-3 bg-slate-50 border border-slate-200 rounded-2xl p-4 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${idp}-from`} className="block text-xs font-semibold text-slate-700 mb-1">Leaves after</label>
              <input id={`${idp}-from`} type="time" value={filters.timeFrom} onChange={setFilter('timeFrom')} className={filterFieldClass} />
            </div>
            <div>
              <label htmlFor={`${idp}-to`} className="block text-xs font-semibold text-slate-700 mb-1">Leaves before</label>
              <input id={`${idp}-to`} type="time" value={filters.timeTo} onChange={setFilter('timeTo')} className={filterFieldClass} />
            </div>
            {isRides ? (
              <>
                <div>
                  <label htmlFor="ff-pickup" className="block text-xs font-semibold text-slate-700 mb-1">Pickup</label>
                  <input id="ff-pickup" type="text" maxLength={50} value={filters.pickup} onChange={setFilter('pickup')} placeholder="e.g. Gulshan" className={filterFieldClass} />
                </div>
                <div>
                  <label htmlFor="ff-dest" className="block text-xs font-semibold text-slate-700 mb-1">Destination</label>
                  <input id="ff-dest" type="text" maxLength={50} value={filters.destination} onChange={setFilter('destination')} placeholder="e.g. University" className={filterFieldClass} />
                </div>
                <div>
                  <label htmlFor="ff-seats" className="block text-xs font-semibold text-slate-700 mb-1">Minimum seats</label>
                  <select id="ff-seats" value={filters.minSeats} onChange={setFilter('minSeats')} className={filterFieldClass}>
                    <option value="">Any</option>
                    {[1, 2, 3, 4, 5, 6].map((n) => (
                      <option key={n} value={String(n)}>{n}+</option>
                    ))}
                  </select>
                </div>
              </>
            ) : (
              <div>
                <label htmlFor="fr-passengers" className="block text-xs font-semibold text-slate-700 mb-1">Max passengers</label>
                <select id="fr-passengers" value={filters.passengers} onChange={setFilter('passengers')} className={filterFieldClass}>
                  <option value="">Any</option>
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={String(n)}>{n}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-end">
              <button
                type="button"
                onClick={clearFilters}
                disabled={activeFilterCount === 0}
                className="w-full min-h-[40px] px-4 text-sm font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Clear filters
              </button>
            </div>
            {filterError && <p role="alert" className="col-span-2 text-xs text-rose-700">{filterError}</p>}
          </div>
        )}
      </div>

      {/* Search Filter Box */}
      <div className={parsed.hasTokens ? 'mb-3' : 'mb-6'}>
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            type="text"
            value={searchKeyword}
            onChange={(e) => handleSearchChange(e.target.value)}
            aria-label={copy.search}
            placeholder='Try "kal subah nust" or Blue Area, F-10...'
            className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm"
          />
          {searchKeyword && (
            <button
              type="button"
              onClick={() => setSearchKeyword('')}
              aria-label="Clear search"
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              Clear
            </button>
          )}
        </div>

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

      {/* List */}
      {loading ? (
        <LoadingSkeleton />
      ) : offline ? (
        <OfflineNotice what={copy.offline} onRetry={refetch} />
      ) : error ? (
        <div role="alert" className="p-6 bg-rose-50 border border-rose-200 rounded-2xl text-center text-rose-700 text-sm">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 text-rose-500" aria-hidden="true" />
          <p>{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="mt-3 px-4 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      ) : filtered.length > 0 ? (
        isRides ? (
          <div className="space-y-3">
            {filtered.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                isOwn={!!user?.id && String(ride.driver?.id) === String(user.id)}
              />
            ))}
          </div>
        ) : (
          <ul className="space-y-3">
            {filtered.map((r) => (
              <RequestCard key={r.id} request={r} onOffer={setPicker} />
            ))}
          </ul>
        )
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 md:p-12 text-center">
          <div className="w-16 h-16 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
            <Car className="w-8 h-8" aria-hidden="true" />
          </div>
          <h3 className="text-lg font-bold text-slate-800 mb-1">
            {empty.title} ({dayLabel})
          </h3>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">{emptyBody}</p>
          <Link
            to={isAuthenticated ? empty.ctaTo : '/login'}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" aria-hidden="true" />
            <span>{empty.ctaLabel}</span>
          </Link>
        </div>
      )}

      {picker && <OfferPicker key={picker.id} target={picker} onClose={() => setPicker(null)} />}
    </div>
  );
};

export default DiscoveryFeed;
