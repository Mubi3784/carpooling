/**
 * Minimal in-memory rate limiter (no dependency).
 * NOTE: counters live in the memory of one serverless instance, so on Vercel
 * the limit is best-effort only (each warm instance counts separately).
 */
const getClientIp = (req) => {
  // Only Vercel overwrites x-forwarded-for; elsewhere the header is client-controlled
  // and trusting it would let callers dodge the limiter by rotating the value.
  // Self-hosting behind a proxy needs `trust proxy` (req.ip) or another approach.
  if (process.env.VERCEL) {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.length > 0) {
      const first = forwarded.split(',')[0].trim();
      if (first) return first.slice(0, 64);
    }
  }
  return req.socket?.remoteAddress || req.ip || 'unknown';
};

const createRateLimiter = ({ windowMs, max, message }) => {
  const hits = new Map(); // key -> { count, resetAt }

  return (req, res, next) => {
    const now = Date.now();
    // Opportunistic cleanup keeps the map small
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
    }

    const key = getClientIp(req);
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;

    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ success: false, message });
    }
    next();
  };
};

module.exports = { createRateLimiter, getClientIp };
