import React, { useEffect, useState } from 'react';
import api from '../api/api'; // your axios instance, see note below
import './drivers.css';


export default function Drivers() {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState({ name: '', currentShiftHours: 0, past7DayHours: '' });
  const [loading, setLoading] = useState(false);

  // renamed from `fetch` -> loadDrivers to avoid conflicts
  const loadDrivers = async () => {
    setLoading(true);
    try {
      const res = await api.get('/drivers');
      setDrivers(res.data || []);
    } catch (err) {
      console.error('Failed to load drivers', err);
      alert('Failed to load drivers — check console');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadDrivers(); }, []);

  // parse the past7DayHours input into an array (accepts "6|8|7" or "6,8,7")
  function parsePast7(raw) {
    if (!raw) return [];
    return String(raw)
      .trim()
      .replace(/\s+/g, '') // remove spaces
      .replace(/,/g, '|') // support comma separated
      .split('|')
      .filter(Boolean)
      .map(s => Number(s) || 0);
  }

  const create = async () => {
    if (!form.name || !form.name.trim()) {
      return alert('Name is required');
    }
    try {
      const payload = {
        name: form.name.trim(),
        currentShiftHours: Number(form.currentShiftHours) || 0,
        past7DayHours: parsePast7(form.past7DayHours)
      };
      await api.post('/drivers', payload);
      setForm({ name: '', currentShiftHours: 0, past7DayHours: '' });
      await loadDrivers();
    } catch (err) {
      console.error('Create driver failed', err);
      const msg = err?.response?.data?.error || err.message || 'Create failed';
      alert('Failed to create driver: ' + msg);
    }
  };

  const remove = async (id) => {
    if (!confirm('Delete driver?')) return;
    try {
      await api.delete('/drivers/' + id);
      await loadDrivers();
    } catch (err) {
      console.error('Delete driver failed', err);
      alert('Failed to delete driver');
    }
  };

  return (
    <div className="container p-6">
      <h2 className="text-2xl mb-4">Drivers</h2>

      <div className="card p-4 mb-6 bg-white/5 rounded">
        <div className="flex gap-2 items-center">
          <input
            placeholder="name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            className="px-3 py-2 rounded bg-slate-800 flex-1"
          />
          <input
            placeholder="currentShiftHours"
            type="number"
            value={form.currentShiftHours}
            onChange={e => setForm({ ...form, currentShiftHours: Number(e.target.value) })}
            className="w-36 px-3 py-2 rounded bg-slate-800"
          />
        </div>

        <div className="mt-3">
          <input
            placeholder="Past7 (e.g. 6|8|7|6|... or 6,8,7,...)"
            value={form.past7DayHours}
            onChange={e => setForm({ ...form, past7DayHours: e.target.value })}
            className="w-full px-3 py-2 rounded bg-slate-800"
          />
        </div>

        <div className="mt-3">
          <button onClick={create} className="px-4 py-2 bg-blue-600 rounded">Add Driver</button>
        </div>
      </div>

      {loading ? <div>Loading drivers...</div> : (
        <ul className="space-y-3">
          {drivers.map(d => (
            <li key={d._id} className="flex items-center justify-between bg-slate-900 p-3 rounded">
              <div>
                <div className="font-medium">{d.name} — shift: {d.currentShiftHours}h</div>
                <div className="text-sm text-slate-400">past7: {(d.past7DayHours || []).join('|')}</div>
              </div>
              <div>
                <button onClick={() => remove(d._id)} className="px-3 py-1 bg-red-600 rounded">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
