import React, { useState, useEffect, useCallback } from 'react';
import { Search, SlidersHorizontal, Info } from 'lucide-react';
import { getRequests } from '../services/api';
import OfflineNotice from '../components/OfflineNotice';
import RequestCard from '../components/RequestCard';
import OfferPicker from '../components/OfferPicker';
import { isNetworkError } from '../utils/networkError';

const fieldClass =
  'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

const Requests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [filters, setFilters] = useState({ date: '', vehicleType: '', timeFrom: '', timeTo: '', keyword: '', passengers: '' });
  const [picker, setPicker] = useState(null);

  const fetchRequests = useCallback(async (f) => {
    setLoading(true);
    setError('');
    setOffline(false);
    try {
      const params = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== ''));
      const res = await getRequests(params);
      setRequests(res.data.data);
    } catch (err) {
      if (isNetworkError(err)) {
        setRequests([]);
        setOffline(true);
        return;
      }
      setError(err.response?.data?.message || 'Unable to load passenger requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests({ date: '', vehicleType: '', timeFrom: '', timeTo: '', keyword: '', passengers: '' });
  }, [fetchRequests]);

  const setFilter = (name) => (e) => setFilters((prev) => ({ ...prev, [name]: e.target.value }));
  const [filtersOpen, setFiltersOpen] = useState(
    () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(min-width: 768px)').matches
  );
  const [filterError, setFilterError] = useState('');
  const activeFilterCount = ['date', 'vehicleType', 'timeFrom', 'timeTo', 'keyword', 'passengers'].filter(
    (k) => filters[k] !== ''
  ).length;
  const submit = (e) => {
    e.preventDefault();
    if (filters.timeFrom && filters.timeTo && filters.timeFrom > filters.timeTo) {
      setFilterError('From time cannot be later than to time');
      return;
    }
    setFilterError('');
    fetchRequests(filters);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8">
      <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Passenger Requests</h1>
      <p className="text-xs sm:text-sm text-slate-500 mt-0.5 mb-4">Offer one of your rides to a passenger who needs a seat</p>

      <div className="mb-4 p-3 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-start gap-2">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
        <span>A request or offer does not guarantee a seat until accepted.</span>
      </div>

      <button
        type="button"
        onClick={() => setFiltersOpen((o) => !o)}
        aria-expanded={filtersOpen}
        aria-controls="request-filter-form"
        className="flex items-center gap-2 min-h-[40px] px-4 mb-3 text-sm font-semibold rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      >
        <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
        Filters
        {activeFilterCount > 0 && (
          <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px]">{activeFilterCount}</span>
        )}
      </button>

      <form id="request-filter-form" hidden={!filtersOpen} onSubmit={submit} className="bg-white border border-slate-200 rounded-2xl p-4 mb-5 grid grid-cols-2 sm:grid-cols-3 gap-3" aria-label="Filter requests">
        <div>
          <label htmlFor="f-date" className="block text-xs font-semibold text-slate-700 mb-1">Date</label>
          <input id="f-date" type="date" value={filters.date} onChange={setFilter('date')} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="f-vehicle" className="block text-xs font-semibold text-slate-700 mb-1">Vehicle</label>
          <select id="f-vehicle" value={filters.vehicleType} onChange={setFilter('vehicleType')} className={fieldClass}>
            <option value="">All</option>
            <option value="CAR">Car</option>
            <option value="BIKE">Bike</option>
          </select>
        </div>
        <div>
          <label htmlFor="f-keyword" className="block text-xs font-semibold text-slate-700 mb-1">Keyword</label>
          <input id="f-keyword" type="text" maxLength={50} value={filters.keyword} onChange={setFilter('keyword')} placeholder="Pickup or destination" className={fieldClass} />
        </div>
        <div>
          <label htmlFor="f-from" className="block text-xs font-semibold text-slate-700 mb-1">From time</label>
          <input id="f-from" type="time" value={filters.timeFrom} onChange={setFilter('timeFrom')} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="f-to" className="block text-xs font-semibold text-slate-700 mb-1">To time</label>
          <input id="f-to" type="time" value={filters.timeTo} onChange={setFilter('timeTo')} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="f-passengers" className="block text-xs font-semibold text-slate-700 mb-1">Max passengers</label>
          <select id="f-passengers" value={filters.passengers} onChange={setFilter('passengers')} className={fieldClass}>
            <option value="">Any</option>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={String(n)}>{n}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button type="submit" className="w-full flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium">
            <Search className="w-4 h-4" aria-hidden="true" /> Search
          </button>
        </div>
        {filterError && <p role="alert" className="col-span-2 sm:col-span-3 text-xs text-rose-700">{filterError}</p>}
      </form>

      {loading ? (
        <div className="py-12 text-center text-slate-500" role="status">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm">Loading requests...</p>
        </div>
      ) : offline ? (
        <OfflineNotice what="passenger requests" onRetry={() => fetchRequests(filters)} />
      ) : error ? (
        <div role="alert" className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm text-center">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => fetchRequests(filters)}
            className="mt-3 px-4 py-1.5 bg-white border border-rose-200 rounded-lg text-xs font-semibold hover:bg-rose-100"
          >
            Retry
          </button>
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">
          No passenger requests match right now. Try different filters later.
        </div>
      ) : (
        <ul className="space-y-3">
          {requests.map((r) => (
            <RequestCard key={r.id} request={r} onOffer={setPicker} />
          ))}
        </ul>
      )}

      {picker && <OfferPicker key={picker.id} target={picker} onClose={() => setPicker(null)} />}
    </div>
  );
};

export default Requests;
