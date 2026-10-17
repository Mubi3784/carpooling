import React from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Car, LogOut, LogIn, Compass, Inbox } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertContext';
import { useChatUnread } from '../context/ChatUnreadContext';
import { NAV_ITEMS, guestTarget, badgeFor } from '../utils/nav';
import { formatBadgeCount } from '../utils/requests';
import InstallButton from './InstallButton';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const { count: alertCount } = useAlerts();
  const { count: chatUnread } = useChatUnread();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const desktopLink = ({ isActive }) =>
    `flex items-center gap-1.5 transition-colors ${isActive ? 'text-emerald-600' : 'hover:text-emerald-600'}`;

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-xl text-slate-900 tracking-tight">
          <div className="w-9 h-9 bg-emerald-600 text-white rounded-xl flex items-center justify-center shadow-sm">
            <Car className="w-5 h-5" />
          </div>
          <span>Carpool</span>
        </Link>

        {/* Desktop navigation: same 4 destinations as the mobile bottom nav */}
        <nav aria-label="Main" className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.key}
              to={guestTarget(item, isAuthenticated)}
              end={item.to === '/'}
              className={desktopLink}
            >
              {item.label}
              {isAuthenticated && badgeFor(item.key, { alerts: alertCount, chatUnread }) > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                  {formatBadgeCount(badgeFor(item.key, { alerts: alertCount, chatUnread }))}
                </span>
              )}
            </NavLink>
          ))}
          <Link to="/road-status" className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors">
            <Compass className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            <span>Road Status</span>
          </Link>
        </nav>

        {/* Auth Buttons */}
        <div className="flex items-center gap-1 sm:gap-3">
          {/* Offers & Requests inbox with alert badge */}
          {isAuthenticated && (
            <Link
              to="/matches"
              className="relative p-2 rounded-lg text-slate-600 hover:bg-slate-100 flex items-center gap-1.5 text-sm font-medium"
              aria-label={alertCount > 0 ? `Offers and requests, ${alertCount} new` : 'Offers and requests'}
            >
              <Inbox className="w-5 h-5" aria-hidden="true" />
              <span className="hidden md:inline">Offers &amp; Requests</span>
              {alertCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center" aria-hidden="true">
                  {formatBadgeCount(alertCount)}
                </span>
              )}
            </Link>
          )}
          <InstallButton variant="navbar" />
          {isAuthenticated ? (
            <div className="hidden md:flex items-center gap-4">
              <span className="text-sm font-medium text-slate-700">
                Hi, {user?.name?.split(' ')[0]} {user?.role === 'admin' && <span className="text-xs bg-slate-900 text-white px-2 py-0.5 rounded-md ml-1 font-bold">Admin</span>}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-rose-600 transition-colors p-2 rounded-lg hover:bg-slate-100"
                title="Logout"
              >
                <LogOut className="w-4 h-4" aria-hidden="true" />
                <span>Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="flex items-center gap-1 px-2 sm:px-4 py-2 text-sm font-medium text-slate-700 hover:text-emerald-600 transition-colors"
              >
                <LogIn className="w-4 h-4" aria-hidden="true" />
                <span>Login</span>
              </Link>
              <Link
                to="/register"
                className="px-3 sm:px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm"
              >
                Register
              </Link>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
