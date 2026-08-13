const express = require('express');
const cors = require('cors');
const rateLimiter = require('./middleware/rateLimiter');
const apiRoutes = require('./routes/api');
const sequelize = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Apply token-bucket rate limiter to all API routes (10 req/sec max)
app.use('/api', rateLimiter(10, 2), apiRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Sync database and start server
sequelize.sync().then(() => {
  console.log('Database synced');
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(err => {
  console.error('Database sync failed:', err);
});
