import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('carpool_token') || null);
  const [loading, setLoading] = useState(true);
  const [showNoticeModal, setShowNoticeModal] = useState(false);

  // Check if user is already logged in on initial load
  useEffect(() => {
    const loadUser = async () => {
      if (token) {
        try {
          const res = await api.get('/auth/me');
          setUser(res.data.data.user);
        } catch (error) {
          console.error('Session expired or invalid token:', error.response?.data?.message);
          logout();
        }
      }
      setLoading(false);
    };

    loadUser();
  }, [token]);

  // Login handler
  const login = async (email, password) => {
    const res = await api.post('/auth/login', { email, password });
    const { token: receivedToken, user: receivedUser } = res.data.data;

    localStorage.setItem('carpool_token', receivedToken);
    setToken(receivedToken);
    setUser(receivedUser);

    // Trigger full-page trial notice overlay immediately after login (FR-NOTICE-01)
    setShowNoticeModal(true);

    return receivedUser;
  };

  // Register handler
  const register = async (name, email, password, phone) => {
    const res = await api.post('/auth/register', { name, email, password, phone });
    const { token: receivedToken, user: receivedUser } = res.data.data;

    localStorage.setItem('carpool_token', receivedToken);
    setToken(receivedToken);
    setUser(receivedUser);

    // Trigger full-page notice overlay after new account registration
    setShowNoticeModal(true);

    return receivedUser;
  };

  // Logout handler
  const logout = () => {
    localStorage.removeItem('carpool_token');
    setToken(null);
    setUser(null);
    setShowNoticeModal(false);
  };

  const closeNoticeModal = () => {
    setShowNoticeModal(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: !!user,
        showNoticeModal,
        login,
        register,
        logout,
        closeNoticeModal,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};