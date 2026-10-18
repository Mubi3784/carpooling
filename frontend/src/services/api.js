import axios from 'axios';

// Dynamically determine the API base URL:
// 1. In production (on Vercel): Uses import.meta.env.VITE_API_URL (e.g., Render URL)
// 2. On local machine: Uses http://localhost:5000/api
// 3. On mobile via Wi-Fi: Uses http://192.168.x.x:5000/api (connects to your PC automatically)
const getBaseURL = () => {
  const envUrl = import.meta.env.VITE_API_URL;

  // If deployed in production with a live backend (Render, etc.), use the env variable
  if (envUrl && !envUrl.includes('localhost')) {
    return envUrl;
  }

  // In local development or preview, point to port 5000 on whatever IP the browser is accessing
  const currentHostname = window.location.hostname || 'localhost';
  return `http://${currentHostname}:5000/api`;
};

const api = axios.create({
  baseURL: getBaseURL(),
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor: Attach JWT token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('carpool_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Interceptor: drop an expired/invalid token on 401 (no redirect or retry, so no loops)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || '';
    const isAuthForm = url.includes('/auth/login') || url.includes('/auth/register');
    if (error.response?.status === 401 && !isAuthForm) {
      localStorage.removeItem('carpool_token');
    }
    return Promise.reject(error);
  }
);

export const createRides = (payload) => api.post('/rides', payload);
export const getMyRides = () => api.get('/rides/my-rides');
export const getRides = (params) => api.get('/rides', { params });
export const deleteRide = (id) => api.delete(`/rides/${id}`);
export const deleteRideSeries = (seriesId) =>
  api.delete(`/rides/series/${encodeURIComponent(seriesId)}`);

// Passenger requests (P3)
export const createRequests = (payload) => api.post('/requests', payload);
export const getMyRequests = () => api.get('/requests/mine');
export const getRequests = (params) => api.get('/requests', { params });
export const getRequestById = (id) => api.get(`/requests/${encodeURIComponent(id)}`);
export const deleteRequest = (id) => api.delete(`/requests/${id}`);
export const deleteRequestSeries = (seriesId) =>
  api.delete(`/requests/series/${encodeURIComponent(seriesId)}`);
export const getRidesForOffer = (requestId) => api.get(`/requests/${requestId}/rides-for-offer`);

// Matching (P5)
export const getRequestMatches = (id) => api.get(`/requests/${encodeURIComponent(id)}/matches`);
export const getRequestMatchCounts = () => api.get('/requests/matches/counts');
export const getRideMatchingRequests = (rideId) =>
  api.get(`/rides/${encodeURIComponent(rideId)}/matching-requests`);

// Offers / join requests (P3)
export const createMatch = (payload) => api.post('/matches', payload);
export const getMatches = (params) => api.get('/matches', { params });
export const acceptMatch = (id) => api.post(`/matches/${id}/accept`);
export const declineMatch = (id) => api.post(`/matches/${id}/decline`);
export const cancelMatch = (id) => api.post(`/matches/${id}/cancel`);
export const markMatchSeen = (id) => api.post(`/matches/${id}/seen`);
export const getAlertCount = () => api.get('/matches/alerts/count');

// Profile (private details live in local component state only)
export const getProfile = () => api.get('/auth/profile');
export const updateProfile = (payload) => api.patch('/auth/profile', payload);

// Chat (P4)
export const getConversations = () => api.get('/chat/conversations');
export const getConversation = (id) => api.get(`/chat/conversations/${id}`);
export const getMessages = (id, after) =>
  api.get(`/chat/conversations/${id}/messages`, { params: after ? { after } : undefined });
export const sendMessage = (id, payload) => api.post(`/chat/conversations/${id}/messages`, payload);
export const reportMessage = (messageId, payload) => api.post(`/chat/messages/${messageId}/report`, payload);
export const getChatUnread = () => api.get('/chat/unread-count');

// Push (P4)
export const getPushPublicKey = () => api.get('/push/public-key');
export const pushSubscribe = (payload) => api.post('/push/subscribe', payload);
export const pushUnsubscribe = (endpoint) => api.delete('/push/subscribe', { data: { endpoint } });

export default api;