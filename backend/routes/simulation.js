// backend/routes/simulation.js
const express = require('express');
const router = express.Router();
let simCtrl;

// Try to load a controller if present
try {
  simCtrl = require('../controllers/simulationController');
  if (!simCtrl || typeof simCtrl.runSimulation !== 'function') {
    simCtrl = null;
  }
} catch (e) {
  simCtrl = null;
}

// Helpers used by the inline fallback simulation handler
function hhmmToMinutes(hhmm) {
  if (!hhmm) return 0;
  const parts = String(hhmm).split(':').map(s => Number(s));
  if (parts.length !== 2 || Number.isNaN(parts[0]) || Number.isNaN(parts[1])) return 0;
  return parts[0] * 60 + parts[1];
}
function minutesToHours(min) {
  return +(min / 60);
}
function roundHours(h) {
  return Math.round(h * 100) / 100;
}
function normalizeDriver(d) {
  const plain = d.toObject ? d.toObject() : { ...d };
  return {
    id: plain._id?.toString?.() ?? plain.id,
    name: plain.name ?? 'unknown',
    remainingHours: Number(plain.remainingHours ?? plain.currentShiftHours ?? 0),
    currentShiftHours: Number(plain.currentShiftHours ?? 0),
    assignedCount: 0,
    used: false,
    shiftStartMin: plain.shiftStart ? hhmmToMinutes(plain.shiftStart) : null,
    shiftEndMin: plain.shiftEnd ? hhmmToMinutes(plain.shiftEnd) : null,
    raw: plain
  };
}
function normalizeOrder(o) {
  const plain = o.toObject ? o.toObject() : { ...o };
  const pickupMin = plain.pickupTime ? hhmmToMinutes(plain.pickupTime) : (plain.startTime ? hhmmToMinutes(plain.startTime) : null);
  const deadlineMin = plain.deadlineTime ? hhmmToMinutes(plain.deadlineTime) : null;
  let durationMin = 0;
  if (plain.durationMinutes) durationMin = Number(plain.durationMinutes) || 0;
  else if (plain.durationHours) durationMin = (Number(plain.durationHours) || 0) * 60;
  else if (plain.estimatedMinutes) durationMin = Number(plain.estimatedMinutes) || 0;
  return {
    id: plain._id?.toString?.() ?? plain.id,
    pickupMin,
    deadlineMin,
    durationMin: Math.max(0, durationMin),
    raw: plain
  };
}

