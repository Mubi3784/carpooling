import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TopAnnouncementBar from './components/TopAnnouncementBar'; // <-- NEW
import Navbar from './components/Navbar';
import BottomNav from './components/BottomNav';
import NoticeModal from './components/NoticeModal';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import Feed from './pages/Feed';
import RideDetails from './pages/RideDetails';
import Login from './pages/Login';
import Register from './pages/Register';
import OfferRide from './pages/OfferRide';
import MyRides from './pages/MyRides';

function App() {
  return (
    <div className="min-h-screen flex flex-col pb-16 md:pb-0 bg-slate-50">
      {/* 1. Continuous Top Scrolling Announcement Bar */}
      <TopAnnouncementBar />

      {/* 2. Top Navbar */}
      <Navbar />

      {/* 3. Main Content Area */}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Feed />} />
          <Route path="/rides/:id" element={<RideDetails />} />
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
    </div>
  );
}

export default App;