// models/Driver.js
const mongoose = require('mongoose');

const DriverSchema = new mongoose.Schema({
  name: { type: String, required: true },
  currentShiftHours: { type: Number, default: 0 },
  remainingHours: { type: Number, default: 0 },     // NEW: used by assignment logic
  past7DaysHours: { type: [Number], default: [] }   // last 7 days hours
}, { timestamps: true });

// Keep remainingHours in sync when creating/updating currentShiftHours (optional but useful)
DriverSchema.pre('save', function (next) {
  if (this.isNew && (this.remainingHours === undefined || this.remainingHours === null)) {
    this.remainingHours = Number(this.currentShiftHours || 0);
  }
  // If currentShiftHours changed and remainingHours is not explicitly set, you may want to reset remainingHours.
  // Uncomment below if you want remainingHours to reset when currentShiftHours changes:
  // if (this.isModified('currentShiftHours') && !this.isModified('remainingHours')) {
  //   this.remainingHours = Number(this.currentShiftHours || 0);
  // }
  next();
});

module.exports = mongoose.model('Driver', DriverSchema);
