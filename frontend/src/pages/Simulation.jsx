import React, { useState } from 'react';
import api from '../api/api';

export default function Simulation() {
  const [numDrivers, setNumDrivers] = useState(2);
  const [startTime, setStartTime] = useState('09:00');
  const [maxHours, setMaxHours] = useState(8);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    if (!numDrivers || numDrivers <= 0) return alert('Invalid number of drivers');
    if (!maxHours || maxHours <= 0) return alert('Invalid max hours');
    if (!/^\d{2}:\d{2}$/.test(startTime)) return alert('Time must be HH:MM');

    setLoading(true);
    try {
      const res = await api.post('/simulation/run', {
        numberOfDrivers: Number(numDrivers),
        routeStartTime: startTime,
        maxHoursPerDriver: Number(maxHours)
      });
      setResult(res.data);
      // 🔔 Trigger Dashboard refresh
      window.dispatchEvent(new CustomEvent('simulation:completed'));
    } catch (err) {
      alert(err?.response?.data?.error || 'Simulation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container">
      <h2>Run Simulation</h2>
      <div className="form-grid">
        <label>Number of drivers</label>
        <input value={numDrivers} onChange={e=>setNumDrivers(e.target.value)} type="number" />
        <label>Route start time (HH:MM)</label>
        <input value={startTime} onChange={e=>setStartTime(e.target.value)} />
        <label>Max hours per driver/day</label>
        <input value={maxHours} onChange={e=>setMaxHours(e.target.value)} type="number" />
        <button onClick={run} disabled={loading}>
          {loading ? 'Running...' : 'Run Simulation'}
        </button>
      </div>

      {result && (
        <div className="card">
          <h3>Simulation Result</h3>
          <p>Total Profit: ₹{result.totalProfit}</p>
          <p>Efficiency: {result.efficiency}%</p>
          <p>On-time: {result.onTime} | Late: {result.late}</p>
        </div>
      )}
    </div>
  );
}
