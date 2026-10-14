const dns = require('dns');
const mongoose = require('mongoose');

// Optional local-only override: some Windows setups make Node's resolver use
// 127.0.0.1, which breaks mongodb+srv lookups (querySrv ECONNREFUSED).
// Set DNS_SERVERS=8.8.8.8,1.1.1.1 in a local .env to use explicit DNS servers.
// Applied inside connectDB because this module is required before dotenv loads.
const applyDnsOverride = () => {
  if (process.env.DNS_SERVERS) {
    dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
  }
};

let isConnected = false;

const connectDB = async () => {
  // If already connected, reuse existing database connection
  if (isConnected || mongoose.connection.readyState >= 1) {
    return;
  }

  try {
    applyDnsOverride();
    const conn = await mongoose.connect(process.env.MONGO_URI);
    isConnected = true;
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`❌ MongoDB Connection Error: ${error.message}`);
    throw error;
  }
};

module.exports = connectDB;