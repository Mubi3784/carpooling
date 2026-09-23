import React from 'react';

const LoadingSkeleton = () => {
  return (
    <div className="space-y-4">
      {[1, 2, 3].map((item) => (
        <div
          key={item}
          className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm animate-pulse"
        >
          <div className="flex justify-between items-center mb-4">
            <div className="h-5 bg-slate-200 rounded w-1/3"></div>
            <div className="h-6 bg-slate-200 rounded-full w-20"></div>
          </div>
          <div className="h-4 bg-slate-100 rounded w-1/2 mb-3"></div>
          <div className="flex gap-2 pt-3 border-t border-slate-100">
            <div className="h-6 bg-slate-100 rounded w-16"></div>
            <div className="h-6 bg-slate-100 rounded w-24"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default LoadingSkeleton;