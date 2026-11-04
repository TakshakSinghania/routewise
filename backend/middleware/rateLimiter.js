/**
 * Token Bucket Rate Limiter from scratch
 */
const net = require('net');

const SWEEP_INTERVAL_MS = 60 * 1000;

// Expands a valid IPv6 address (no zone id) into its eight 16-bit groups.
function ipv6Groups(addr) {
  const v4 = addr.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/); // embedded IPv4 tail, e.g. ::ffff:1.2.3.4
  if (v4) {
    const [a, b, c, d] = v4.slice(1).map(Number);
    addr = addr.slice(0, v4.index) + ((a << 8) | b).toString(16) + ':' + ((c << 8) | d).toString(16);
  }
  const [head, tail] = addr.split('::');
  const left = head ? head.split(':') : [];
  if (tail === undefined) return left.map((g) => parseInt(g, 16));
  const right = tail ? tail.split(':') : [];
  return [...left, ...Array(8 - left.length - right.length).fill('0'), ...right].map((g) => parseInt(g, 16));
}

// One rate-limit key per client: IPv4 as is, IPv4-mapped IPv6 (::ffff:a.b.c.d) as its IPv4
// address, other IPv6 by /64 (a subscriber usually holds a whole /64 and could otherwise rotate
// through it), ignoring case, compression and zone ids. Anything else is used unchanged.
function clientKey(ip) {
  if (!ip) return 'unknown';
  const addr = String(ip).split('%')[0];
  const family = net.isIP(addr);
  if (family === 4) return addr;
  if (family !== 6) return String(ip);
  const g = ipv6Groups(addr);
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) {
    return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.');
  }
  return `${g.slice(0, 4).map((x) => x.toString(16)).join(':')}::/64`;
}

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

  // True if the next take() would find the bucket full (same rule as _refill), i.e. the bucket is
  // indistinguishable from a brand-new one and can be dropped without changing any allowance.
  isFull(now = Date.now()) {
    const tokensToAdd = ((now - this.lastRefill) / 1000) * this.refillRatePerSec;
    const tokens = tokensToAdd >= 1 ? Math.min(this.capacity, this.tokens + tokensToAdd) : this.tokens;
    return tokens >= this.capacity;
  }

  // Whole seconds until `amount` tokens are available (at least 1), for the Retry-After header.
  // The tiny epsilon keeps float noise (e.g. 360.00000000000006) from rounding up a whole second.
  secondsUntil(amount) {
    return Math.max(1, Math.ceil((amount - this.tokens) / this.refillRatePerSec - 1e-9));
  }
}

// costOf(req) is how many tokens a request uses (default 1), so expensive requests count more.
function rateLimiter(capacity, refillRatePerSec, costOf = () => 1) {
  // In-memory store mapping client keys to their token buckets (one store per limiter)
  const clients = new Map();

  // Idle-bucket cleanup, not a hard memory cap: each sweep drops only buckets that have refilled
  // completely, which are identical to the bucket a new request would create, so no allowance is
  // ever reset; partly used buckets stay. A sweep runs to completion before any request is handled.
  // unref() so the timer never keeps the process alive.
  setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of clients) {
      if (bucket.isFull(now)) clients.delete(key);
    }
  }, SWEEP_INTERVAL_MS).unref();

  const middleware = (req, res, next) => {
    const key = clientKey(req.ip || req.connection.remoteAddress);

    if (!clients.has(key)) {
      clients.set(key, new TokenBucket(capacity, refillRatePerSec));
    }

    const bucket = clients.get(key);
    // Capped at the bucket size so any single request can pass once the bucket is full.
    const cost = Math.min(capacity, costOf(req));

    if (bucket.take(cost)) {
      next();
    } else {
      res.set('Retry-After', String(bucket.secondsUntil(cost)));
      res.status(429).json({ error: 'Too many requests, please try again later.' });
    }
  };
  middleware.clientCount = () => clients.size; // for tests and monitoring
  return middleware;
}

module.exports = rateLimiter;
module.exports.clientKey = clientKey;
