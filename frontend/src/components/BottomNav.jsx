import React from 'react';
import { NavLink } from 'react-router-dom';
import { Home, ListChecks, MessageCircle, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useChatUnread } from '../context/ChatUnreadContext';
import { useAlerts } from '../context/AlertContext';
import { NAV_ITEMS, guestTarget, badgeFor } from '../utils/nav';
import { formatBadgeCount } from '../utils/requests';

const ICONS = { home: Home, active: ListChecks, chat: MessageCircle, profile: User };

const BottomNav = () => {
  const { isAuthenticated } = useAuth();
  const { count: unread } = useChatUnread();
  const { count: alerts } = useAlerts();

  const navClass = ({ isActive }) =>
    `relative flex flex-col items-center justify-center w-full py-2 text-xs font-medium transition-colors ${
      isActive ? 'text-emerald-600' : 'text-slate-500 hover:text-slate-700'
    }`;

  return (
    <nav aria-label="Primary" className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg px-2 pb-safe">
      <div className="flex justify-around items-center h-14">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.key];
          const badge = isAuthenticated ? badgeFor(item.key, { alerts, chatUnread: unread }) : 0;
          const showBadge = badge > 0;
          return (
            <NavLink
              key={item.key}
              to={guestTarget(item, isAuthenticated)}
              state={item.protected && !isAuthenticated ? { from: { pathname: item.to } } : undefined}
              end={item.to === '/'}
              className={navClass}
              aria-label={showBadge ? `${item.label}, ${badge} new` : item.label}
            >
              <span className="relative">
                <Icon className="w-5 h-5 mb-0.5" aria-hidden="true" />
                {showBadge && (
                  <span className="absolute -top-1.5 -right-3 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center" aria-hidden="true">
                    {formatBadgeCount(badge)}
                  </span>
                )}
              </span>
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
