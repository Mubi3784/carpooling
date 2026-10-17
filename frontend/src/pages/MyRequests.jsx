import React from 'react';
import MyRequestsList from '../components/MyRequestsList';

const MyRequests = ({ embedded = false }) => (
  <div className={embedded ? '' : 'max-w-3xl mx-auto px-4 py-6 md:py-8 pb-24'}>
    <div className="mb-6">
      {embedded ? (
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">My Requests</h2>
      ) : (
        <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">My Requests</h1>
      )}
      <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Expired requests stay here for 24 hours</p>
    </div>
    <MyRequestsList />
  </div>
);

export default MyRequests;
