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
import RequestRide from './pages/RequestRide';
import MyRequests from './pages/MyRequests';
import Requests from './pages/Requests';
import Matches from './pages/Matches';
import Active from './pages/Active';
import ChatList from './pages/ChatList';
import ChatThread from './pages/ChatThread';
import Profile from './pages/Profile';
import RequestDetails from './pages/RequestDetails';
import RequestMatches from './pages/RequestMatches';
import RideMatchingRequests from './pages/RideMatchingRequests';

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
          <Route path="/request-ride" element={<ProtectedRoute><RequestRide /></ProtectedRoute>} />
          <Route path="/my-requests" element={<ProtectedRoute><MyRequests /></ProtectedRoute>} />
          <Route path="/requests/:id/matches" element={<ProtectedRoute><RequestMatches /></ProtectedRoute>} />
          <Route path="/requests/:id" element={<ProtectedRoute><RequestDetails /></ProtectedRoute>} />
          <Route path="/rides/:id/matching-requests" element={<ProtectedRoute><RideMatchingRequests /></ProtectedRoute>} />
          <Route path="/requests" element={<ProtectedRoute><Requests /></ProtectedRoute>} />
          <Route path="/matches" element={<ProtectedRoute><Matches /></ProtectedRoute>} />
          <Route path="/active" element={<ProtectedRoute><Active /></ProtectedRoute>} />
          <Route path="/chat" element={<ProtectedRoute><ChatList /></ProtectedRoute>} />
          <Route path="/chat/:id" element={<ProtectedRoute><ChatThread /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
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
