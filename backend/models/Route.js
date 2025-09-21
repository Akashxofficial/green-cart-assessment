const mongoose = require('mongoose');

const RouteSchema = new mongoose.Schema({
  routeId: { type: String, required: true, unique: true },
  distanceKm: { type: Number, required: true },
  trafficLevel: { type: String, enum: ['Low','Medium','High'], default: 'Medium' },
  baseTimeMinutes: { type: Number, required: true } // minutes
});

module.exports = mongoose.model('Route', RouteSchema);
