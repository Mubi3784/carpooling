import React, { useRef } from 'react';
import { Users, Car, Check } from 'lucide-react';
import { useMode } from '../context/ModeContext';
import { nextModeFromKey } from '../utils/mode';

const OPTIONS = [
  { value: 'passenger', label: 'Passenger Mode', Icon: Users },
  { value: 'driver', label: 'Driver Mode', Icon: Car },
];

// Accessible two-option segmented control (radiogroup, roving tabindex, arrow keys).
const ModeSwitcher = () => {
  const { mode, setMode } = useMode();
  const refs = useRef({});

  const onKeyDown = (e) => {
    const next = nextModeFromKey(mode, e.key);
    if (next !== mode || ['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      setMode(next);
      refs.current[next]?.focus();
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label="Choose mode"
      onKeyDown={onKeyDown}
      className="bg-slate-200/70 p-1.5 rounded-2xl flex items-center gap-1 mb-4 w-full"
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = mode === value;
        return (
          <button
            key={value}
            ref={(el) => { refs.current[value] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => setMode(value)}
            className={`flex-1 min-w-0 min-h-[44px] px-2 flex items-center justify-center gap-1.5 text-sm font-semibold rounded-xl transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600 ${
              selected ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-700 hover:bg-white/60'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            <span className="truncate">{label}</span>
            {selected && <Check className="w-4 h-4 flex-shrink-0" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
};

export default ModeSwitcher;
