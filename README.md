# RouteWise: AI-Powered Delivery Route Optimizer

🚀 **Live Demo:** [https://routewise-seven.vercel.app](https://routewise-seven.vercel.app)

RouteWise is a full-stack web application designed to demonstrate advanced pathfinding and optimization algorithms (Dijkstra, A*, and Traveling Salesperson Problem heuristics) on real-world road networks. 

Built with a Node.js backend and a React/Leaflet frontend, the application provides an interactive, beautiful interface to visualize routing in multiple major global cities.

## Features

- **Real-World Graph Navigation**: Uses OpenStreetMap (OSM) data to construct authentic routing graphs, adhering strictly to real roads, one-ways, and natural boundaries.
- **Instant Multi-City Switching**: Pre-cached graphs for 5 major global downtown areas (New York, London, Tokyo, Seoul, Paris) allow instantaneous swapping between locations without slow on-the-fly downloads.
- **Shortest Path Algorithms**: Visualizes both Dijkstra and A* pathfinding. Watch the algorithms "think" by observing the explored node animations.
- **Route Optimization (TSP)**: Calculates the most efficient multi-stop route using Nearest Neighbor and 2-Opt optimization heuristics, including a dynamic benchmark comparison to exact Brute Force solutions.
- **Dynamic Snap-To-Road**: Intelligently snaps clicked coordinates to the nearest valid road node.

## Technology Stack

- **Frontend**: React, Vite, TailwindCSS, React-Leaflet, Lucide React
- **Backend**: Node.js, Express, Sequelize (SQLite), Axios
- **Data Source**: OpenStreetMap (Overpass API)

## Getting Started

### Prerequisites
- Node.js (v16+ recommended)
- npm or yarn

### Installation

1. Clone the repository
2. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```
3. Install backend dependencies:
   ```bash
   cd ../backend
   npm install
   ```

### Running the Application

You need two terminals to run the frontend and backend simultaneously.

**Terminal 1 (Backend)**:
```bash
cd backend
node index.js
```
*The backend runs on http://localhost:5000*

**Terminal 2 (Frontend)**:
```bash
cd frontend
npm run dev
```
*The frontend will run on the port specified by Vite (usually http://localhost:5173).*

## How It Works

1. **Graph Construction**: The backend parses OSM JSON elements, calculates Haversine distances for road segments, and builds an adjacency list representation of the city's road network.
2. **Pathfinding**: 
   - **Dijkstra**: Expands uniformly in all directions, exploring nodes until it finds the destination. Guaranteed shortest path.
   - **A***: Uses a Haversine distance heuristic to guide the search direction, exploring significantly fewer nodes than Dijkstra.
3. **TSP Optimization**: When multiple stops are added, the backend calculates all-pairs shortest paths, runs Nearest Neighbor to find a fast approximate route, and refines it with 2-Opt local search to prevent crossing paths.
