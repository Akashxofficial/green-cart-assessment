const mongoose = require('mongoose');

const OrderSchema = new mongoose.Schema({
  orderId: { type: String, required: true, unique: true },
  valueRs: { type: Number, required: true },
  assignedRoute: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
  deliveryTimestamp: { type: Date },
  status: { type: String, enum: ['pending','delivered','assigned'], default: 'pending' }
});

module.exports = mongoose.model('Order', OrderSchema);
