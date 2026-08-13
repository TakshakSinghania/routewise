import React from 'react';
import { motion } from 'framer-motion';
import { Map, ArrowRight, Route as RouteIcon, Code, BarChart2, CheckCircle2 } from 'lucide-react';

export default function LandingPage({ onStart }) {
  // SVG Path animation for right hero visualization
  const graphVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
  };

  const edgeVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { 
      pathLength: 1, 
      opacity: 0.2, 
      transition: { duration: 1.5, ease: "easeInOut" } 
    }
  };

  const exploreVariants = {
    hidden: { scale: 0, opacity: 0 },
    visible: { 
      scale: 1, 
      opacity: [0, 0.5, 0], 
      transition: { duration: 2, repeat: Infinity, repeatType: "loop", ease: "easeInOut" } 
    }
  };

  const finalRouteVariants = {
    hidden: { pathLength: 0, opacity: 0 },
    visible: { 
      pathLength: 1, 
      opacity: 1, 
      transition: { delay: 2, duration: 2, ease: "easeInOut", repeat: Infinity, repeatType: "loop", repeatDelay: 1 } 
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 overflow-x-hidden font-body relative flex flex-col">
      
      {/* Background Subtle Gradient Mesh */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 left-1/4 w-[40%] h-[40%] rounded-full bg-teal-500/5 blur-[120px]" />
        <div className="absolute top-[30%] right-[10%] w-[30%] h-[30%] rounded-full bg-indigo-500/5 blur-[100px]" />
      </div>

      {/* Navigation */}
      <nav className="w-full max-w-7xl mx-auto px-6 py-8 flex justify-between items-center z-10">
        <div className="flex items-center gap-2 text-2xl font-display font-bold tracking-tight">
          <RouteIcon className="text-teal-400" size={32} />
          <span>Route<span className="text-teal-400">Wise</span></span>
        </div>
        <div className="flex gap-8 text-sm font-medium text-slate-400 items-center">
          <a href="#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="#benchmarks" className="hover:text-white transition-colors">Benchmarks</a>
          <a href="https://github.com" target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:text-white transition-colors">
            <Code size={16} /> Source
          </a>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-6 flex flex-col lg:flex-row items-center justify-between gap-16 z-10 pt-16 pb-32">
        
        {/* Left Copy */}
        <div className="flex-1 flex flex-col items-start gap-8 max-w-xl">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          >
            <h1 className="text-5xl lg:text-7xl font-display font-bold leading-tight tracking-tight text-white mb-6">
              Smarter Routes.<br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-teal-400 to-emerald-400">Faster Decisions.</span>
            </h1>
            <p className="text-xl text-slate-400 font-light leading-relaxed">
              RouteWise combines Dijkstra, A*, and TSP optimization to calculate efficient delivery routes. Watch the algorithms think in real-time.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
            className="flex flex-wrap items-center gap-4 mt-4"
          >
            <button
              onClick={onStart}
              className="px-8 py-4 bg-teal-500 hover:bg-teal-400 text-slate-900 font-bold text-lg rounded-xl flex items-center gap-3 transition-all shadow-[0_0_30px_-5px_rgba(45,212,191,0.4)] hover:shadow-[0_0_40px_-5px_rgba(45,212,191,0.6)] hover:-translate-y-1"
            >
              Try RouteWise
              <Map size={20} />
            </button>
            <a 
              href="#how-it-works"
              className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-white font-medium text-lg rounded-xl flex items-center gap-3 transition-colors border border-slate-700"
            >
              See how it works
              <ArrowRight size={20} />
            </a>
          </motion.div>
        </div>

        {/* Right Interactive SVG Preview */}
        <div className="flex-1 w-full max-w-lg relative perspective-1000">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, rotateY: -10 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 1, delay: 0.3, type: "spring" }}
            className="w-full aspect-square bg-slate-800/40 backdrop-blur-2xl rounded-3xl border border-slate-700/50 shadow-2xl p-8 relative flex items-center justify-center overflow-hidden"
          >
            <svg viewBox="0 0 400 400" className="w-full h-full relative z-10">
              <motion.g variants={graphVariants} initial="hidden" animate="visible">
                {/* Background Grid Edges */}
                {[
                  "M 50 200 L 150 100", "M 150 100 L 250 150", "M 250 150 L 350 250",
                  "M 50 200 L 150 300", "M 150 300 L 250 250", "M 250 250 L 350 250",
                  "M 150 100 L 250 50", "M 250 50 L 350 150", "M 150 300 L 250 350",
                  "M 250 150 L 250 250"
                ].map((d, i) => (
                  <motion.path key={i} d={d} stroke="#475569" strokeWidth="2" variants={edgeVariants} />
                ))}

                {/* Explored Nodes (Algorithm Thinking) */}
                {[
                  {cx: 150, cy: 100}, {cx: 150, cy: 300}, {cx: 250, cy: 150}, {cx: 250, cy: 250}
                ].map((n, i) => (
                  <motion.circle key={`exp-${i}`} cx={n.cx} cy={n.cy} r="25" fill="#f59e0b" custom={i} variants={exploreVariants} />
                ))}

                {/* Final Optimized Route */}
                <motion.path
                  d="M 50 200 L 150 100 L 250 150 L 350 250"
                  fill="none"
                  stroke="#2dd4bf"
                  strokeWidth="6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  variants={finalRouteVariants}
                  style={{ filter: 'drop-shadow(0px 0px 8px rgba(45,212,191,0.8))' }}
                />

                {/* Depot Node */}
                <circle cx="50" cy="200" r="14" fill="#10b981" stroke="#0f172a" strokeWidth="4" />
                {/* Delivery Nodes */}
                <circle cx="150" cy="100" r="10" fill="#ef4444" stroke="#0f172a" strokeWidth="3" />
                <circle cx="250" cy="150" r="10" fill="#ef4444" stroke="#0f172a" strokeWidth="3" />
                <circle cx="350" cy="250" r="10" fill="#ef4444" stroke="#0f172a" strokeWidth="3" />
              </motion.g>
            </svg>
            
            {/* Overlay label */}
            <div className="absolute bottom-6 bg-slate-900/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-700 text-xs font-medium text-slate-300 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
              Algorithm Exploring...
            </div>
          </motion.div>
        </div>
      </main>

      {/* How It Works Section */}
      <section id="how-it-works" className="w-full bg-slate-950/50 py-32 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-20">
            <h2 className="text-3xl lg:text-5xl font-display font-bold text-white mb-6">Understanding the Engine</h2>
            <p className="text-slate-400 max-w-2xl mx-auto">Watch exactly how different algorithms navigate the mathematical graph representation of the physical road network.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-xl"
            >
              <div className="h-40 bg-slate-800/50 rounded-2xl mb-8 flex items-center justify-center relative overflow-hidden">
                <div className="absolute w-full h-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent opacity-50"></div>
                <div className="text-indigo-400 text-sm font-bold tracking-widest text-center">Explores radially based<br/>on accumulated distance</div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">Dijkstra's Algorithm</h3>
              <p className="text-slate-400 leading-relaxed">Guaranteed to find the absolute shortest path, but explores uniformly in all directions, making it computationally heavy for large maps.</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: 0.1 }}
              className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-xl"
            >
              <div className="h-40 bg-slate-800/50 rounded-2xl mb-8 flex items-center justify-center relative overflow-hidden">
                <div className="absolute w-full h-full bg-[radial-gradient(ellipse_at_right,_var(--tw-gradient-stops))] from-amber-500/20 via-transparent to-transparent opacity-50"></div>
                <div className="text-amber-400 text-sm font-bold tracking-widest text-center">Uses heuristic to prioritize<br/>promising directions</div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">A* Search</h3>
              <p className="text-slate-400 leading-relaxed">Uses a Haversine distance heuristic to guide the search aggressively toward the destination, massively reducing the number of nodes explored.</p>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ delay: 0.2 }}
              className="bg-slate-900 p-8 rounded-3xl border border-slate-800 shadow-xl"
            >
              <div className="h-40 bg-slate-800/50 rounded-2xl mb-8 flex items-center justify-center relative overflow-hidden">
                <div className="w-full flex items-center justify-center gap-4 opacity-70">
                  <span className="w-8 h-8 rounded-full border-2 border-teal-500 flex items-center justify-center text-xs">1</span>
                  <ArrowRight size={16} className="text-slate-500" />
                  <span className="w-8 h-8 rounded-full border-2 border-teal-500 flex items-center justify-center text-xs">2</span>
                  <ArrowRight size={16} className="text-slate-500" />
                  <span className="w-8 h-8 rounded-full border-2 border-teal-500 flex items-center justify-center text-xs">3</span>
                </div>
              </div>
              <h3 className="text-2xl font-bold text-white mb-4">TSP 2-Opt</h3>
              <p className="text-slate-400 leading-relaxed">Approximates the Traveling Salesperson Problem by constructing a greedy initial route, then iteratively uncrossing intersecting paths.</p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Benchmarks Preview */}
      <section id="benchmarks" className="w-full bg-slate-900 py-32">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl lg:text-5xl font-display font-bold text-white mb-6">Performance at Scale</h2>
          <p className="text-slate-400 mb-12">A* can explore fewer nodes because its heuristic guides the search toward the destination.</p>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-slate-800/50 border border-slate-700 rounded-3xl p-8"
          >
            <div className="flex items-center justify-center gap-4 text-slate-300 mb-8">
              <BarChart2 className="text-teal-400" />
              <span>Interactive Benchmarks available in the app</span>
            </div>
            
            <button
              onClick={onStart}
              className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors border border-slate-600 inline-flex items-center gap-2"
            >
              Run Benchmark Now <ArrowRight size={16} />
            </button>
          </motion.div>
        </div>
      </section>

    </div>
  );
}
