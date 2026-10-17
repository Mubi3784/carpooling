const { sendServerError } = require('../utils/errorResponse');
const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { sanitizePhoneNumber, isValidPhoneNumber } = require('../utils/phoneSanitizer');

// Helper to determine role (considers ADMIN_EMAIL env)
const resolveRole = (user) => {
  if (
    process.env.ADMIN_EMAIL &&
    user?.email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase()
  ) {
    return 'admin';
  }
  return user?.role || 'user';
};

const registerUser = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide name, email, and password',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const userExists = await User.findOne({ email: normalizedEmail });
    if (userExists) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    // Passed plain password so the model's pre('save') hook hashes it once
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      phone: phone?.trim() || '',
      role: 'user',
    });

    const userRole = resolveRole(user);

    res.status(201).json({
      success: true,
      data: {
        token: generateToken(user._id),
        user: {
          id: user._id,
          name: user.name,
          role: userRole,
        },
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email already exists',
      });
    }

    sendServerError(res, error, 'Server error during registration');
  }
};

const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password',
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // Explicitly select password in case schema has select: false
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password',
      });
    }

    const userRole = resolveRole(user);

    res.status(200).json({
      success: true,
      data: {
        token: generateToken(user._id),
        user: {
          id: user._id,
          name: user.name,
          role: userRole,
        },
      },
    });
  } catch (error) {
    sendServerError(res, error, 'Server error during login');
  }
};

const getMe = async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized',
      });
    }

    const userRole = resolveRole(req.user);

    res.status(200).json({
      success: true,
      data: {
        user: {
          id: req.user._id,
          name: req.user.name,
          role: userRole,
        },
      },
    });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching profile');
  }
};

// Private profile: the ONLY endpoint that returns contact details, and only the caller's own
const profileView = (u) => ({ name: u.name, email: u.email, phone: u.phone || '' });

// @desc    Caller's own profile
// @route   GET /api/auth/profile
const getProfile = async (req, res) => {
  try {
    res.status(200).json({ success: true, data: { profile: profileView(req.user) } });
  } catch (error) {
    sendServerError(res, error, 'Server error fetching profile');
  }
};

// @desc    Update caller's name / phone (email is not editable)
// @route   PATCH /api/auth/profile
const updateProfile = async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    const update = {};
    if (name !== undefined) {
      const n = typeof name === 'string' ? name.trim() : '';
      if (n.length < 2 || n.length > 50) {
        return res.status(400).json({
          success: false,
          message: 'Name must be between 2 and 50 characters',
        });
      }
      update.name = n;
    }
    if (phone !== undefined) {
      if (typeof phone !== 'string') {
        return res.status(400).json({ success: false, message: 'Please provide a valid phone number' });
      }
      if (phone.trim() === '') {
        update.phone = '';
      } else if (!isValidPhoneNumber(phone)) {
        return res.status(400).json({ success: false, message: 'Please provide a valid phone number' });
      } else {
        update.phone = sanitizePhoneNumber(phone);
      }
    }
    const user = await User.findByIdAndUpdate(req.user._id, { $set: update }, {
      new: true,
      runValidators: true,
    });
    res.status(200).json({ success: true, data: { profile: profileView(user) } });
  } catch (error) {
    sendServerError(res, error, 'Server error updating profile');
  }
};

module.exports = {
  registerUser,
  loginUser,
  getMe,
  getProfile,
  updateProfile,
};