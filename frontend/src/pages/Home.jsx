import React from 'react';
import { Link } from 'react-router-dom';
import { Car, PlusCircle } from 'lucide-react';

const Home = () => {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8 text-center">
      <div className="bg-emerald-50 border border-emerald-100 rounded-3xl p-8 md:p-12 mb-8">
        <h1 className="text-3xl md:text-5xl font-extrabold text-slate-900 tracking-tight mb-4">
          Share your daily commute, <br className="hidden md:inline" />
          <span className="text-primary">cut fuel costs.</span>
        </h1>
        <p className="text-slate-600 max-w-xl mx-auto mb-8 text-base md:text-lg">
          Connect with drivers heading your way. No booking fees, coordinate directly on WhatsApp.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/offer-ride"
            className="w-full sm:w-auto px-6 py-3 bg-primary hover:bg-primary-hover text-white font-medium rounded-xl transition shadow-md flex items-center justify-center gap-2"
          >
            <PlusCircle className="w-5 h-5" />
            Offer a Ride
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;