# RouteWise - Interactive Pathfinding & Delivery Route Optimization Engine

```text
██████╗  ██████╗ ██╗   ██╗████████╗███████╗██╗    ██╗██╗███████╗███████╗
██╔══██╗██╔═══██╗██║   ██║╚══██╔══╝██╔════╝██║    ██║██║██╔════╝██╔════╝
██████╔╝██║   ██║██║   ██║   ██║   █████╗  ██║ █╗ ██║██║███████╗█████╗  
██╔══██╗██║   ██║██║   ██║   ██║   ██╔══╝  ██║███╗██║██║╚════██║██╔══╝  
██║  ██║╚██████╔╝╚██████╔╝   ██║   ███████╗╚███╔███╔╝██║███████║███████╗
╚═╝  ╚═╝ ╚═════╝  ╚═════╝    ╚═╝   ╚══════╝ ╚══╝╚══╝ ╚═╝╚══════╝╚══════╝
```

[![Live Demo](https://img.shields.io/badge/Demo-Live_Vercel-success?style=flat&logo=vercel)](https://routewise-seven.vercel.app)
[![Node.js Version](https://img.shields.io/badge/Node.js-20.x-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900.svg?logo=leaflet)](https://leafletjs.com/)
[![OpenStreetMap](https://img.shields.io/badge/OSM-Overpass_API-7EBC6F.svg?logo=openstreetmap)](https://www.openstreetmap.org/)
[![Tests](https://img.shields.io/badge/Tests-Jest_%26_Vitest-brightgreen.svg)](#automated-testing)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

> [!IMPORTANT]
> **GRAPH OPTIMIZATION ENGINE**  
> **RouteWise** is a full-stack algorithmic pathfinding and delivery route optimization platform built on authentic **OpenStreetMap (OSM)** road networks. It demonstrates real-world spatial graph ingestion, custom priority queue data structures (`MinHeap`), heuristic shortest-path exploration (**Dijkstra vs. A***), and NP-hard **Traveling Salesperson Problem (TSP)** heuristic approximation using **Nearest Neighbor** and **2-Opt local search**.

---

## Table of Contents

- [Overview](#overview)
- [System Architecture](#system-architecture)
- [Tech Stack](#tech-stack)
- [Algorithmic Core](#algorithmic-core)
  - [1. Spatial Graph Construction](#1-spatial-graph-construction)
  - [2. Shortest Path Search (Dijkstra vs. A*)](#2-shortest-path-search-dijkstra-vs-a)
  - [3. Multi-Stop Route Optimization (TSP 2-Opt)](#3-multi-stop-route-optimization-tsp-2-opt)
- [Complexity & Benchmarks](#complexity--benchmarks)
- [API Reference](#api-reference)
- [Local Development & Setup](#local-development--setup)
- [Automated Testing](#automated-testing)
- [Deploying](#deploying)
- [License](#license)

---

## Overview

Traditional mapping libraries rely on opaque black-box APIs. **RouteWise** implements the core graph theory and combinatorial optimization algorithms from first principles:
- **Authentic Road Vectors**: Ingests multi-thousand node road networks with real street topology and one-ways across 5 global downtowns (**New York, London, Tokyo, Paris, Seoul**).
- **Custom MinHeap Priority Queue**: High-performance $O(\log V)$ binary heap managing frontier node exploration.
- **Shortest Path Visualizer**: Live step-by-step vertex exploration animations demonstrating the search frontier difference between uniform Dijkstra expansion and guided A* search.
- **2-Opt TSP Optimizer**: Solves multi-stop delivery tours by computing all-pairs shortest paths and iteratively eliminating crossing road segments.
- **Dynamic Benchmarking**: Live runtime comparison benchmarking heuristic approximations against exact brute-force ($O(N!)$) solvers.

---

## System Architecture

```text
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|                                                                                   |
|   +---------------------------------------------------------------------------+   |
|   |  React 18 + Vite + Tailwind CSS Dashboard                                 |   |
|   |  - Leaflet Tile Map Visualizer              - Real-Time Vertex Animation  |   |
|   |  - Multi-City Downtown Selector             - TSP Benchmark Charts        |   |
|   +-------------------------------------+-------------------------------------+   |
+-----------------------------------------|-----------------------------------------+
                                          |
                                    (REST / JSON)
                                          |
                                          v
+-----------------------------------------------------------------------------------+
|                                 CORE API SERVER                                   |
|                             (Node.js + Express.js)                                |
|                                                                                   |
|  - Weighted Token-Bucket Rate Limiter      - Coordinate Snap-To-Road Engine       |
|  - Multi-City Graph Cache Store            - Route Serialization (Sequelize)      |
+------------------------+-----------------------------------+----------------------+
                         |                                   |
                         v                                   v
+-----------------------------------+     +-----------------------------------------+
|     DATA & SPATIAL ENGINE         |     |       ALGORITHMIC SOLVER LAYER          |
|                                   |     |                                         |
|  - OSM Vector Ingestion (.json)   |     |  - Binary MinHeap (O(log V) extract)    |
|  - Haversine Geodesic Distance    |     |  - Dijkstra Shortest Path Search        |
|  - Adjacency List Graph (V, E)    |     |  - A* Search (Haversine Heuristic)      |
|  - SQLite Saved Route Ledger      |     |  - Nearest Neighbor + 2-Opt Local Search|
+-----------------------------------+     +-----------------------------------------+
```

---

## Tech Stack

| Layer | Technology | Version | Purpose |
|---|---|---|---|
| **Frontend UI** | React.js / Vite | 19.x / 8.x | High-performance single page spatial visualization |
| **Mapping & GIS** | Leaflet / React-Leaflet | 1.9.x | Interactive tile rendering, polyline paths, waypoint markers |
| **Styling & Charts** | Tailwind CSS / Chart.js | 3.x / 4.x | Dark glassmorphism theme & algorithmic runtime benchmarks |
| **Backend API** | Node.js / Express.js | 20.x / 5.x | REST API routing and asynchronous algorithm execution |
| **ORM & Database** | Sequelize / SQLite3 | 6.x | Persistence for saved routes (not durable on Render) |
| **Testing** | Jest / Supertest | 30.x | Unit, API integration, regression and startup tests (backend); Vitest (frontend) |

---

## Algorithmic Core

### 1. Spatial Graph Construction
Road networks are modeled as weighted directed graphs $G = (V, E)$ using an in-memory **Adjacency List**. Edge weights are computed via the **Haversine formula**, calculating the great-circle distance between two latitude/longitude points on Earth:

$$d = 2R \arcsin\left(\sqrt{\sin^2\left(\frac{\Delta \varphi}{2}\right) + \cos(\varphi_1)\cos(\varphi_2)\sin^2\left(\frac{\Delta \lambda}{2}\right)}\right)$$

### 2. Shortest Path Search (Dijkstra vs. A*)
* **Dijkstra's Algorithm**: Dispatches a uniform wavefront from the source node, exploring vertices in strictly increasing order of path distance.
* **A\* Search**: Augments vertex priority with an admissible heuristic function $f(n) = g(n) + h(n)$, where $g(n)$ is the exact distance from start, and $h(n)$ is the straight-line Haversine distance to the goal.

```text
[Dijkstra Search Frontier]                [A* Search Frontier]
     ┌─────────────┐                           ┌─────────────┐
     │  *   *   *  │                           │             │
     │ *  START  * │                           │  START ===> │=====> [DEST]
     │  *   *   *  │                           │             │
     └─────────────┘                           └─────────────┘
 (Uniform 360° Expansion)                 (Goal-Directed Heuristic Beam)
```

### 3. Multi-Stop Route Optimization (TSP 2-Opt)
For $N$ delivery waypoints:
1. **Distance Matrix Computation**: Pre-computes all-pairs shortest paths using Dijkstra ($O(N \cdot (V+E)\log V)$).
2. **Nearest Neighbor Heuristic**: Constructs a greedy initial Hamiltonian path starting from the depot.
3. **2-Opt Local Search**: Iteratively evaluates edge swaps $(u, v)$ and $(x, y) \rightarrow (u, x)$ and $(v, y)$ until no 2-edge exchange reduces the total tour length:

$$\Delta \text{dist} = \text{dist}(u, x) + \text{dist}(v, y) - (\text{dist}(u, v) + \text{dist}(x, y)) < 0$$

---

## Complexity & Benchmarks

| Algorithm | Type | Time Complexity | Space Complexity | Optimality Guarantee |
|---|---|---|---|---|
| **Dijkstra's Algorithm** | Shortest Path | $O((V + E) \log V)$ | $O(V)$ | Optimal shortest path |
| **A* Search** | Shortest Path | $O((V + E) \log V)$ | $O(V)$ | Optimal (admissible $h(n)$) |
| **Nearest Neighbor** | TSP Approximation | $O(N^2)$ | $O(N)$ | Sub-optimal greedy tour |
| **2-Opt Optimization** | TSP Local Search | $O(k \cdot N^3)$ | $O(N)$ | Eliminates edge crossings |
| **Brute Force TSP** | Exact Search | $O(N!)$ | $O(N)$ | Globally optimal baseline |

---

## API Reference

### Base URL
```text
http://localhost:5001/api
```

**City per request.** `snap`, `shortest-path` and `tsp` take an optional `cityId` (`'new_york' | 'london' | 'tokyo' | 'paris' | 'seoul'`, default `'new_york'`). The server keeps no "current city", so visitors never affect each other. An unknown `cityId` returns `400`.

**Errors.** Invalid requests return JSON `{ "error": "..." }` with status `400` (bad input, or a point more than 500 m from the city's road network), `404` (unknown route) or `422` (a TSP stop has no road path to another stop). Server errors return a generic `500` without internal details.

#### 1. City Metadata
`POST /api/set-city`
Read-only: returns the city's map metadata. It does not change server state.
```json
// Request
{ "cityId": "new_york" } // 'new_york' | 'london' | 'tokyo' | 'paris' | 'seoul'

// Response: 200 OK
{
  "success": true,
  "name": "New York",
  "bounds": [[40.705, -74.015], [40.725, -73.995]],
  "center": [40.715, -74.005],
  "nodesLoaded": 5746
}
```

#### 2. Coordinate Road Snapping
`POST /api/snap`
Snaps to the nearest node of the city's main road network (nodes that can reach, and be reached from, every other one), so any two snapped stops can be routed between.
```json
// Request
{ "lat": 40.7128, "lng": -74.0060, "cityId": "new_york" }

// Response: 200 OK
{
  "id": "9373577341",
  "lat": 40.7131018,
  "lng": -74.0057772
}
```

#### 3. Shortest Path Search
`POST /api/shortest-path`
```json
// Request
{
  "start": { "lat": 40.7128, "lng": -74.0060 },
  "end": { "lat": 40.7200, "lng": -73.9980 },
  "algorithm": "A*", // 'Dijkstra' (default) | 'A*'
  "cityId": "new_york"
}

// Response: 200 OK
{
  "distance": 1420.5,
  "nodesVisited": 184,
  "timeMs": 4.2,
  "path": [{ "lat": 40.71278, "lng": -74.00602 }, ...],
  "exploredNodes": [{ "lat": 40.7130, "lng": -74.0055 }, ...]
}
```

#### 4. Multi-Stop Tour (TSP)
`POST /api/tsp`
Closed tour from the first stop (the depot) through every stop and back, on road distances. 2–25 stops.
```json
// Request
{ "stops": [{ "lat": 40.7146, "lng": -74.0085 }, { "lat": 40.7105, "lng": -74.0016 }, { "lat": 40.7164, "lng": -73.9998 }], "cityId": "new_york" }

// Response: 200 OK
{
  "distance": 3466.7,
  "order": [0, 1, 2], // indexes into `stops`, in visiting order; always starts with the depot (0)
  "route": [{ "lat": 40.7144201, "lng": -74.0085142 }, ...], // full road path, ends back at the depot
  "optimizationSteps": [{ "distance": 3466.7, "route": [...] }], // initial tour + each 2-opt improvement, for animation
  "timeMs": 7.9
}
```

#### 5. Algorithmic TSP Benchmark
`POST /api/benchmark`
Straight-line (Haversine) distances, so the exact brute-force solver stays fast.
```json
// Request: 2–10 stops
{ "stops": [{ "lat": 40.712, "lng": -74.006 }, { "lat": 40.718, "lng": -74.001 }, { "lat": 40.722, "lng": -73.995 }] }

// Response: 200 OK
{
  "stopsCount": 3,
  "approximation": { "timeMs": 0.32, "distance": 2840.1 },
  "exact": { "timeMs": 1.45, "distance": 2840.1 }
}
```

#### 6. Saved Routes
`POST /api/routes` · `GET /api/routes?limit=50&offset=0`

> [!WARNING]
> **Operator-only, and not durable.** These endpoints need the server's `ADMIN_API_KEY` as a bearer token and are **switched off (`404`) while it is unset**. The frontend does not use them. Routes are stored in a local **SQLite file, which is not durable on Render** (the disk is reset on every deploy and restart).

- **Access:** `Authorization: Bearer <ADMIN_API_KEY>`. A missing, malformed or wrong key gets `401 {"error":"Unauthorized"}` with `WWW-Authenticate: Bearer`; the key is checked before anything else. The key is one shared secret (no per-user accounts): anyone who has it can read and add every saved route. Keep it on the server only, never in a `VITE_` variable (Vite builds those into the public frontend).
- **Capacity:** at most 1,000 saved routes. When full, saves get `409` and nothing is deleted.
- **Allowed fields only:** `name` (1–100 characters), `algorithm` (`'Dijkstra' | 'A*' | 'TSP'`), `distance` (number ≥ 0), `stops` (2–25 `{ lat, lng }` points, required), `path` (up to 2,000 points). Any other field, including `id` or timestamps, is rejected with `400`.
- **Limits:** request bodies up to 100 kB (larger: `413`); 10 saves per client per hour (then `429`); invalid requests do not count toward that.
- **Listing:** newest first; `limit` 1–100 (default 50), `offset` ≥ 0. Returns a JSON array.

```json
// Request
{ "name": "Morning deliveries", "algorithm": "TSP", "distance": 3466.7, "stops": [{ "lat": 40.7146, "lng": -74.0085 }, { "lat": 40.7105, "lng": -74.0016 }] }
```

---

## Local Development & Setup

### Prerequisites
* **Node.js**: 20.x (20.19 or newer; the backend declares `engines: 20.x`, the Render runtime)
* **npm**: v9+

### 1. Clone the Repository
```bash
git clone https://github.com/TakshakSinghania/routewise.git
cd routewise
```

### 2. Backend Setup
```bash
cd backend
npm install
npm test          # Runs the backend test suite (unit, API and regression tests)
npm start         # Starts backend API on http://localhost:5001 (5000 is used by AirPlay on macOS)
```

### 3. Frontend Setup (Separate Terminal)
```bash
cd frontend
npm install
npm run dev       # Starts Vite React application on http://localhost:5173
```

The backend accepts browser requests only from the origins in `CORS_ORIGINS` (see [Deploying](#deploying)). Unset, that is the production frontend plus Vite on `localhost`/`127.0.0.1` ports 5173 (`npm run dev`) and 4173 (`npm run preview`). If Vite starts on another port (it moves to 5174 when 5173 is busy), the API answers `403 Origin not allowed`: free the port, or list the origin in `backend/.env`.

---

## Automated Testing

```bash
cd backend
npm test             # Jest + Supertest
npm run audit:prod   # fails on high/critical advisories in production dependencies
```

```bash
cd frontend
npm test             # Vitest
npm run check:tiles  # needs internet: fetches one real map tile (not part of npm test)
```

The backend suite covers:
* **Data structures and algorithms**: the MinHeap, Dijkstra/A* agreement, strongly connected components, Nearest Neighbor, and 2-opt (including one-way streets, where it must never lengthen a tour).
* **TSP tours on the real city graphs**: every stop visited once, depot first and last, every leg a real road path, and distance equal to the sum of the legs.
* **API behaviour**: input validation and JSON errors, per-request `cityId` with two visitors at once, rate limiting, security headers, allowed CORS origins, the saved-route admin key, capacity, validation and pagination, and server startup on a busy port.

`node backend/scripts/smoke.mjs <baseUrl>` is a read-only smoke test for a running backend (local or deployed).

---

## Deploying

The backend runs on Render and the frontend on Vercel. **Deploy both together**: the frontend sends `cityId` with every request, and an older frontend would route every request to New York.

| Where | Variable | Value |
|---|---|---|
| Render (backend) | `NODE_ENV` | `production` |
| Render (backend) | `PORT` | set by Render |
| Render (backend) | `CORS_ORIGINS` | `https://routewise-seven.vercel.app` (plus any custom domain of the frontend) |
| Render (backend) | `ADMIN_API_KEY` | leave unset (saved routes off), or a key from the command below |
| Render (backend) | `TRUST_PROXY_HOPS` | **leave unset** until measured (below) |
| Vercel (frontend) | `VITE_API_URL` | `https://<your-backend>.onrender.com/api` |

**Admin key.** Only needed for the saved-routes endpoints. It must be at least 32 characters of `A-Z a-z 0-9 - . _ ~ + /` (an invalid key stops the server at startup). Generate one and paste it straight into Render's environment settings, never into a file or the frontend:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

To rotate it, replace the value (Render restarts the service); to switch saved routes off, delete it.

**Allowed browser origins (CORS).** `CORS_ORIGINS` is a comma-separated list of exact origins (`https://host[:port]`, no path or trailing slash); an invalid entry stops the server at startup. A browser request from any other origin, including other Vercel URLs of the project and preview deployments, gets `403 Origin not allowed` before it is processed or rate limited. Unset or empty, the list is the production frontend plus Vite on localhost (ports 5173 and 4173); set it in production so only the real frontend is listed. CORS only binds browsers: scripts can still call the API without an `Origin` header, so the rate limit stays the abuse control.

**Rate limiting and proxies.** Each client gets 30 tokens, refilled at 10 per second; a request costs 1 token plus 1 per stop (saved-route writes are also limited to 10 per hour). Behind Render's proxy, Express sees the proxy's address unless `TRUST_PROXY_HOPS` is set to the exact number of proxies, so with it unset, visitors may share one allowance. A wrong value is worse: clients could fake their IP with `X-Forwarded-For`. To find the right value, set `TRUST_PROXY_HOPS=1`, deploy, then:
1. From your network, send about 35 quick requests (for example `POST /api/snap`) until you get `429`.
2. Immediately send one more with a made-up header, `X-Forwarded-For: 203.0.113.7`. It must also get `429`; a `200` means the value is too high (spoofable).
3. From a different network (such as a phone hotspot), send one request. It must get `200`; a `429` means the value is too low (clients still share an allowance).

Keep the value only if both checks pass; otherwise unset it.

After deploying, run `node backend/scripts/smoke.mjs https://<your-backend>.onrender.com`.

---

## 📄 License

MIT License. Designed and engineered by **Takshak Singhania**.
