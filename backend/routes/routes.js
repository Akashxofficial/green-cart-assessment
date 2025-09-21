// backend/routes/routes.js
const express = require('express');
const router = express.Router();
const RouteModel = require('../models/Route');

// optional: try to require auth if available (used below for protected endpoints)
let auth;
try { auth = require('../middleware/auth'); } catch (e) { auth = null; }

const ALLOWED_TRAFFIC = ['Low', 'Medium', 'High'];

function normalizeTrafficLevel(val) {
  if (!val) return undefined;
  const s = String(val).trim();
  if (s.length === 0) return undefined;
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// robust number parser: treat '', null, undefined as NaN
function toNumber(v) {
  if (v === null || v === undefined) return NaN;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && v.trim() === '') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * GET /api/routes
 * Public (development) - returns all routes.
 * If you want to protect this route in production, change to: router.get('/', auth, ...)
 */
router.get('/', async (req, res) => {
  try {
    const routes = await RouteModel.find();
    return res.json(routes);
  } catch (err) {
    console.error('GET /api/routes error:', err);
    // Return an empty list on error so frontend doesn't break; still log server-side error.
    return res.status(200).json([]);
  }
});

/**
 * POST /api/routes
 * Protected: create a route with validation and normalization
 */
router.post('/', auth, async (req, res) => {
  try {
    console.log('Create route payload:', req.body);

    const routeId = req.body.routeId ?? req.body.id ?? req.body.name;
    const rawDistance = req.body.distanceKm ?? req.body.distance ?? req.body.dist;
    const rawBaseTime = req.body.baseTimeMinutes ?? req.body.baseTime ?? req.body.time ?? req.body.minutes;
    const rawTraffic = req.body.trafficLevel ?? req.body.traffic ?? req.body.traffic_level;

    const distanceKm = toNumber(rawDistance);
    const baseTimeMinutes = toNumber(rawBaseTime);
    const trafficLevel = normalizeTrafficLevel(rawTraffic) || 'Low';

    const errors = {};
    if (!routeId || String(routeId).trim() === '') errors.routeId = 'routeId required';
    if (Number.isNaN(distanceKm) || distanceKm <= 0) errors.distanceKm = 'distanceKm must be a positive number';
    if (Number.isNaN(baseTimeMinutes) || baseTimeMinutes <= 0) errors.baseTimeMinutes = 'baseTimeMinutes must be a positive number';
    if (!ALLOWED_TRAFFIC.includes(trafficLevel)) errors.trafficLevel = `trafficLevel must be one of: ${ALLOWED_TRAFFIC.join(', ')}`;

    if (Object.keys(errors).length > 0) {
      return res.status(400).json({ error: 'Invalid input', details: errors });
    }

    const payload = {
      routeId: String(routeId).trim(),
      distanceKm,
      trafficLevel,
      baseTimeMinutes
    };

    const r = await RouteModel.create(payload);
    return res.status(201).json(r);

  } catch (err) {
    console.error('POST /api/routes error:', err);

    if (err.code === 11000) {
      return res.status(409).json({ error: 'Duplicate routeId', details: err.keyValue });
    }

    if (err.name === 'ValidationError') {
      const details = {};
      for (const k in err.errors) details[k] = err.errors[k].message;
      return res.status(400).json({ error: 'Validation failed', details });
    }

    return res.status(500).json({ error: 'Failed to create route' });
  }
});

/**
 * PUT /api/routes/:id
 * Protected: updates a route and runs validators
 */
router.put('/:id', auth, async (req, res) => {
  try {
    if (req.body.trafficLevel) {
      req.body.trafficLevel = normalizeTrafficLevel(req.body.trafficLevel);
    }
    const updated = await RouteModel.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Route not found' });
    return res.json(updated);
  } catch (err) {
    console.error('PUT /api/routes/:id error', err);
    if (err.name === 'ValidationError') {
      const details = {};
      for (const k in err.errors) details[k] = err.errors[k].message;
      return res.status(400).json({ error: 'Validation failed', details });
    }
    return res.status(500).json({ error: 'Failed to update route' });
  }
});

/**
 * DELETE /api/routes/:id
 * Protected: deletes the route
 */
router.delete('/:id', auth, async (req, res) => {
  try {
    await RouteModel.findByIdAndDelete(req.params.id);
    return res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/routes/:id error', err);
    return res.status(500).json({ error: 'Failed to delete route' });
  }
});

module.exports = router;
