import React, { useEffect, useState, useRef } from 'react';
import api from '../api/api';
import '../dashboard.css'; // path adjust karo agar alag hai

import {
  Chart as ChartJS,
  BarElement,
  CategoryScale,
  LinearScale,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';

ChartJS.register(BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend);

// keep Chart defaults as you had them elsewhere

export default function Dashboard() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [chartKey, setChartKey] = useState(0); // used to force chart recreation only when needed

  const bcRef = useRef(null);
  const lastFetchRef = useRef(0);

  // Guard for chart bumps — prevents multiple bumps within short window
  const lastChartBumpRef = useRef(0);
  const CHART_BUMP_DEBOUNCE = 400; // ms

  const bumpChartsOnce = (delay = 80) => {
    const now = Date.now();
    if (now - lastChartBumpRef.current < CHART_BUMP_DEBOUNCE) return;
    lastChartBumpRef.current = now;
    setTimeout(() => {
      // increment key so react-chartjs-2 redraws (we use redraw prop also)
      setChartKey(k => k + 1);
      // trigger window resize so chart internal layout recalculates
      try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    }, delay);
  };

  const fetchLatest = async () => {
    try {
      const now = Date.now();
      if (now - lastFetchRef.current < 700) return; // small throttle for rapid-fire events
      lastFetchRef.current = now;

      setLoading(true);
      const res = await api.get('/simulation/history');
      if (res.data && res.data.length) {
        setResult(res.data[0].result);
        // only request a single chart bump — use guarded bump
        bumpChartsOnce(140);
      } else {
        setResult(null);
      }
    } catch (err) {
      console.error('Error fetching simulation history', err);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLatest();

    // single handler that fetches and relies on bumpChartsOnce
    const handler = () => { fetchLatest(); };

    window.addEventListener('simulation:completed', handler);

    try {
      const bc = new BroadcastChannel('greencart');
      bc.onmessage = (ev) => {
        if (ev?.data === 'simulation:completed') fetchLatest();
      };
      bcRef.current = bc;
    } catch (e) {
      // ignore if not supported
    }

    // when focus comes back, re-fetch and bump charts (guarded)
    const onFocus = () => { fetchLatest(); bumpChartsOnce(80); };
    window.addEventListener('focus', onFocus);

    // orientation change -> bump charts but guarded
    const onOrientation = () => bumpChartsOnce(160);
    window.addEventListener('orientationchange', onOrientation);

    // debounced window resize: only bump after user stops resizing
    let resizeTimer = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { bumpChartsOnce(0); resizeTimer = null; }, 140);
    };
    window.addEventListener('resize', onResize);

    return () => {
      window.removeEventListener('simulation:completed', handler);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('orientationchange', onOrientation);
      window.removeEventListener('resize', onResize);
      if (bcRef.current) {
        try { bcRef.current.close(); } catch (e) {}
        bcRef.current = null;
      }
    };
  }, []); // run once

  const computeFuelByTraffic = (orderDetails = []) => {
    const map = { Low: 0, Medium: 0, High: 0 };
    orderDetails.forEach((o) => {
      const lvl = o?.trafficLevel || o?.assignedRoute?.trafficLevel || o?.route?.trafficLevel || 'Medium';
      const fuel = Number(o?.fuelCost || 0);
      if (map[lvl] !== undefined) map[lvl] += fuel;
      else map.Medium += fuel;
    });
    return map;
  };

  // inline styles (same as your code)
  const smallChartBoxStyle = {
    width: '100%',
    maxWidth: 520,
    margin: '0 auto',
    height: 420,
    padding: 12,
    background: '#fff',
    borderRadius: 10,
    boxShadow: '0 8px 20px rgba(16,24,40,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box'
  };
  const wideChartBoxStyle = {
    width: '100%',
    maxWidth: 1100,
    margin: '18px auto 0',
    height: 380,
    padding: 12,
    background: '#fff',
    borderRadius: 10,
    boxShadow: '0 8px 20px rgba(16,24,40,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box'
  };

  return (
    <div className="gc-root">
      <div className="gc-wrapper">
        <h1 className="gc-title">GreenCart Dashboard</h1>

        {loading && <p className="gc-sub">Loading...</p>}
        {!loading && !result && <p className="gc-sub">No simulation history yet. Run a simulation.</p>}

        {result && (
          <>
            <div className="gc-cards">
              <div className="gc-card">
                <div className="gc-card-heading">Total Profit</div>
                <div className="gc-card-value">₹ {result.totalProfit}</div>
              </div>

              <div className="gc-card">
                <div className="gc-card-heading">Efficiency</div>
                <div className="gc-card-value">{result.efficiency}%</div>
              </div>

              <div className="gc-card">
                <div className="gc-card-heading">Deliveries</div>
                <div className="gc-card-value">On-time: {result.onTime} | Late: {result.late}</div>
              </div>
            </div>

            <div className="gc-grid">
              <div className="gc-chart-wrap">
                <h4 className="gc-chart-title">On-time vs Late</h4>
                <div className="gc-chart-box" style={smallChartBoxStyle}>
                  <Pie
                    // remove direct aggressive keys — use chartKey only to allow forced re-create when needed
                    key={`pie-${chartKey}`}
                    redraw
                    data={{
                      labels: ['On-time', 'Late'],
                      datasets: [{ data: [result.onTime || 0, result.late || 0], backgroundColor: ['#28a745', '#dc3545'] }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { position: 'bottom' } }
                    }}
                  />
                </div>
              </div>

              <div className="gc-chart-wrap">
                <h4 className="gc-chart-title">Fuel Cost Breakdown</h4>
                <div className="gc-chart-box" style={smallChartBoxStyle}>
                  <Bar
                    key={`bar-fuel-${chartKey}`}
                    redraw
                    data={{
                      labels: ['Low', 'Medium', 'High'],
                      datasets: [{
                        label: 'Fuel Cost (₹)',
                        data: (() => {
                          const m = computeFuelByTraffic(result?.orderDetails || []);
                          return [Math.round(m.Low || 0), Math.round(m.Medium || 0), Math.round(m.High || 0)];
                        })(),
                        backgroundColor: ['#2196F3', '#FFC107', '#9C27B0'],
                        borderRadius: 6, borderSkipped: false
                      }]
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      plugins: { legend: { display: false } },
                      scales: { y: { beginAtZero: true } }
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="gc-section">
              <h4 className="gc-chart-title">Profit per Order (sample)</h4>
              <div className="gc-chart-box gc-chart-box-wide" style={wideChartBoxStyle}>
                <Bar
                  key={`bar-orders-${chartKey}`}
                  redraw
                  data={{
                    labels: (result?.orderDetails || []).map(o => o.orderId),
                    datasets: [{
                      label: 'Profit (₹)',
                      data: (result?.orderDetails || []).map(o => Math.round(o.orderProfit || 0)),
                      backgroundColor: (result?.orderDetails || []).map((_, i) => i % 2 === 0 ? 'rgba(54,162,235,0.8)' : 'rgba(255,159,64,0.8)')
                    }]
                  }}
                  options={{
                    maintainAspectRatio: false,
                    responsive: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                  }}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
