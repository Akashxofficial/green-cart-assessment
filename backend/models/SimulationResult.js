const mongoose = require('mongoose');

const SimulationResultSchema = new mongoose.Schema({
  input: Object,
  result: Object,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SimulationResult', SimulationResultSchema);
