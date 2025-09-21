// routes/drivers.js
const express = require('express');
const router = express.Router();
const Driver = require('../models/Driver');

// Helper: normalize driver object to ensure numeric remainingHours and consistent field names
function normalizeDriverDoc(doc) {
  // doc may be a plain object (from .lean()) or a Mongoose doc
  const plain = doc.toObject ? doc.toObject() : { ...doc };

  return {
    ...plain,
    // prefer explicit remainingHours, otherwise fallback to currentShiftHours, ensure Number
    remainingHours: Number(plain.remainingHours ?? plain.currentShiftHours ?? 0),
    currentShiftHours: Number(plain.currentShiftHours ?? 0),
    // make sure past7DaysHours exists and is an array of numbers
    past7DaysHours: Array.isArray(plain.past7DaysHours)
      ? plain.past7DaysHours.map(n => Number(n) || 0)
      : Array.isArray(plain.past7DayHours)
      ? plain.past7DayHours.map(n => Number(n) || 0)
      : []
  };
}

// GET /api/drivers - list all drivers (always returns numeric remainingHours)
router.get('/', async (req, res) => {
  try {
    console.log('GET /api/drivers headers:', req.headers);
    const drivers = await Driver.find().lean();
    console.log('Fetched drivers count:', drivers.length);

    const normalized = drivers.map(d => normalizeDriverDoc(d));
    return res.json(normalized);
  } catch (err) {
    console.error('GET /api/drivers error:', err);
    return res.status(500).json({ error: 'Failed to fetch drivers', details: err.message });
  }
});

// POST /api/drivers - create driver (robust accepting several field names)
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/drivers body ->', req.body);

    const name = req.body.name || req.body.fullName || req.body.driverName;
    if (!name) return res.status(400).json({ error: 'name required' });

    // Accept multiple possible payload shapes for past-week hours
    const rawPast =
      req.body.past7DaysHours ??
      req.body.past7DayHours ??
      req.body.past7DayHoursList ??
      req.body.past_week_hours ??
      req.body.pastWeek ??
      req.body.past7Day ??
      '';

    let past7 = [];
    if (Array.isArray(rawPast)) {
      past7 = rawPast.map(n => Number(n) || 0);
    } else if (typeof rawPast === 'string') {
      past7 = rawPast
        .trim()
        .replace(/\s+/g, '')
        .replace(/,/g, '|')
        .split('|')
        .filter(Boolean)
        .map(s => Number(s) || 0);
    } else {
      past7 = [];
    }

    // Accept different names for current shift hours
    const currentShiftHours = Number(
      req.body.currentShiftHours ?? req.body.shift_hours ?? req.body.shiftHours ?? req.body.current_shift_hours
    ) || 0;

    // Allow client to explicitly pass remainingHours, otherwise set to currentShiftHours
    const remainingHours = Number(req.body.remainingHours ?? req.body.remaining_hours ?? currentShiftHours) || 0;

    const driver = await Driver.create({
      name: String(name).trim(),
      currentShiftHours,
      remainingHours,
      past7DaysHours: past7
    });

    // Return normalized driver object
    const normalized = normalizeDriverDoc(driver);
    return res.status(201).json(normalized);
  } catch (err) {
    console.error('POST /api/drivers error', err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: 'validation', details: err.message });
    }
    return res.status(500).json({ error: 'Failed to create driver', details: err.message });
  }
});

// DELETE /api/drivers/:id
router.delete('/:id', async (req, res) => {
  try {
    await Driver.findByIdAndDelete(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/drivers/:id error', err);
    return res.status(500).json({ error: 'Failed to delete driver' });
  }
});

module.exports = router;
