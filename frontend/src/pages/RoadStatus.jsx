import React, { useState, useEffect } from 'react';
import {
  Compass,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  PlusCircle,
  Edit2,
  Trash2,
  Search,
  X,
  ShieldAlert,
} from 'lucide-react';
import api from '../services/api';
import { formatRoadStatusDate } from '../utils/dateUtils';
import { useAuth } from '../context/AuthContext';
import ConfirmationModal from '../components/ConfirmationModal';

const RoadStatus = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [roads, setRoads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchKeyword, setSearchKeyword] = useState('');

  // Modal State for Admin (Add / Edit)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRoad, setEditingRoad] = useState(null);
  const [formData, setFormData] = useState({
    roadName: '',
    status: 'OPEN',
    category: 'Twin Cities',
    description: '',
  });
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState('');

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [roadToDelete, setRoadToDelete] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    fetchRoadStatuses();
  }, [activeCategory]);

  const fetchRoadStatuses = async () => {
    setLoading(true);
    setError('');
    try {
      const url =
        activeCategory === 'All'
          ? '/road-status'
          : `/road-status?category=${encodeURIComponent(activeCategory)}`;
      const res = await api.get(url);
      setRoads(res.data.data);
    } catch (err) {
      console.error(err);
      setError('Unable to load road conditions. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  // Open modal for Create
  const handleOpenCreateModal = () => {
    setEditingRoad(null);
    setFormData({
      roadName: '',
      status: 'OPEN',
      category: 'Twin Cities',
      description: '',
    });
    setFormError('');
    setIsModalOpen(true);
  };

  // Open modal for Edit
  const handleOpenEditModal = (road) => {
    setEditingRoad(road);
    setFormData({
      roadName: road.roadName,
      status: road.status,
      category: road.category,
      description: road.description || '',
    });
    setFormError('');
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingRoad(null);
  };

  // Submit Admin Create or Edit
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formData.roadName.trim()) {
      setFormError('Road name is required');
      return;
    }

    setFormLoading(true);
    try {
      if (editingRoad) {
        await api.put(`/road-status/${editingRoad.id}`, formData);
      } else {
        await api.post('/road-status', formData);
      }
      handleCloseModal();
      fetchRoadStatuses();
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.message || 'Error saving road status');
    } finally {
      setFormLoading(false);
    }
  };

  // Open Delete Modal
  const openDeleteModal = (road) => {
    setRoadToDelete(road);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setRoadToDelete(null);
    setDeleteModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!roadToDelete) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/road-status/${roadToDelete.id}`);
      setRoads((prev) => prev.filter((r) => r.id !== roadToDelete.id));
      closeDeleteModal();
    } catch (err) {
      console.error(err);
      alert(err.response?.data?.message || 'Failed to delete road update');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Filter in memory by search keyword
  const filteredRoads = roads.filter((r) => {
    if (!searchKeyword.trim()) return true;
    return r.roadName.toLowerCase().includes(searchKeyword.toLowerCase());
  });

  // Calculate quick summary metrics
  const closedCount = roads.filter((r) => r.status === 'CLOSED').length;
  const restrictedCount = roads.filter((r) => r.status === 'RESTRICTED').length;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2">
            <Compass className="w-7 h-7 text-emerald-600" />
            <span>Road Status</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Current road situations, protest diversions & highway access
          </p>
        </div>

        {/* Admin Action Button */}
        {isAdmin && (
          <button
            onClick={handleOpenCreateModal}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-medium shadow-sm transition"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Add Road Update</span>
          </button>
        )}
      </div>

      {/* Summary Announcement Banner */}
      <div className="mb-6 p-4 rounded-2xl border text-sm flex items-start gap-3 shadow-sm bg-white border-slate-200">
        <div className="p-2 rounded-xl bg-slate-50 text-slate-700 flex-shrink-0">
          <ShieldAlert className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-slate-900 mb-0.5">Twin Cities Route Summary</h3>
          <p className="text-slate-600 text-xs sm:text-sm leading-relaxed">
            {closedCount === 0 && restrictedCount === 0 ? (
              <span className="text-emerald-700 font-semibold">
                ✅ No major roads are currently closed within the Twin Cities.
              </span>
            ) : (
              <span>
                {closedCount > 0 && (
                  <span className="text-rose-600 font-bold mr-2">
                    ❌ {closedCount} road{closedCount > 1 ? 's' : ''} closed
                  </span>
                )}
                {restrictedCount > 0 && (
                  <span className="text-amber-600 font-bold">
                    ⚠️ {restrictedCount} route{restrictedCount > 1 ? 's' : ''} restricted
                  </span>
                )}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="bg-slate-200/70 p-1.5 rounded-2xl flex items-center gap-1 mb-4 text-xs sm:text-sm">
        {['All', 'Twin Cities', 'Motorways & Highways'].map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`flex-1 py-2 font-semibold rounded-xl transition-all ${
              activeCategory === cat
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Search Input */}
      <div className="relative mb-6">
        <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          placeholder="Search road or highway (e.g. M-1, Faizabad, Expressway)..."
          className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent shadow-sm"
        />
        {searchKeyword && (
          <button
            onClick={() => setSearchKeyword('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>

      {/* Road Cards List */}
      {loading ? (
        <div className="py-12 text-center text-slate-500">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm">Loading road updates...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm text-center">
          {error}
        </div>
      ) : filteredRoads.length > 0 ? (
        <div className="space-y-4">
          {filteredRoads.map((road) => (
            <div
              key={road.id}
              className={`bg-white rounded-2xl p-5 border shadow-sm transition-all ${
                road.status === 'CLOSED'
                  ? 'border-rose-200 hover:border-rose-300'
                  : road.status === 'RESTRICTED'
                  ? 'border-amber-200 hover:border-amber-300'
                  : 'border-emerald-200 hover:border-emerald-300'
              }`}
            >
              {/* Header: Road Name & Status Badge */}
              <div className="flex items-start justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  {road.status === 'CLOSED' ? (
                    <XCircle className="w-6 h-6 text-rose-600 flex-shrink-0" />
                  ) : road.status === 'RESTRICTED' ? (
                    <AlertTriangle className="w-6 h-6 text-amber-500 flex-shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 flex-shrink-0" />
                  )}
                  <h2 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    {road.roadName}
                  </h2>
                </div>

                <span
                  className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${
                    road.status === 'CLOSED'
                      ? 'bg-rose-100 text-rose-700'
                      : road.status === 'RESTRICTED'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {road.status === 'CLOSED'
                    ? 'Closed'
                    : road.status === 'RESTRICTED'
                    ? 'Restricted'
                    : 'Open'}
                </span>
              </div>

              {/* Description / Reason */}
              {road.description && (
                <p className="text-sm text-slate-600 mb-3 ml-8 leading-relaxed">
                  {road.description}
                </p>
              )}

              {/* Footer: Last Updated & Admin Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-500 ml-8">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Last updated: {formatRoadStatusDate(road.updatedAt)}</span>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleOpenEditModal(road)}
                      className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-slate-100 rounded-lg transition"
                      title="Edit Status"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => openDeleteModal(road)}
                      className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                      title="Delete Update"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center">
          <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800 mb-1">All Routes Clear</h3>
          <p className="text-xs sm:text-sm text-slate-500 max-w-sm mx-auto">
            {searchKeyword
              ? `No updates matching "${searchKeyword}".`
              : 'No disruptions reported. Roads are moving normally.'}
          </p>
        </div>
      )}

      {/* Admin Create / Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-xl border border-slate-200 p-6 md:p-8">
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <h2 className="text-xl font-bold text-slate-900 mb-1">
              {editingRoad ? 'Edit Road Status' : 'Add Road Update'}
            </h2>
            <p className="text-xs text-slate-500 mb-6">
              Manually publish road status updates for commuters
            </p>

            {formError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl">
                {formError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Road / Route Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.roadName}
                  onChange={(e) => setFormData({ ...formData, roadName: e.target.value })}
                  placeholder="e.g. M-1 Motorway (Islamabad → Peshawar)"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Current Status <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { key: 'OPEN', label: '✅ Open', color: 'border-emerald-500 text-emerald-800 bg-emerald-50' },
                    { key: 'RESTRICTED', label: '⚠️ Restricted', color: 'border-amber-500 text-amber-800 bg-amber-50' },
                    { key: 'CLOSED', label: '❌ Closed', color: 'border-rose-500 text-rose-800 bg-rose-50' },
                  ].map((s) => (
                    <button
                      key={s.key}
                      type="button"
                      onClick={() => setFormData({ ...formData, status: s.key })}
                      className={`py-2 px-3 text-xs font-semibold rounded-xl border transition ${
                        formData.status === s.key
                          ? s.color
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="Twin Cities">Twin Cities</option>
                  <option value="Motorways & Highways">Motorways & Highways</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Reason / Description (Optional)
                </label>
                <textarea
                  rows="3"
                  maxLength="300"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g. Closed from Toll Plaza due to demonstration. Use GT Road."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                ></textarea>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium rounded-xl text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formLoading}
                  className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-xl text-sm transition shadow-sm disabled:opacity-50"
                >
                  {formLoading ? 'Saving...' : editingRoad ? 'Update Status' : 'Publish Status'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleConfirmDelete}
        loading={deleteLoading}
        title="Remove Road Update"
        message={`Are you sure you want to remove the update for "${roadToDelete?.roadName}"?`}
        confirmText="Yes, Delete"
      />
    </div>
  );
};

export default RoadStatus;