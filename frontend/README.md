# RouteWise frontend

React 19 + Vite single-page app (Leaflet map, Chart.js benchmark chart) for RouteWise.

Setup, environment variables, the API it talks to, testing and deployment are documented in the
[main README](../README.md). Quick start:

```bash
npm install
npm run dev     # http://localhost:5173 (expects the backend at VITE_API_URL, default http://localhost:5001/api)
npm test        # Vitest
npm run lint    # oxlint
npm run build   # production build in dist/
```
