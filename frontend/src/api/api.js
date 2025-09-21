import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000/api';

const instance = axios.create({
  baseURL: API_BASE
});

export function setToken(token) {
  instance.defaults.headers.common['Authorization'] = `Bearer ${token}`;
}

export default instance;
