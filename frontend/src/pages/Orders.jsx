import React, { useEffect, useState } from 'react';
import api from '../api/api';

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [routesError, setRoutesError] = useState(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    orderId: '',
    valueRs: '',
    assignedRouteId: '', // local select value (route _id)
    deliveryTimestamp: ''
  });

  // fetch orders and routes independently so one failure doesn't block the other
  const fetchAll = async () => {
    // orders
    try {
      const ordersRes = await api.get('/orders');
      setOrders(ordersRes.data || []);
    } catch (err) {
      console.error('Failed to fetch orders:', err);
      setOrders([]);
      // don't show a blocking alert; you can show an inline message if desired
    }

    // routes
    try {
      const routesRes = await api.get('/routes');
      setRoutes(routesRes.data || []);
      setRoutesError(null);
    } catch (err) {
      console.error('Failed to fetch routes:', err);
      setRoutes([]);
      setRoutesError('Could not load routes — dropdown will be empty. Check console for details.');
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const create = async () => {
    // Validate minimal required fields
    if (!form.orderId || String(form.orderId).trim() === '') {
      return alert('Order ID is required');
    }
    if (!form.valueRs || Number.isNaN(Number(form.valueRs))) {
      return alert('Order value is required and must be a number');
    }
    if (!form.assignedRouteId) {
      return alert('Please select a route');
    }

    const payload = {
      orderId: String(form.orderId).trim(),
      valueRs: Number(form.valueRs),
      assignedRoute: form.assignedRouteId, // backend expects route _id (ObjectId) for assignedRoute
      deliveryTimestamp: form.deliveryTimestamp || undefined
    };

    setLoading(true);
    try {
      console.log('Creating order with payload:', payload);
      await api.post('/orders', payload);
      setForm({ orderId: '', valueRs: '', assignedRouteId: '', deliveryTimestamp: '' });
      await fetchAll();
    } catch (err) {
      console.error('Failed to create order:', err);
      alert(err?.response?.data?.error || 'Failed to create order. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this order?')) return;
    try {
      await api.delete('/orders/' + id);
      fetchAll();
    } catch (err) {
      console.error('Failed to delete order:', err);
      alert('Delete failed (see console).');
    }
  };

  return (
    <div className="container">
      <h2>Orders</h2>

      <div className="card" style={{ padding: 16, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            placeholder="Order ID"
            value={form.orderId}
            onChange={e => setForm({ ...form, orderId: e.target.value })}
          />
          <input
            placeholder="Value (₹)"
            type="number"
            value={form.valueRs}
            onChange={e => setForm({ ...form, valueRs: e.target.value })}
          />

          <select
            value={form.assignedRouteId}
            onChange={e => setForm({ ...form, assignedRouteId: e.target.value })}
          >
            <option value="">Select Route</option>
            {routes.map(r => (
              <option key={r._id} value={r._id}>
                {r.routeId} ({r.trafficLevel}) — {r.distanceKm} km — {r.baseTimeMinutes} min
              </option>
            ))}
          </select>

          <input
            placeholder="Delivery Time"
            type="datetime-local"
            value={form.deliveryTimestamp}
            onChange={e => setForm({ ...form, deliveryTimestamp: e.target.value })}
          />

          <button onClick={create} disabled={loading}>
            {loading ? 'Adding…' : 'Add Order'}
          </button>
        </div>

        {routesError && (
          <div style={{ marginTop: 10, color: '#ffb86b' }}>
            {routesError}
          </div>
        )}
      </div>

      <ul>
        {orders.map(o => (
          <li key={o._id} style={{ marginBottom: 8 }}>
            <strong>{o.orderId}</strong> — ₹{o.valueRs} — {o.assignedRoute?.routeId || o.assignedRoute || 'N/A'}
            <button style={{ marginLeft: 10 }} onClick={() => remove(o._id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
