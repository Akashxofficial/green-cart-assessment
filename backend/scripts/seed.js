// backend/scripts/seed.js
require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const connectDB = require('../config/db');
const Driver = require('../models/Driver');
const RouteModel = require('../models/Route');
const Order = require('../models/Order');
const User = require('../models/User');
const bcrypt = require('bcryptjs');

async function main(){
  const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/greencart';
  await mongoose.connect(MONGO, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to', MONGO);

  // load initial data file
  const dataPath = path.join(__dirname, '..', 'data', 'initial_data.json');
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

  // clear existing
  await Driver.deleteMany({});
  await RouteModel.deleteMany({});
  await Order.deleteMany({});

  // insert routes first so we can map order.assignedRoute by routeId
  const routeDocs = {};
  for (const r of raw.routes){
    const doc = await RouteModel.create({
      routeId: r.routeId,
      distanceKm: r.distanceKm,
      trafficLevel: r.trafficLevel,
      baseTimeMinutes: r.baseTimeMinutes
    });
    routeDocs[r.routeId] = doc;
  }
  console.log('Inserted routes:', Object.keys(routeDocs));

  // insert drivers
  for (const d of raw.drivers){
    await Driver.create({
      name: d.name,
      currentShiftHours: d.currentShiftHours,
      past7DaysHours: d.past7DaysHours
    });
  }
  console.log('Inserted drivers');

  // insert orders mapping assignedRoute by routeId -> _id
  for (const o of raw.orders){
    const route = routeDocs[o.assignedRoute];
    if (!route) {
      console.warn('Route not found for order', o.orderId);
      continue;
    }
    await Order.create({
      orderId: o.orderId,
      valueRs: o.valueRs,
      assignedRoute: route._id,
      deliveryTimestamp: o.deliveryTimestamp
    });
  }
  console.log('Inserted orders');

  // ensure admin user exists (optional)
  if (process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD){
    const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
    if (!existing) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
      await User.create({ email: process.env.ADMIN_EMAIL, passwordHash: hash, role: 'manager' });
      console.log('Admin user created:', process.env.ADMIN_EMAIL);
    } else {
      console.log('Admin user already exists:', process.env.ADMIN_EMAIL);
    }
  }

  console.log('Seeding completed.');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
