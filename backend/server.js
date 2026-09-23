const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

// Initialize Express
const app = express();

// Allowed origins for CORS (Local + Production)
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  process.env.CLIENT_URL, // e.g. https://your-carpool-app.vercel.app
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin) return callback(null, true);

      // 1. Allow any localhost or 127.0.0.1 port (5173, 4173, 3000, etc.)
      const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

      // 2. Allow any local network IP (e.g. 192.168.x.x, 10.x.x.x) on any port
      const isLocalNetwork = /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin);

      // 3. Allow production CLIENT_URL if defined in .env
      const isProduction = process.env.CLIENT_URL && origin === process.env.CLIENT_URL;

      if (isLocalhost || isLocalNetwork || isProduction) {
        return callback(null, true);
      }

      return callback(new Error(`CORS policy: Origin ${origin} not allowed`));
    },
    credentials: true,
  })
);  

app.use(express.json());

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/rides', require('./routes/rideRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Carpool API is live and operational',
    timestamp: new Date().toISOString(),
  });
});

// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(` Production server running on port ${PORT}`);
});