import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Car, PlusCircle, LogOut, LogIn, ListFilter } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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

        {/* Desktop Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
          <Link to="/" className="hover:text-emerald-600 transition-colors">
            Browse Rides
          </Link>
          <Link
            to="/offer-ride"
            className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors"
          >
            <PlusCircle className="w-4 h-4" />
            Offer a Ride
          </Link>
          {isAuthenticated && (
            <Link
              to="/my-rides"
              className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors"
            >
              <ListFilter className="w-4 h-4" />
              My Rides
            </Link>
          )}
        </nav>

        {/* Auth Buttons */}
        <div className="flex items-center gap-3">
          {isAuthenticated ? (
            <div className="flex items-center gap-4">
              <span className="hidden sm:inline-block text-sm font-medium text-slate-700">
                Hi, {user?.name?.split(' ')[0]}
              </span>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 text-sm text-slate-500 hover:text-rose-600 transition-colors p-2 rounded-lg hover:bg-slate-100"
                title="Logout"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Link
                to="/login"
                className="flex items-center gap-1 px-4 py-2 text-sm font-medium text-slate-700 hover:text-emerald-600 transition-colors"
              >
                <LogIn className="w-4 h-4" />
                <span>Login</span>
              </Link>
              <Link
                to="/register"
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl transition-all shadow-sm"
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