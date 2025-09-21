import React, { useEffect, useState } from 'react';
import api from '../api/api';

export default function RoutesPage() {
  const [routes, setRoutes] = useState([]);
  const [form, setForm] = useState({ routeId: '', distanceKm: '', trafficLevel: 'Medium', baseTimeMinutes: '' });

  const fetchRoutes = async () => {
    try {
      const res = await api.get('/routes');
      setRoutes(res.data);
    } catch (err) {
      alert('Failed to fetch routes');
    }
  };

  useEffect(() => { fetchRoutes(); }, []);

  const create = async () => {
    try {
      await api.post('/routes', form);
      setForm({ routeId: '', distanceKm: '', trafficLevel: 'Medium', baseTimeMinutes: '' });
      fetchRoutes();
    } catch (err) {
      alert(err?.response?.data?.error || 'Failed to create route');
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this route?')) return;
    await api.delete('/routes/' + id);
    fetchRoutes();
  };

  return (
    <div className="container">
      <h2>Routes</h2>
      <div className="card">
        <input placeholder="Route ID" value={form.routeId} onChange={e=>setForm({...form,routeId:e.target.value})} />
        <input placeholder="Distance (km)" type="number" value={form.distanceKm} onChange={e=>setForm({...form,distanceKm:e.target.value})} />
        <select value={form.trafficLevel} onChange={e=>setForm({...form,trafficLevel:e.target.value})}>
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
        <input placeholder="Base Time (min)" type="number" value={form.baseTimeMinutes} onChange={e=>setForm({...form,baseTimeMinutes:e.target.value})} />
        <button onClick={create}>Add Route</button>
      </div>

      <ul>
        {routes.map(r=>(
          <li key={r._id}>
            {r.routeId} - {r.distanceKm} km - {r.trafficLevel} - {r.baseTimeMinutes} min
            <button onClick={()=>remove(r._id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
