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

export default api;