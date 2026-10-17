import React, { useRef } from 'react';
import { Check } from 'lucide-react';
import { nextTabId } from '../utils/homeTabs';

// Accessible tablist (roving tabindex, arrow/Home/End keys). The tabpanel is rendered by the page.
const HomeTabs = ({ tabs, selected, onSelect, label }) => {
  const refs = useRef({});

  const onKeyDown = (e) => {
    const next = nextTabId(tabs, selected, e.key);
    if (['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      if (next !== selected) onSelect(next);
      refs.current[next]?.focus();
    }
  };

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown} className="flex items-center gap-1 mb-4 border-b border-slate-200">
      {tabs.map((t) => {
        const isSelected = t.id === selected;
        return (
          <button
            key={t.id}
            ref={(el) => { refs.current[t.id] = el; }}
            type="button"
            role="tab"
            id={`home-tab-${t.id}`}
            aria-selected={isSelected}
            aria-controls="home-tabpanel"
            tabIndex={isSelected ? 0 : -1}
            onClick={() => onSelect(t.id)}
            className={`flex-1 min-w-0 min-h-[44px] px-2 flex items-center justify-center gap-1.5 text-sm border-b-2 -mb-px transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              isSelected
                ? 'border-emerald-600 text-emerald-800 font-bold'
                : 'border-transparent text-slate-600 font-medium hover:text-slate-900'
            }`}
          >
            {isSelected && <Check className="w-4 h-4 flex-shrink-0" aria-hidden="true" />}
            <span className="truncate">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
};

export default HomeTabs;
