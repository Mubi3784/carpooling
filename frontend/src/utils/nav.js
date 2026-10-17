export const NAV_ITEMS = [
  { key: 'home', label: 'Home', to: '/', protected: false },
  { key: 'active', label: 'Active Rides', to: '/active', protected: true },
  { key: 'chat', label: 'Chat', to: '/chat', protected: true },
  { key: 'profile', label: 'Profile', to: '/profile', protected: true },
];

// Badge number per nav item: pending offers/requests on Active Rides, unread messages on Chat.
export const badgeFor = (itemKey, { alerts = 0, chatUnread = 0 } = {}) => {
  if (itemKey === 'active') return alerts > 0 ? alerts : 0;
  if (itemKey === 'chat') return chatUnread > 0 ? chatUnread : 0;
  return 0;
};

// Guests tapping a protected tab are sent to login.
export const guestTarget = (item, isAuthenticated) =>
  item.protected && !isAuthenticated ? '/login' : item.to;
