const request = require('supertest');
const express = require('express');
const app = express();
app.use(express.json());
const mongoose = require('mongoose');
const simCtrl = require('../controllers/simulationController');

app.post('/run', (req, res) => simCtrl.runSimulation(req, res));

beforeAll(async () => {
  const mongo = 'mongodb://127.0.0.1:27017/greencart_test';
  await mongoose.connect(mongo, { useNewUrlParser: true, useUnifiedTopology: true });
});

afterAll(async () => {
  await mongoose.disconnect();
});

test('simulation returns error when missing params', async () => {
  const res = await request(app).post('/run').send({});
  expect(res.statusCode).toBe(400);
});
