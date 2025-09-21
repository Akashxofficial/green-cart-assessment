const request = require('supertest');
const app = require('../app'); // export express app from app.js
const db = require('./setupTestDB');
const Driver = require('../models/Driver');
const Route = require('../models/Route');
const Order = require('../models/Order');
const SimulationResult = require('../models/SimulationResult');

beforeAll(db.connect);
afterEach(db.clearDatabase);
afterAll(db.closeDatabase);

describe('Backend Tests', () => {
  test('1. Driver creation & fetch', async () => {
    await Driver.create({ name: 'TestDriver', currentShiftHours: 5, past7DayHours: [6,6,6,6,6,6,6] });
    const res = await request(app).get('/api/drivers');
    expect(res.status).toBe(200);
    expect(res.body[0].name).toBe('TestDriver');
  });

  test('2. Route validation fails on bad input', async () => {
    try {
      await Route.create({ routeId: '', distanceKm: -5, baseTimeMinutes: 0 });
    } catch (err) {
      expect(err.name).toBe('ValidationError');
    }
  });

  test('3. Order links to route correctly', async () => {
    const r = await Route.create({ routeId: 'R-1', distanceKm: 5, trafficLevel: 'Low', baseTimeMinutes: 10 });
    await Order.create({ orderId: 'O-1', valueRs: 500, assignedRoute: r._id });
    const res = await request(app).get('/api/orders');
    expect(res.status).toBe(200);
    expect(res.body[0].orderId).toBe('O-1');
  });

  test('4. Simulation runs & saves history', async () => {
    const d = await Driver.create({ name: 'DriverA', currentShiftHours: 5, past7DayHours: [6,6,6,6,6,6,6] });
    const r = await Route.create({ routeId: 'R-10', distanceKm: 10, trafficLevel: 'Low', baseTimeMinutes: 30 });
    await Order.create({ orderId: 'O-10', valueRs: 1000, assignedRoute: r._id });

    const res = await request(app).post('/api/simulation/run-debug').send({
      numberOfDrivers: 1,
      routeStartTime: '09:00',
      maxHoursPerDriver: 8
    });

    expect(res.status).toBe(200);
    expect(res.body.totalProfit).toBeDefined();

    const history = await SimulationResult.find();
    expect(history.length).toBe(1);
  });

  test('5. Protected route blocks without token', async () => {
    const res = await request(app).post('/api/routes').send({
      routeId: 'R-2', distanceKm: 5, baseTimeMinutes: 15, trafficLevel: 'Low'
    });
    expect(res.status).not.toBe(200);
  });
});
