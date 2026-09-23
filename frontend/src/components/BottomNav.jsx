import React from 'react';
import { NavLink } from 'react-router-dom';
import { Compass, PlusCircle, ListFilter, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const BottomNav = () => {
  const { isAuthenticated } = useAuth();

  const navClass = ({ isActive }) =>
    `flex flex-col items-center justify-center w-full py-2 text-xs font-medium transition-colors ${
      isActive ? 'text-emerald-600' : 'text-slate-400 hover:text-slate-600'
    }`;

  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg px-2">
      <div className="flex justify-around items-center h-14">
        {/* Browse Rides */}
        <NavLink to="/" className={navClass} end>
          <Compass className="w-5 h-5 mb-0.5" />
          <span>Browse</span>
        </NavLink>

        {/* Offer Ride (Action) */}
        <NavLink to="/offer-ride" className={navClass}>
          <PlusCircle className="w-5 h-5 mb-0.5 text-emerald-600" />
          <span>Offer</span>
        </NavLink>

        {/* My Rides (if logged in) */}
        {isAuthenticated && (
          <NavLink to="/my-rides" className={navClass}>
            <ListFilter className="w-5 h-5 mb-0.5" />
            <span>My Rides</span>
          </NavLink>
        )}

        {/* Login (if guest) */}
        {!isAuthenticated && (
          <NavLink to="/login" className={navClass}>
            <User className="w-5 h-5 mb-0.5" />
            <span>Login</span>
          </NavLink>
        )}
      </div>
    </div>
  );
};

export default BottomNav;