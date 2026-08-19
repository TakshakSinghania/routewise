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
[![Node.js Version](https://img.shields.io/badge/Node.js-v18+-green.svg)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB.svg?logo=react)](https://react.dev/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9-199900.svg?logo=leaflet)](https://leafletjs.com/)
[![OpenStreetMap](https://img.shields.io/badge/OSM-Overpass_API-7EBC6F.svg?logo=openstreetmap)](https://www.openstreetmap.org/)
[![Jest Tests](https://img.shields.io/badge/Tests-10_Passing-brightgreen.svg)](https://jestjs.io/)
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
|  - Token Bucket Rate Limiter (10 req/s)    - Coordinate Snap-To-Road Engine       |
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
| **Frontend UI** | React.js / Vite | 18.x / 8.x | High-performance single page spatial visualization |
| **Mapping & GIS** | Leaflet / React-Leaflet | 1.9.x | Interactive tile rendering, polyline paths, waypoint markers |
| **Styling & Charts** | Tailwind CSS / Chart.js | 3.x / 4.x | Dark glassmorphism theme & algorithmic runtime benchmarks |
| **Backend API** | Node.js / Express.js | 20+ / 5.x | REST API routing and asynchronous algorithm execution |
| **ORM & Database** | Sequelize / SQLite3 | 6.x | Persistence store for saved routes and benchmark logs |
| **Testing** | Jest / Supertest | 30.x | Unit and API integration test suites (10 tests) |

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
| **2-Opt Optimization** | TSP Local Search | $O(k \cdot N^2)$ | $O(N)$ | Eliminates edge crossings |
| **Brute Force TSP** | Exact Search | $O(N!)$ | $O(N)$ | Globally optimal baseline |

---

## API Reference

### Base URL
```text
http://localhost:5000/api
```

#### 1. Set City Graph
`POST /api/set-city`
```json
// Request
{ "cityId": "new_york" } // 'new_york' | 'london' | 'tokyo' | 'paris' | 'seoul'

// Response: 200 OK
{
  "success": true,
  "name": "New York",
  "bounds": [[40.705, -74.015], [40.725, -73.995]],
  "center": [40.715, -74.005],
  "nodesLoaded": 14820
}
```

#### 2. Coordinate Road Snapping
`POST /api/snap`
```json
// Request
{ "lat": 40.7128, "lng": -74.0060 }

// Response: 200 OK
{
  "id": "node_98124",
  "lat": 40.71278,
  "lng": -74.00602
}
```

#### 3. Shortest Path Search
`POST /api/shortest-path`
```json
// Request
{
  "start": { "lat": 40.7128, "lng": -74.0060 },
  "end": { "lat": 40.7200, "lng": -73.9980 },
  "algorithm": "A*" // 'Dijkstra' | 'A*'
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

#### 4. Algorithmic TSP Benchmark
`POST /api/benchmark`
```json
// Request: Max 10 stops
{ "stops": [{ "lat": 40.712, "lng": -74.006 }, { "lat": 40.718, "lng": -74.001 }, { "lat": 40.722, "lng": -73.995 }] }

// Response: 200 OK
{
  "stopsCount": 3,
  "approximation": { "timeMs": 0.32, "distance": 2840.1 },
  "exact": { "timeMs": 1.45, "distance": 2840.1 }
}
```

---

## Local Development & Setup

### Prerequisites
* **Node.js**: v18.0.0+ or v20.0.0+
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
npm test          # Executes all 10 automated unit & integration tests
npm start         # Starts backend API on http://localhost:5000
```

### 3. Frontend Setup (Separate Terminal)
```bash
cd frontend
npm install
npm run dev       # Starts Vite React application on http://localhost:5173
```

---

## Automated Testing

```bash
cd backend
npm test
```

Executes 10 tests across:
* **Binary MinHeap**: Priority verification, element insertions, and $O(\log N)$ extraction.
* **Graph Structure**: Grid graph generation, vertex connectivity, and bidirectional edge handling.
* **Pathfinding Invariants**: Shortest-path verification for Dijkstra and A* heuristics.
* **TSP Approximations**: Nearest Neighbor valid tour generation and 2-Opt edge minimization.
* **API Integration**: Endpoint validation for `/health`, `/api/set-city`, `/api/snap`, and `/api/benchmark`.

---

## 📄 License

MIT License. Designed and engineered by **Takshak Singhania**.
