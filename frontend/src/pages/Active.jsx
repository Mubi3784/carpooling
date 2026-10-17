import React from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useMode } from '../context/ModeContext';
import ModeSwitcher from '../components/ModeSwitcher';
import ModeFab from '../components/ModeFab';
import MyRequests from './MyRequests';
import MyRides from './MyRides';
import Matches from './Matches';

// Mode-aware "Active Rides": passenger sees requests + offers; driver sees rides + join requests.
const Active = () => {
  const { isDriver } = useMode();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 pb-24">
      <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight mb-4">Active Rides</h1>
      <ModeSwitcher />

      {isDriver ? (
        <>
          <MyRides embedded />
          <Link
            to="/requests"
            className="mt-6 flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            Browse Passenger Requests
          </Link>
        </>
      ) : (
        <>
          <MyRequests embedded />
          <Link
            to="/"
            className="mt-6 flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Search className="w-4 h-4" aria-hidden="true" />
            Find Rides
          </Link>
        </>
      )}

      <Matches embedded />
      <ModeFab />
    </div>
  );
};

export default Active;
