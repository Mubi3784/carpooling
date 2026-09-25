const jwt = require('jsonwebtoken');
const User = require('../models/User');

const protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided',
    });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, token missing',
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User no longer exists',
      });
    }

    return next();
  } catch (error) {
    // If it's a JWT error, return 401
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token failed or expired',
      });
    }

    // Pass database or other unexpected errors to global error handler
    return next(error);
  }
};

const optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = await User.findById(decoded.id).select('-password');
      } catch (error) {
        req.user = null;
      }
    } else {
      req.user = null;
    }
  } else {
    req.user = null;
  }

  next();
};

// Admin Only Middleware
const adminOnly = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, please log in first',
    });
  }

  const isAdminByRole = req.user.role === 'admin';
  const isAdminByEmail =
    Boolean(process.env.ADMIN_EMAIL) &&
    req.user.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase();

  if (isAdminByRole || isAdminByEmail) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied: Admin privileges required',
  });
};

module.exports = { protect, optionalAuth, adminOnly };