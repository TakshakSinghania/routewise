import React from 'react';
import { Play, Settings2, Trash2, Crosshair, Route as RouteIcon, Activity, Clock, Navigation2 } from 'lucide-react';

// Animated Counter Component
function AnimatedCounter({ from, to, duration = 1, decimals = 0 }) {
  const [current, setCurrent] = React.useState(from);
  
  React.useEffect(() => {
    let startTime = null;
    let animationFrame;
    
    const animate = (timestamp) => {
      if (!startTime) startTime = timestamp;
      const progress = Math.min((timestamp - startTime) / (duration * 1000), 1);
      // easeOutExpo
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      const val = from + (to - from) * ease;
      
      setCurrent(val);
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };
    
    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [from, to, duration]);

  return <span>{current.toFixed(decimals)}</span>;
}

export default function Controls({ 
  stops, 
  algorithm, 
  setAlgorithm, 
  onClear, 
  onRunPathfinding, 
  onRunTSP, 
  onRunBenchmark, 
  results,
  isLoading,
  onCityChange
}) {
  const [selectedCity, setSelectedCity] = React.useState("new_york");

  const handleCitySelect = (e) => {
    const cityId = e.target.value;
    setSelectedCity(cityId);
    onCityChange(cityId);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-200">
      <div className="p-6 flex-1 overflow-y-auto">
        <h2 className="text-sm font-display font-bold tracking-widest text-slate-500 uppercase mb-6">Optimization Engine</h2>
        
        {/* Location Selector */}
        <div className="mb-8">
          <label className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider mb-3 block">Supported Area</label>
          <div className="relative">
            <select
              value={selectedCity}
              onChange={handleCitySelect}
              disabled={isLoading}
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-3 text-sm text-white font-medium focus:outline-none focus:border-teal-500 disabled:opacity-50 appearance-none cursor-pointer"
            >
              <option value="new_york">New York, USA</option>
              <option value="london">London, UK</option>
              <option value="tokyo">Tokyo, Japan</option>
              <option value="seoul">Seoul, South Korea</option>
              <option value="paris">Paris, France</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-400">
              <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
            </div>
          </div>
        </div>

        {/* State Overview */}
        <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/50 border border-slate-700/50 mb-8 transition-all hover:bg-slate-800 hover:border-slate-600">
          <div className="w-10 h-10 rounded-full bg-teal-500/10 flex items-center justify-center text-teal-400">
            <Crosshair size={20} />
          </div>
          <div>
            <div className="text-2xl font-bold text-white">{stops.length}</div>
            <div className="text-xs text-slate-400 font-medium uppercase tracking-wider">Active Stops</div>
          </div>
        </div>

        {/* Algorithm Selection */}
        <div className="mb-8">
          <label className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider mb-3 block flex items-center justify-between">
            Pathfinding Algorithm
            {algorithm === 'A*' && <span className="text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">Heuristic Guided</span>}
            {algorithm === 'Dijkstra' && <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded">Uniform Cost</span>}
          </label>
          <div className="flex bg-slate-800 p-1 rounded-lg">
            {['Dijkstra', 'A*'].map((alg) => (
              <button
                key={alg}
                onClick={() => setAlgorithm(alg)}
                className={`flex-1 py-2 px-4 text-sm font-medium rounded-md transition-all duration-300 ${
                  algorithm === alg 
                    ? 'bg-teal-500 text-slate-900 shadow-[0_4px_15px_-3px_rgba(45,212,191,0.4)]' 
                    : 'text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {alg}
              </button>
            ))}
          </div>
          <button 
            onClick={onRunPathfinding}
            disabled={isLoading || stops.length < 2}
            className="w-full mt-3 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2 transition-all border border-slate-600"
          >
            <Play size={16} className={algorithm === 'A*' ? 'text-amber-400' : 'text-teal-400'} />
            Compute Shortest Path
          </button>
        </div>

        {/* Route Optimization (TSP) */}
        <div className="mb-8">
          <label className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider mb-3 block">Global Optimization (TSP)</label>
          <button 
            onClick={onRunTSP}
            disabled={isLoading || stops.length < 3}
            className="w-full py-3 rounded-lg bg-teal-500 hover:bg-teal-400 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed text-slate-900 font-bold flex items-center justify-center gap-2 transition-all shadow-[0_0_20px_-5px_rgba(45,212,191,0.4)] hover:shadow-[0_0_30px_-5px_rgba(45,212,191,0.6)]"
          >
            <RouteIcon size={18} />
            Optimize Route (2-opt)
          </button>
          <p className="text-xs text-slate-500 mt-3 text-center">Requires at least 3 stops</p>
        </div>

        {/* Benchmarking */}
        <div className="mb-8">
          <label className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider mb-3 block">Performance Test</label>
          <button 
            onClick={onRunBenchmark}
            disabled={isLoading || stops.length < 3 || stops.length > 10}
            className="w-full py-3 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 hover:-translate-y-0.5 disabled:translate-y-0 text-amber-400 border border-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2 transition-all"
          >
            <Settings2 size={16} />
            Run Benchmark
          </button>
        </div>

        {/* Action Bar */}
        <div className="pt-6 border-t border-slate-800">
          <button 
            onClick={onClear}
            className="w-full py-3 rounded-lg bg-transparent hover:bg-red-500/10 text-slate-400 hover:text-red-400 font-medium flex items-center justify-center gap-2 transition-colors border border-transparent hover:border-red-500/20"
          >
            <Trash2 size={16} />
            Clear All Data
          </button>
        </div>
      </div>

      {/* Results Panel */}
      {results && (
        <div className="bg-slate-800 p-6 border-t border-slate-700 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.5)] transform transition-transform animate-in slide-in-from-bottom-5">
          <h3 className="text-xs font-display font-bold text-teal-400 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Activity size={14} className="text-teal-400" />
            Computation Results
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Navigation2 size={12}/> Distance</div>
              <div className="text-lg font-bold text-white">
                <AnimatedCounter from={0} to={results.distance / 1000} decimals={2} /> <span className="text-sm text-slate-500 font-normal">km</span>
              </div>
            </div>
            <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50">
              <div className="text-xs text-slate-400 mb-1 flex items-center gap-1"><Clock size={12}/> Compute Time</div>
              <div className="text-lg font-bold text-white">
                <AnimatedCounter from={0} to={results.timeMs} decimals={1} /> <span className="text-sm text-slate-500 font-normal">ms</span>
              </div>
            </div>
            {results.nodesVisited !== undefined && (
              <div className="col-span-2 mt-2 p-3 bg-slate-900 rounded-lg border border-slate-700 flex justify-between items-center transition-colors hover:border-amber-500/30 hover:bg-amber-500/5">
                <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Nodes Explored</span>
                <span className="text-sm font-bold text-amber-400">
                  <AnimatedCounter from={0} to={results.nodesVisited} decimals={0} />
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
