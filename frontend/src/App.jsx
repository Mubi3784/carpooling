import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TopAnnouncementBar from './components/TopAnnouncementBar'; // <-- NEW
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import NoticeModal from './components/NoticeModal';
import ProtectedRoute from './components/ProtectedRoute';
import OfflineBanner from './components/OfflineBanner';
import UpdatePrompt from './components/UpdatePrompt';
import InstallBanner from './components/InstallBanner';

// Pages
import Feed from './pages/Feed';
import RideDetails from './pages/RideDetails';
import Login from './pages/Login';
import Register from './pages/Register';
import OfferRide from './pages/OfferRide';
import MyRides from './pages/MyRides';
import RoadStatus from './pages/RoadStatus'; // <-- NEW

function App() {
  return (
    <div className="min-h-screen flex flex-col pb-nav-safe md:pb-0 pl-safe pr-safe bg-slate-50">
      {/* Top inset (notch) is applied once, above the first bar */}
      <div className="pt-safe bg-slate-900">
        {/* Offline notice (live data only) */}
        <OfflineBanner />

        {/* 1. Continuous Top Scrolling Announcement Bar */}
        <TopAnnouncementBar />
      </div>

      {/* 2. Top Navbar */}
      <Navbar />

      {/* Mobile-only sticky install banner (sits in flow under the navbar) */}
      <InstallBanner />

      {/* 3. Main Content Area */}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/rides/:id" element={<RideDetails />} />
          <Route path="/road-status" element={<RoadStatus />} /> {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Driver Routes */}
          <Route
            path="/offer-ride"
            element={
              <ProtectedRoute>
                <OfferRide />
              </ProtectedRoute>
            }
          />
          <Route
            path="/my-rides"
            element={
              <ProtectedRoute>
                <MyRides />
              </ProtectedRoute>
            }
          />
        </Routes>
      </main>

      {/* Full-Page Post-Login Trial Notice Overlay (FR-NOTICE-01) */}
      <NoticeModal />

      {/* Sticky Mobile Bottom Navigation */}
      <BottomNav />

      {/* PWA: update toast */}
      <UpdatePrompt />
    </div>
  );
}

export default App;
