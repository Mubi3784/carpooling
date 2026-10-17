import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Compass, LogOut, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getProfile, updateProfile } from '../services/api';
import NotificationsCard from '../components/NotificationsCard';

const inputClass =
  'w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500';

const Profile = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  // Private details live in LOCAL state only; never in AuthContext or storage.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState({ type: '', text: '' });

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await getProfile();
        const p = res.data?.data?.profile || {};
        if (!alive) return;
        setName(p.name || '');
        setEmail(p.email || '');
        setPhone(p.phone || '');
      } catch {
        if (alive) setLoadError("Couldn't load your profile. Check your connection and try again.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      setName('');
      setEmail('');
      setPhone('');
    };
  }, []);

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus({ type: '', text: '' });
    try {
      const res = await updateProfile({ name: name.trim(), phone: phone.trim() });
      const p = res.data?.data?.profile || {};
      setName(p.name ?? name);
      setPhone(p.phone ?? phone);
      setStatus({ type: 'ok', text: 'Profile saved.' });
    } catch (err) {
      setStatus({ type: 'error', text: err.response?.data?.message || "Couldn't save your profile. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 pb-24 space-y-4">
      <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Profile</h1>

      <section className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm" aria-labelledby="details-heading">
        <h2 id="details-heading" className="text-base font-bold text-slate-900 mb-3">Your details</h2>
        {loading ? (
          <p role="status" className="text-sm text-slate-500">Loading...</p>
        ) : loadError ? (
          <p role="alert" className="text-sm text-rose-700">{loadError}</p>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <div>
              <label htmlFor="pf-name" className="block text-xs font-semibold text-slate-700 mb-1">Name</label>
              <input id="pf-name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <label htmlFor="pf-email" className="block text-xs font-semibold text-slate-700 mb-1">Email (cannot be changed)</label>
              <input id="pf-email" className={`${inputClass} opacity-70`} value={email} readOnly />
            </div>
            <div>
              <label htmlFor="pf-phone" className="block text-xs font-semibold text-slate-700 mb-1">Phone number (private)</label>
              <input id="pf-phone" type="tel" className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <p className="text-xs text-slate-500">Your phone number and email are private and never shown to other users.</p>
            <button type="submit" disabled={saving} className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium disabled:opacity-50">
              {saving ? 'Saving...' : 'Save changes'}
            </button>
            <p role="status" aria-live="polite" className={`text-sm ${status.type === 'error' ? 'text-rose-700' : 'text-emerald-700'}`}>
              {status.text}
            </p>
          </form>
        )}
      </section>

      <NotificationsCard />

      <Link to="/road-status" className="flex items-center justify-between min-h-[44px] bg-white rounded-2xl p-4 border border-slate-200 shadow-sm text-sm font-semibold text-slate-800 hover:bg-slate-50">
        <span className="flex items-center gap-2"><Compass className="w-4 h-4 text-emerald-600" aria-hidden="true" /> Road Status</span>
        <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />
      </Link>

      <button type="button" onClick={handleLogout} className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2 bg-white border border-rose-200 text-rose-700 rounded-xl text-sm font-semibold hover:bg-rose-50">
        <LogOut className="w-4 h-4" aria-hidden="true" /> Log out
      </button>
    </div>
  );
};

export default Profile;
