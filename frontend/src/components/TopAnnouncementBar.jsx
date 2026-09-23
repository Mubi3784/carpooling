import React from 'react';
import { PhoneCall } from 'lucide-react';

const TopAnnouncementBar = () => {
  return (
    <aside
      aria-label="Announcement"
      className="w-full bg-slate-900 text-slate-100 text-xs sm:text-sm py-2 border-b border-slate-800 overflow-hidden relative z-50 select-none"
    >
      <div className="w-full overflow-hidden flex">
        <div className="animate-marquee flex items-center gap-2 cursor-pointer">
          <span className="font-semibold text-emerald-400">Notice:</span>
          <span>This application is currently operating under a free trial.</span>
          <span className="text-slate-400 hidden sm:inline">•</span>
          <span>If you would like to contribute, share feedback, or report an issue, please contact us at:</span>
          <a
            href="tel:03105517386"
            className="inline-flex items-center gap-1 font-bold text-emerald-400 underline decoration-emerald-400 hover:text-emerald-300 ml-1 px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
            title="Call 0310-5517386"
          >
            <PhoneCall className="w-3 h-3 text-emerald-400" />
            <span>0310-5517386</span>
          </a>
          {/* pashto */}
          <span className="font-semibold text-emerald-400">Notice:</span>
          <span>Da application os free trial ke chaligi.</span>
          <span className="text-slate-400 hidden sm:inline">•</span>
          <span>Ka taso mrasta kawal, feedback wrkawal, ya da kom maslay report kawal ghwarai, no pa de shmera moong sara rabta wakrai:</span>
          <a
            href="tel:03105517386"
            className="inline-flex items-center gap-1 font-bold text-emerald-400 underline decoration-emerald-400 hover:text-emerald-300 ml-1 px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
            title="Call 0310-5517386"
          >
            <PhoneCall className="w-3 h-3 text-emerald-400" />
            <span>0310-5517386</span>
          </a>
          {/* urdu */}
          <span className="font-semibold text-emerald-400">Notice:</span>
          <span>Yeh application filhal free trial par chal rahi hai.</span>
          <span className="text-slate-400 hidden sm:inline">•</span>
          <span>Agar aap taawun karna chahte hain, feedback dena chahte hain, ya kisi maslay ki report karna chahte hain, to hum se is number par rabta karein:</span>
          <a
            href="tel:03105517386"
            className="inline-flex items-center gap-1 font-bold text-emerald-400 underline decoration-emerald-400 hover:text-emerald-300 ml-1 px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors"
            title="Call 0310-5517386"
          >
            <PhoneCall className="w-3 h-3 text-emerald-400" />
            <span>0310-5517386</span>
          </a>
        </div>
      </div>
    </aside>
  );
};

export default TopAnnouncementBar;