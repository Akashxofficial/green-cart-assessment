const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const RouteModel = require('../models/Route');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  const orders = await Order.find().populate('assignedRoute');
  res.json(orders);
});

router.post('/', auth, async (req, res) => {
  const { orderId, valueRs, assignedRouteId, deliveryTimestamp } = req.body;
  if (!orderId || !valueRs || !assignedRouteId) return res.status(400).json({ error: 'missing fields' });
  const assignedRoute = await RouteModel.findById(assignedRouteId);
  const o = await Order.create({ orderId, valueRs, assignedRoute: assignedRoute._id, deliveryTimestamp });
  res.json(await o.populate('assignedRoute'));
});

router.put('/:id', auth, async (req, res) => {
  const updated = await Order.findByIdAndUpdate(req.params.id, req.body, { new: true }).populate('assignedRoute');
  res.json(updated);
});

router.delete('/:id', auth, async (req, res) => {
  await Order.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
