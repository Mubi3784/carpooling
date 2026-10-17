import React, { useState } from 'react';
import LoadingSkeleton from '../components/LoadingSkeleton';
import InstallSection from '../components/InstallSection';
import ModeSwitcher from '../components/ModeSwitcher';
import ModeFab from '../components/ModeFab';
import HomeTabs from '../components/HomeTabs';
import LoginPrompt from '../components/LoginPrompt';
import MyRidesList from '../components/MyRidesList';
import MyRequestsList from '../components/MyRequestsList';
import DiscoveryFeed from '../components/DiscoveryFeed';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useAlerts } from '../context/AlertContext';
import { formatBadgeCount } from '../utils/requests';
import { useMode } from '../context/ModeContext';
import {
  tabsForMode, resolveTab, readTab, writeTab, sourceFor, emptyStateFor, loginPromptFor,
} from '../utils/homeTabs';

const safeSession = () => (typeof sessionStorage === 'undefined' ? null : sessionStorage);

const Feed = () => {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const { mode } = useMode();
  const { count: alertCount } = useAlerts();

  // Last tab per mode lives in sessionStorage: kept while navigating, but a fresh launch starts on the feed tab (Tab 1)
  const [choice, setChoice] = useState(() => ({
    passenger: readTab(safeSession(), 'passenger'),
    driver: readTab(safeSession(), 'driver'),
  }));
  const tab = resolveTab({ mode, isAuthenticated, choice: choice[mode] });
  const tabs = tabsForMode(mode);

  const onSelect = (id) => {
    setChoice((c) => ({ ...c, [mode]: id }));
    writeTab(safeSession(), mode, id);
  };

  const source = sourceFor(mode, tab, isAuthenticated);

  const renderPanel = () => {
    if (authLoading) return <LoadingSkeleton />;
    switch (source) {
      case 'my-rides':
        return <MyRidesList empty={emptyStateFor({ mode, tab })} />;
      case 'my-requests':
        return <MyRequestsList empty={emptyStateFor({ mode, tab })} />;
      case 'requests':
        return <DiscoveryFeed kind="requests" />;
      case 'rides':
        return <DiscoveryFeed kind="rides" />;
      default:
        return <LoginPrompt message={loginPromptFor({ mode, tab })} />;
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 md:py-8 pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
            Available Carpools
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Share rides, split fuel, and travel comfortably
          </p>
        </div>
      </div>

      <ModeSwitcher />

      {isAuthenticated && alertCount > 0 && (
        <Link
          to="/matches"
          className="mb-4 block p-3 bg-sky-50 border border-sky-200 text-sky-800 text-sm rounded-xl"
        >
          You have {formatBadgeCount(alertCount)} new offer{alertCount === 1 ? '' : 's'} or request{alertCount === 1 ? '' : 's'}. View
        </Link>
      )}

      <HomeTabs
        tabs={tabs}
        selected={tab}
        onSelect={onSelect}
        label={mode === 'driver' ? 'Driver Mode sections' : 'Passenger Mode sections'}
      />

      <InstallSection />

      <div
        role="tabpanel"
        id="home-tabpanel"
        aria-labelledby={`home-tab-${tab}`}
        tabIndex={0}
        key={`${mode}-${tab}`}
      >
        {renderPanel()}
      </div>

      <ModeFab />
    </div>
  );
};

export default Feed;
