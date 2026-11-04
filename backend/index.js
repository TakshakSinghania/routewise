const express = require('express');
const cors = require('cors');
const rateLimiter = require('./middleware/rateLimiter');
const apiRoutes = require('./routes/api');
const sequelize = require('./db');

const app = express();
const PORT = process.env.PORT || 5001; // 5000 is taken by AirPlay Receiver on recent macOS

app.use(cors());
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
