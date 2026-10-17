const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();
 

// Initialize Express
const app = express();

// CORS configuration (Local + Network + Production Vercel domains)
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
      const isLocalNetwork = /^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+)(:\d+)?$/.test(origin);
      const isVercel = /\.vercel\.app$/.test(origin);
      const isProduction = process.env.CLIENT_URL && origin === process.env.CLIENT_URL;

      if (isLocalhost || isLocalNetwork || isVercel || isProduction) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy: Origin ${origin} not allowed`));
    },
    credentials: true,
  })
);

app.use(express.json());

// Ensure database connection is active before processing any API request
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error:', err.message);
    res.status(500).json({
      success: false,
      message: 'Database connection error',
    });
  }
});

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/rides', require('./routes/rideRoutes'));
app.use('/api/requests', require('./routes/requestRoutes'));
app.use('/api/matches', require('./routes/matchRoutes'));
app.use('/api/road-status', require('./routes/roadStatusRoutes')); // <-- NEW
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/push', require('./routes/pushRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/cron', require('./routes/cronRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Carpool API is live and operational',
    timestamp: new Date().toISOString(),
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err.message);
  const status = err.status || err.statusCode || 500;
  // 4xx messages (validation, bad JSON, CORS) are safe to show; 5xx are generic in production
  const expose = status < 500 || process.env.NODE_ENV !== 'production';
  res.status(status).json({
    success: false,
    message: expose ? err.message || 'Request failed' : 'Internal Server Error',
  });
});

// Run local server when not in Vercel environment
// (skipped under NODE_ENV=test so supertest can use the exported app without opening a port)
if (process.env.NODE_ENV !== 'test' && (process.env.NODE_ENV !== 'production' || !process.env.VERCEL)) {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

// Export for Vercel Serverless
module.exports = app;