const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

// Connect to SQLite using Sequelize (no Docker required)
const sequelize = new Sequelize({
  dialect: 'sqlite',
  // Tests use a throwaway in-memory database so they never write to database.sqlite.
  storage: process.env.NODE_ENV === 'test' ? ':memory:' : path.join(__dirname, 'database.sqlite'),
  logging: false
});

module.exports = sequelize;
