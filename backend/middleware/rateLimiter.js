/**
 * Token Bucket Rate Limiter from scratch
 */
class TokenBucket {
  constructor(capacity, refillRatePerSec) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillRatePerSec = refillRatePerSec;
    this.lastRefill = Date.now();
  }

  _refill() {
    const now = Date.now();
    const timePassedSec = (now - this.lastRefill) / 1000;
    const tokensToAdd = timePassedSec * this.refillRatePerSec;
    
    if (tokensToAdd >= 1) {
      this.tokens = Math.min(this.capacity, this.tokens + tokensToAdd);
      this.lastRefill = now;
    }
  }

  take(amount = 1) {
    this._refill();
    if (this.tokens >= amount) {
      this.tokens -= amount;
      return true; // Request allowed
    }
    return false; // Rate limited
  }
}

// costOf(req) is how many tokens a request uses (default 1), so expensive requests count more.
function rateLimiter(capacity, refillRatePerSec, costOf = () => 1) {
  // In-memory store mapping IPs to their token buckets (one store per limiter)
  const clients = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;

    if (!clients.has(ip)) {
      clients.set(ip, new TokenBucket(capacity, refillRatePerSec));
    }

    const bucket = clients.get(ip);
    // Capped at the bucket size so any single request can pass once the bucket is full.
    const cost = Math.min(capacity, costOf(req));

    if (bucket.take(cost)) {
      next();
    } else {
      res.status(429).json({ error: 'Too many requests, please try again later.' });
    }
  };
}

module.exports = rateLimiter;
