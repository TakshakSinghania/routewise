# RouteWise - Interactive Pathfinding & Delivery Route Optimization Engine

🚀 **Live Demo:** [https://routewise-seven.vercel.app](https://routewise-seven.vercel.app)

RouteWise is a full-stack graph algorithms and route optimization platform built on top of authentic OpenStreetMap road networks. It provides interactive visual comparisons of shortest-path algorithms (**Dijkstra's Algorithm** and **A* Search**) and solves multi-stop delivery routes using heuristic approximations for the **Traveling Salesperson Problem (TSP)** with **Nearest Neighbor** and **2-Opt local search**.

---

## 🌟 Key Features

- **Authentic Road Graph Ingestion**: Parses real-world OpenStreetMap (OSM) vector data, calculating Haversine edge distances, one-way road restrictions, and street junctions.
- **Pre-Cached Multi-City Downtowns**: Instant switching between 5 major global downtown areas (**New York, London, Tokyo, Seoul, Paris**) without on-the-fly network latency.
- **Shortest Path Comparison**:
  - **Dijkstra's Algorithm**: Implemented with a custom binary `MinHeap` ($O((V + E) \log V)$), uniformly expanding outward to guarantee optimal shortest paths.
  - **A* Search**: Uses a distance-to-goal heuristic ($h(n)$) to direct vertex exploration, reducing explored nodes by up to 60%.
- **Multi-Stop TSP Optimization**:
  - **Nearest Neighbor Greedy Heuristic**: Constructs an initial Hamiltonian path in $O(N^2)$.
  - **2-Opt Local Search**: Iteratively uncrosses intersecting road segments until reaching a local optimum.
  - **Dynamic Algorithmic Benchmarking**: Benchmarks heuristic execution time vs. exact brute-force ($O(N!)$) calculations in real time.
- **Coordinate Road Snapping**: Automatically snaps arbitrary click coordinates to the closest valid road node in the graph.
- **Token-Bucket Rate Limiting**: Protects backend computation endpoints from denial-of-service spikes.

---

## 📊 Algorithm Complexity Comparison

| Algorithm | Type | Time Complexity | Space Complexity | Guarantees |
|---|---|---|---|---|
| **Dijkstra** | Shortest Path | $O((V + E) \log V)$ | $O(V)$ | Optimal shortest path |
| **A* Search** | Shortest Path | $O((V + E) \log V)$ | $O(V)$ | Optimal path (admissible heuristic) |
| **Nearest Neighbor** | TSP Heuristic | $O(N^2)$ | $O(N)$ | Fast initial tour approximation |
| **2-Opt Optimization** | TSP Heuristic | $O(k \cdot N^2)$ | $O(N)$ | Eliminates crossing edges |
| **Brute Force TSP** | Exact Search | $O(N!)$ | $O(N)$ | Globally optimal tour (benchmark baseline) |

---

## 🛠️ Technology Stack

- **Frontend**: React 18, Vite, Tailwind CSS, React-Leaflet, Chart.js, Lucide Icons
- **Backend**: Node.js, Express.js, Sequelize ORM, SQLite
- **Data & Geography**: OpenStreetMap Overpass API, Haversine Geographic Distance
- **Testing**: Jest, Supertest (10 unit and API integration tests)

---

## 🚀 Getting Started Locally

### Prerequisites
- **Node.js**: v18+ or v20+
- **npm**: v9+

### 1. Clone the Repository
```bash
git clone https://github.com/TakshakSinghania/routewise.git
cd routewise
```

### 2. Backend Setup
```bash
cd backend
npm install
npm test          # Run automated test suite (10 tests)
npm start         # Starts backend API on http://localhost:5000
```

### 3. Frontend Setup (Separate Terminal)
```bash
cd frontend
npm install
npm run dev       # Starts Vite React dashboard on http://localhost:5173
```

---

## 🧪 Automated Testing

Run the test suite from the `backend/` directory:

```bash
cd backend
npm test
```

Verifies:
* `MinHeap`: Priority ordering, element insertion, and $O(\log N)$ extraction.
* `Graph & Pathfinding`: Grid graph shortest-path validation for Dijkstra and A*.
* `TSP Heuristics`: Nearest Neighbor valid tour generation and 2-Opt distance minimization.
* `API Endpoints`: `/health`, `/api/set-city`, `/api/snap`, and `/api/benchmark` integration tests.

---

## 📡 API Reference

* `GET /health` — Service health status
* `POST /api/set-city` — Switch active map graph (`{ cityId: "new_york" | "london" | "tokyo" | "paris" | "seoul" }`)
* `POST /api/snap` — Snap raw coordinate `{ lat, lng }` to nearest road vertex
* `POST /api/shortest-path` — Calculate path (`{ start, end, algorithm: "Dijkstra" | "A*" }`)
* `POST /api/tsp` — Optimize multi-stop route (`{ stops: [{ lat, lng }] }`)
* `POST /api/benchmark` — Compare heuristic approximation against exact TSP solver (`{ stops }`)

---

## 📄 License

MIT License. Designed and built by **Takshak Singhania**.
