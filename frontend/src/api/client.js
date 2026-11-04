import axios from 'axios';

export const DEFAULT_API_URL = 'http://localhost:5001/api';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || DEFAULT_API_URL,
});

export const snapCoordinate = async (latlng, cityId) => {
  const { data } = await api.post('/snap', { ...latlng, cityId });
  return data;
};

export const getShortestPath = async (start, end, algorithm = 'Dijkstra', cityId) => {
  const { data } = await api.post('/shortest-path', { start, end, algorithm, cityId });
  return data;
};

export const getOptimizedRoute = async (stops, cityId) => {
  const { data } = await api.post('/tsp', { stops, cityId });
  return data;
};

export const runBenchmark = async (stops) => {
  const response = await api.post('/benchmark', { stops });
  return response.data;
};

export const setCity = async (cityId) => {
  const response = await api.post('/set-city', { cityId });
  return response.data;
};
