const express = require('express');
const cors = require('cors');
const rateLimiter = require('./middleware/rateLimiter');
const apiRoutes = require('./routes/api');
const sequelize = require('./db');

const app = express();
const PORT = process.env.PORT || 5001; // 5000 is taken by AirPlay Receiver on recent macOS

// Browser origins allowed to call the API. CORS_ORIGINS (comma-separated, exact) replaces this
// built-in list of our own frontends: production on Vercel, and Vite dev (5173) and preview (4173).
const DEFAULT_CORS_ORIGINS = ['https://routewise-seven.vercel.app', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:4173', 'http://127.0.0.1:4173'];
const configuredOrigins = (process.env.CORS_ORIGINS || '').split(',').map((o) => o.trim()).filter(Boolean);
for (const origin of configuredOrigins) {
  // Exactly what a browser sends: http(s), lowercase host, no default port, no path or trailing slash.
  if (!(URL.canParse(origin) && /^https?:\/\//.test(origin) && new URL(origin).origin === origin)) {
    throw new Error(`CORS_ORIGINS: "${origin}" is not an exact origin such as https://example.com`);
  }
}
const allowedOrigins = new Set(configuredOrigins.length > 0 ? configuredOrigins : DEFAULT_CORS_ORIGINS);

app.disable('x-powered-by');
// Security headers for this JSON-only API. Set first, so errors, 404s, 429s and CORS preflights get them too.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  });
  // HSTS only over HTTPS. TLS ends at the proxy (Cloudflare/Render) and proxy trust is off, so
  // req.secure is false there; an exact "X-Forwarded-Proto: https" also counts. A client can fake
  // that header, but browsers ignore HSTS on plain-HTTP responses, so it is used for nothing else.
  // The real proxy chain is still unverified: check the header on a deployed HTTPS response.
  if (req.secure || req.get('X-Forwarded-Proto') === 'https') {
    res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  res.vary('Origin'); // CORS answers depend on Origin, so caches must not reuse them across origins
  next();
});
// Requests without an Origin (curl, health checks) get no CORS headers. Listed origins are echoed
// back; any other browser origin gets a JSON 403 before body parsing and rate limiting.
app.use(cors({
  origin(origin, callback) {
    if (origin === undefined) return callback(null, false);
    if (allowedOrigins.has(origin)) return callback(null, true);
    callback(Object.assign(new Error('Origin not allowed'), { status: 403, expose: true }));
  },
}));
app.use(express.json({ limit: '100kb' })); // larger bodies get a JSON 413
// Express 5 leaves req.body undefined when a request has no JSON body; handlers expect an object.
app.use((req, res, next) => { req.body ??= {}; next(); });

// Behind a reverse proxy, req.ip is the proxy's address unless Express trusts it. Set
// TRUST_PROXY_HOPS to the exact number of proxies in front of the app; a wrong value lets
// clients fake their IP via X-Forwarded-For. Off by default (see README "Deploying").
const trustProxyHops = Number.parseInt(process.env.TRUST_PROXY_HOPS, 10);
if (trustProxyHops > 0) app.set('trust proxy', trustProxyHops);

// Token bucket per client IP: bursts of 30 tokens, refilled at 10 per second. A request costs
// 1 token plus 1 per stop, so a 25-stop TSP (~0.4 s of CPU) costs 26.
const requestCost = (req) => 1 + (Array.isArray(req.body.stops) ? req.body.stops.length : 0);
app.use('/api', rateLimiter(30, 10, requestCost), apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Unknown routes and errors (including malformed JSON) get a JSON body, never an HTML stack trace.
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// Express treats 4-argument middleware as the error handler, so `next` must stay in the signature.
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: err.expose ? err.message : 'Internal server error' });
});

if (process.env.NODE_ENV !== 'test') {
  sequelize.sync().then(() => {
    console.log('Database synced');
    // Express 5 passes listen errors (e.g. EADDRINUSE) to this callback instead of throwing.
    app.listen(PORT, (err) => {
      if (err) {
        console.error(`Could not start the server on port ${PORT}: ${err.code || err.message}. Set PORT to a free port.`);
        process.exit(1);
      }
      console.log(`Server running on port ${PORT}`);
    });
  }).catch(err => {
    console.error('Database sync failed:', err);
    process.exit(1);
  });
}

module.exports = app;
