// app.js
require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/routes', require('./routes/routes'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/simulation', require('./routes/simulation'));

// Health check
app.get('/', (req, res) => res.send('GreenCart API'));

module.exports = app;
