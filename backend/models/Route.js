const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const Route = sequelize.define('Route', {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Unnamed Route'
  },
  algorithm: {
    type: DataTypes.STRING,
    allowNull: true
  },
  distance: {
    type: DataTypes.FLOAT,
    allowNull: true
  },
  stops: {
    type: DataTypes.JSON, // Array of points
    allowNull: false
  },
  path: {
    type: DataTypes.JSON, // Detailed path including intermediate nodes
    allowNull: true
  }
});

module.exports = Route;
