const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

// Connect to SQLite using Sequelize (no Docker required)
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'database.sqlite'),
  logging: false
});

module.exports = sequelize;
