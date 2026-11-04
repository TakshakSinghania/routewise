const express = require('express');
const cors = require('cors');
const rateLimiter = require('./middleware/rateLimiter');
const apiRoutes = require('./routes/api');
const sequelize = require('./db');

const app = express();
const PORT = process.env.PORT || 5001; // 5000 is taken by AirPlay Receiver on recent macOS

app.use(cors());
app.use(express.json());
// Express 5 leaves req.body undefined when a request has no JSON body; handlers expect an object.
app.use((req, res, next) => { req.body ??= {}; next(); });

// Apply token-bucket rate limiter to all API routes (10 req/sec max)
app.use('/api', rateLimiter(10, 2), apiRoutes);

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
