require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const connectDB = require('./config/db');
const app = express();

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(morgan('dev'));

// connect db
connectDB(process.env.MONGO_URI).catch(err => {
  console.error('DB connection error', err);
  process.exit(1);
});

// routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/drivers', require('./routes/drivers'));
app.use('/api/routes', require('./routes/routes'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/simulation', require('./routes/simulation'));

// health
app.get('/', (req, res) => res.send('GreenCart API'));

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
