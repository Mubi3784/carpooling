import React from 'react';

// Text chips (never colour only) explaining why an item was suggested
const ReasonChips = ({ reasons = [] }) => (
  <ul aria-label="Why this matches" className="flex flex-wrap gap-1.5 mt-2">
    {reasons.map((reason) => (
      <li
        key={reason}
        className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] font-medium text-slate-700"
      >
        {reason}
      </li>
    ))}
  </ul>
);

export default ReasonChips;
