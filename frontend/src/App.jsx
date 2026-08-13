import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Map from './components/Map';
import Controls from './components/Controls';
import BenchmarkChart from './components/BenchmarkChart';
import LandingPage from './components/LandingPage';
import { getShortestPath, getOptimizedRoute, runBenchmark, snapCoordinate, setCity } from './api/client';
import { Route as RouteIcon, Code } from 'lucide-react';

export default function App() {
  const [appStarted, setAppStarted] = useState(false);
  const [stops, setStops] = useState([]);
  const [algorithm, setAlgorithm] = useState('Dijkstra');
  const [route, setRoute] = useState(null);
  const [exploredNodes, setExploredNodes] = useState(null);
  const [optimizationSteps, setOptimizationSteps] = useState(null);
  const [results, setResults] = useState(null);
  const [benchmarkData, setBenchmarkData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [computingState, setComputingState] = useState('');
  const [isSnapping, setIsSnapping] = useState(false);
  const [position, setPosition] = useState([40.715, -74.005]);
  const [bounds, setBounds] = useState([[40.705, -74.015], [40.725, -73.995]]);
  const [locationName, setLocationName] = useState("New York");

  const handleCityChange = async (cityId) => {
    setIsLoading(true);
    setComputingState('Switching city...');
    try {
      const data = await setCity(cityId);
      setPosition(data.center);
      setBounds(data.bounds);
      setLocationName(data.name);
      handleClear();
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.error || 'Error switching city.');
    } finally {
      setIsLoading(false);
      setComputingState('');
    }
  };

  const handleAddStop = async (latlng) => {
    setIsSnapping(true);
    setComputingState('Snapping to road network...');
    try {
      const snapped = await snapCoordinate(latlng);
      setStops(prev => [...prev, snapped]);
      setRoute(null);
      setExploredNodes(null);
      setOptimizationSteps(null);
      setResults(null);
    } catch (error) {
      console.error("Failed to snap coordinate", error);
      alert(error.response?.data?.error || "Failed to snap coordinate. Ensure you clicked within the supported area.");
    } finally {
      setIsSnapping(false);
      setComputingState('');
    }
  };

  const handleClear = () => {
    setStops([]);
    setRoute(null);
    setExploredNodes(null);
    setOptimizationSteps(null);
    setResults(null);
    setBenchmarkData(null);
  };

  const handleRunPathfinding = async () => {
    if (stops.length < 2) return;
    setIsLoading(true);
    setComputingState(`Running ${algorithm}...`);
    try {
      let combinedPath = [];
      let combinedExplored = [];
      let totalTimeMs = 0;
      let totalDistance = 0;
      let totalNodesVisited = 0;

      for (let i = 0; i < stops.length - 1; i++) {
        const start = stops[i];
        const end = stops[i + 1];
        
        const data = await getShortestPath(start, end, algorithm);
        
        if (i < stops.length - 2) {
          combinedPath = combinedPath.concat(data.path.slice(0, -1));
        } else {
          combinedPath = combinedPath.concat(data.path);
        }
        
        combinedExplored = combinedExplored.concat(data.exploredNodes || []);
        totalTimeMs += data.timeMs;
        totalDistance += data.distance;
        totalNodesVisited += data.nodesVisited;
      }
      
      setExploredNodes(combinedExplored);
      setRoute(combinedPath);
      setResults({ timeMs: totalTimeMs, distance: totalDistance, nodesVisited: totalNodesVisited });
    } catch (error) {
      console.error(error);
      alert('Error running pathfinding');
    } finally {
      setIsLoading(false);
      setComputingState('');
    }
  };

  const handleRunTSP = async () => {
    if (stops.length < 3) return;
    setIsLoading(true);
    setComputingState('Running TSP Optimization...');
    try {
      const data = await getOptimizedRoute(stops);
      setOptimizationSteps(data.optimizationSteps || []);
      setRoute(data.route);
      setResults({ timeMs: data.timeMs, distance: data.distance });
    } catch (error) {
      console.error(error);
      alert('Error running TSP optimization');
    } finally {
      setIsLoading(false);
      setComputingState('');
    }
  };

  const handleRunBenchmark = async () => {
    if (stops.length < 3 || stops.length > 10) return;
    setIsLoading(true);
    setComputingState('Running Benchmarks...');
    try {
      const data = await runBenchmark(stops);
      setBenchmarkData(data);
    } catch (error) {
      console.error(error);
      alert(error.response?.data?.error || 'Error running benchmark');
    } finally {
      setIsLoading(false);
      setComputingState('');
    }
  };

  if (!appStarted) {
    return <LandingPage onStart={() => setAppStarted(true)} />;
  }

  return (
    <div className="flex flex-col h-screen w-full bg-slate-900 text-slate-100 font-body overflow-hidden">
      {/* Premium Header */}
      <header className="flex-none bg-slate-900/80 backdrop-blur-md border-b border-slate-800 px-6 py-4 flex justify-between items-center z-50">
        <div className="flex items-center gap-2 text-xl font-display font-bold tracking-tight cursor-pointer" onClick={() => setAppStarted(false)}>
          <RouteIcon className="text-teal-400" size={24} />
          <span>Route<span className="text-teal-400">Wise</span></span>
        </div>
        <div className="flex gap-4">
          <a href="https://github.com" target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors">
            <Code size={16} /> Source
          </a>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative w-full h-full flex flex-row overflow-hidden">
        
        {/* Map Container - fills available space */}
        <div className="flex-1 relative h-full w-full z-10">
          <Map 
            stops={stops} 
            route={route} 
            exploredNodes={exploredNodes}
            optimizationSteps={optimizationSteps}
            algorithm={algorithm}
            onAddStop={handleAddStop}
            position={position}
            bounds={bounds}
            locationName={locationName}
          />

          {/* Algorithm Thinking Overlay */}
          <AnimatePresence>
            {(isLoading || isSnapping) && (
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute top-8 left-1/2 -translate-x-1/2 z-[1000] bg-slate-800/90 backdrop-blur-lg border border-teal-500/30 px-6 py-3 rounded-full shadow-[0_0_30px_-5px_rgba(45,212,191,0.4)] flex items-center gap-3"
              >
                <div className="w-4 h-4 rounded-full border-2 border-teal-400 border-t-transparent animate-spin" />
                <span className="font-medium text-teal-400 text-sm tracking-wide">{computingState}</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Floating / Docked Sidebar for Controls */}
        <div className="w-80 h-full flex-none bg-slate-900 border-l border-slate-800 overflow-y-auto custom-scrollbar z-20 shadow-2xl relative">
          <Controls 
            stops={stops}
            algorithm={algorithm}
            setAlgorithm={setAlgorithm}
            onClear={handleClear}
            onRunPathfinding={handleRunPathfinding}
            onRunTSP={handleRunTSP}
            onRunBenchmark={handleRunBenchmark}
            results={results}
            isLoading={isLoading}
            onCityChange={handleCityChange}
          />
          {benchmarkData && (
            <div className="p-4 border-t border-slate-800">
              <BenchmarkChart data={benchmarkData} />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
