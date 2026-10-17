import React from 'react';
import { Link } from 'react-router-dom';

const LoginPrompt = ({ message }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
    <p className="text-sm text-slate-700 mb-4">{message}</p>
    <div className="flex items-center justify-center gap-3">
      <Link
        to="/login"
        state={{ from: { pathname: '/' } }}
        className="inline-flex items-center min-h-[44px] px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium"
      >
        Log in
      </Link>
      <Link
        to="/register"
        className="inline-flex items-center min-h-[44px] px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-medium"
      >
        Register
      </Link>
    </div>
  </div>
);

export default LoginPrompt;
