import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:5000/api',
});

export const snapCoordinate = async (latlng) => {
  const { data } = await api.post('/snap', latlng);
  return data;
};

export const getShortestPath = async (start, end, algorithm = 'Dijkstra') => {
  const { data } = await api.post('/shortest-path', { start, end, algorithm });
  return data;
};

export const getOptimizedRoute = async (stops) => {
  const { data } = await api.post('/tsp', { stops });
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