// Inline simulation handler (used if controller not provided)
async function inlineRunSimulation(req, res) {
  const Driver = require('../models/Driver');
  let Order;
  try {
    Order = require('../models/Order');
  } catch (e) {
    // If Order model not present, return a helpful error
    console.error('Order model not found. Please ensure models/Order exists.', e);
    return res.status(500).json({ error: 'Order model not found', details: 'Please add models/Order or provide a simulation controller.' });
  }

  try {
    const simInput = req.body || {};
    console.log('SIM INPUT:', simInput);

    const rawDrivers = await Driver.find().lean();
    // fetch unassigned/pending orders — adjust query to fit your domain
    const rawOrders = await Order.find({ status: { $in: ['pending', 'new', 'unassigned'] } }).lean();

    let drivers = rawDrivers.map(normalizeDriver);
    let orders = rawOrders.map(normalizeOrder);

    const availableDrivers = drivers.length;
    const requestedDrivers = Number(simInput.numberOfDrivers) || 0;
    const maxDriversToUse = Math.min(requestedDrivers, availableDrivers);

    // sort orders by earliest pickup or deadline
    orders.sort((a, b) => {
      if (a.pickupMin != null && b.pickupMin != null) return a.pickupMin - b.pickupMin;
      if (a.deadlineMin != null && b.deadlineMin != null) return a.deadlineMin - b.deadlineMin;
      return (a.id || '').localeCompare(b.id || '');
    });

    // sort drivers by remainingHours desc
    drivers.sort((a, b) => b.remainingHours - a.remainingHours);
    let candidateDrivers = drivers.slice(0);

    let usedDriversCount = 0;
    let unassignedOrders = 0;
    let onTime = 0, late = 0;

    function pickDriverForOrder(order) {
      // drivers that can cover full duration and have >0 capacity
      const capable = candidateDrivers.filter(d => d.remainingHours * 60 >= order.durationMin && d.remainingHours > 0);
      const inWindow = capable.filter(d => {
        if (d.shiftStartMin != null && d.shiftEndMin != null && order.pickupMin != null) {
          return order.pickupMin >= d.shiftStartMin && order.pickupMin <= d.shiftEndMin;
        }
        return true;
      });

      // prefer already used drivers then higher remainingHours
      const ordered = inWindow.sort((a, b) => {
        if ((a.used ? 1 : 0) !== (b.used ? 1 : 0)) return (b.used ? 1 : 0) - (a.used ? 1 : 0);
        return b.remainingHours - a.remainingHours;
      });

      for (const d of ordered) {
        if (!d.used && usedDriversCount >= maxDriversToUse) continue;
        return d;
      }
      return null;
    }

    for (const order of orders) {
      const chosen = pickDriverForOrder(order);
      if (!chosen) {
        unassignedOrders++;
        late++;
        console.log(`Order ${order.id} could not be assigned (duration ${order.durationMin}m).`);
        continue;
      }

      chosen.remainingHours -= minutesToHours(order.durationMin);
      chosen.assignedCount = (chosen.assignedCount || 0) + 1;
      if (!chosen.used) {
        chosen.used = true;
        usedDriversCount++;
      }

      if (order.deadlineMin != null && order.pickupMin != null) {
        if (order.pickupMin <= order.deadlineMin) onTime++;
        else late++;
      } else {
        onTime++;
      }

      candidateDrivers.sort((a, b) => b.remainingHours - a.remainingHours);
    }

    const perDriver = drivers.slice(0, requestedDrivers).map(d => ({
      id: d.id,
      name: d.name,
      remainingHours: roundHours(d.remainingHours),
      assignedCount: d.assignedCount || 0
    }));

    const simSummary = {
      requestedDrivers,
      availableDrivers,
      usedDrivers: usedDriversCount,
      unassignedOrdersCount: unassignedOrders,
      unresolvedOrdersCount: 0,
      perDriver
    };

    console.log('SIM SUMMARY:', JSON.stringify(simSummary, null, 2), 'onTime', onTime, 'late', late);
    return res.json({ simInput, simSummary, onTime, late });
  } catch (err) {
    console.error('SIM RUN ERROR:', err);
    return res.status(500).json({ error: 'sim failed', details: err.message });
  }
}

// Routes setup
// Debug endpoint always available (no auth)
router.post('/run-debug', async (req, res, next) => {
  console.log('DEBUG /api/simulation/run-debug called');
  if (simCtrl && typeof simCtrl.runSimulation === 'function') {
    return simCtrl.runSimulation(req, res, next);
  }
  return inlineRunSimulation(req, res);
});

// Protected production endpoints if auth exists; otherwise expose but warn
let authMiddleware = null;
try {
  authMiddleware = require('../middleware/auth');
} catch (e) {
  authMiddleware = null;
  console.warn('Auth middleware not found — simulation endpoints will be exposed without auth.');
}

// /run endpoint
if (authMiddleware) {
  // if controller present use it, else fallback to inline
  if (simCtrl && typeof simCtrl.runSimulation === 'function') {
    router.post('/run', authMiddleware, simCtrl.runSimulation);
  } else {
    router.post('/run', authMiddleware, inlineRunSimulation);
  }
} else {
  if (simCtrl && typeof simCtrl.runSimulation === 'function') {
    router.post('/run', simCtrl.runSimulation);
  } else {
    router.post('/run', inlineRunSimulation);
  }
}

// /history endpoint (protected if auth exists). Uses SimulationResult model.
if (authMiddleware) {
  router.get('/history', authMiddleware, async (req, res) => {
    try {
      const SimulationResult = require('../models/SimulationResult');
      const history = await SimulationResult.find().sort({ createdAt: -1 }).limit(50).lean();
      return res.json(history);
    } catch (err) {
      console.error('GET /api/simulation/history error', err);
      return res.status(500).json({ error: 'Failed to fetch history', details: err.message });
    }
  });
} else {
  router.get('/history', async (req, res) => {
    try {
      const SimulationResult = require('../models/SimulationResult');
      const history = await SimulationResult.find().sort({ createdAt: -1 }).limit(50).lean();
      return res.json(history);
    } catch (err) {
      console.error('GET /api/simulation/history error', err);
      return res.status(500).json({ error: 'Failed to fetch history', details: err.message });
    }
  });
}

module.exports = router;
