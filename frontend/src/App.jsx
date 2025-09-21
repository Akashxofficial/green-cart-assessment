// src/App.jsx
import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, Link } from 'react-router-dom';
import Login from './components/Login';
import Dashboard from './pages/Dashboard';
import Simulation from './pages/Simulation';
import Drivers from './pages/Drivers';
import RoutesPage from './pages/RoutesPage';
import Orders from './pages/Orders';
import { setToken } from './api/api';

function App() {
  const [token, setTok] = useState(() => localStorage.getItem('gc_token') || null);

  useEffect(() => {
    if (token) {
      setToken(token);
      localStorage.setItem('gc_token', token);
    } else {
      setToken(null);
      localStorage.removeItem('gc_token');
    }
  }, [token]);

  const handleLogin = (tok) => setTok(tok);
  const handleLogout = () => setTok(null);

  const AuthNav = () => (
    <nav style={{ padding: 12, background: '#12181bff', display: 'flex', gap: 12, alignItems: 'center' }}>
      <Link to="/">Dashboard</Link>
      <Link to="/simulation">Simulation</Link>
      <Link to="/drivers">Drivers</Link>
      <Link to="/routes">Routes</Link>
      <Link to="/orders">Orders</Link>
      <button onClick={handleLogout} style={{ marginLeft: 'auto' }}>Logout</button>
    </nav>
  );

  return (
    <>
      {token && <AuthNav />}

      <Routes>
        <Route path="/login" element={<Login onLogin={handleLogin} />} />
        <Route path="/" element={token ? <Dashboard /> : <Navigate to="/login" replace />} />
        <Route path="/dashboard" element={token ? <Dashboard /> : <Navigate to="/login" replace />} />
        <Route path="/simulation" element={token ? <Simulation /> : <Navigate to="/login" replace />} />
        <Route path="/drivers" element={token ? <Drivers /> : <Navigate to="/login" replace />} />
        <Route path="/routes" element={token ? <RoutesPage /> : <Navigate to="/login" replace />} />
        <Route path="/orders" element={token ? <Orders /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to={token ? "/" : "/login"} replace />} />
      </Routes>
    </>
  );
}

export default App;
