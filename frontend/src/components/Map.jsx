import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, useMapEvents, Tooltip, useMap, CircleMarker, Rectangle } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

const MapEvents = ({ onAddStop }) => {
  useMapEvents({
    click(e) {
      onAddStop({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
};

const MapInvalidator = () => {
  const map = useMap();
  useEffect(() => {
    const timeout = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timeout);
  }, [map]);
  return null;
};

const MapLocationUpdater = ({ position, bounds }) => {
  const map = useMap();
  useEffect(() => {
    if (bounds) {
      map.flyToBounds(bounds, { duration: 2, padding: [20, 20] });
    } else if (position) {
      map.flyTo(position, 14, { duration: 2 });
    }
  }, [map, position, bounds]);
  return null;
};

export default function Map({ stops, route, exploredNodes, optimizationSteps, algorithm, onAddStop, position, bounds, locationName }) {
  // Visual States
  const [animatedPath, setAnimatedPath] = useState([]);
  const [animatedExplored, setAnimatedExplored] = useState([]);
  const [tspRoute, setTspRoute] = useState([]);
  const [currentDistance, setCurrentDistance] = useState(null);

  useEffect(() => {
    // RESET everything if inputs clear
    if (!route && !exploredNodes && !optimizationSteps) {
      setAnimatedPath([]);
      setAnimatedExplored([]);
      setTspRoute([]);
      setCurrentDistance(null);
      return;
    }
  }, [route, exploredNodes, optimizationSteps]);

  // Handle Dijkstra / A* Visualization Flow
  useEffect(() => {
    if (exploredNodes && exploredNodes.length > 0 && route) {
      setAnimatedPath([]);
      setAnimatedExplored([]);
      let exploredIdx = 0;
      
      const batchSize = Math.max(1, Math.floor(exploredNodes.length / 40)); 
      
      const exploreInterval = setInterval(() => {
        exploredIdx += batchSize;
        if (exploredIdx >= exploredNodes.length) {
          setAnimatedExplored(exploredNodes.map(p => [p.lat, p.lng]));
          clearInterval(exploreInterval);
          
          // Start drawing route after brief pause
          setTimeout(() => {
            drawFinalRoute(route);
          }, 400);
        } else {
          setAnimatedExplored(exploredNodes.slice(0, exploredIdx).map(p => [p.lat, p.lng]));
        }
      }, 20);

      return () => clearInterval(exploreInterval);
    }
  }, [exploredNodes, route]);

  // Handle TSP Visualization Flow
  useEffect(() => {
    if (optimizationSteps && optimizationSteps.length > 0 && route) {
      setAnimatedPath([]);
      setAnimatedExplored([]);
      setTspRoute([]);
      
      let stepIdx = 0;
      const stepInterval = setInterval(() => {
        if (stepIdx >= optimizationSteps.length) {
          clearInterval(stepInterval);
          setTspRoute([]); // Hide TSP intermediate steps
          drawFinalRoute(route); // Draw final smooth route
        } else {
          const step = optimizationSteps[stepIdx];
          setTspRoute(step.route.map(p => [p.lat, p.lng]));
          setCurrentDistance(step.distance);
          stepIdx++;
        }
      }, 300); // 300ms per swap

      return () => clearInterval(stepInterval);
    } else if (route && !exploredNodes && !optimizationSteps) {
      // Fallback if no visualization data
      drawFinalRoute(route);
    }
  }, [optimizationSteps, route, exploredNodes]);

  const drawFinalRoute = (fullRoute) => {
    let currentIdx = 0;
    const batchSize = Math.max(1, Math.floor(fullRoute.length / 50)); 
    const interval = setInterval(() => {
      currentIdx += batchSize;
      if (currentIdx >= fullRoute.length) {
        setAnimatedPath(fullRoute.map(p => [p.lat, p.lng]));
        clearInterval(interval);
      } else {
        setAnimatedPath(fullRoute.slice(0, currentIdx).map(p => [p.lat, p.lng]));
      }
    }, 20);
  };

  const createMarkerIcon = (index, totalStops) => {
    const isDepot = index === 0;
    const bgColor = isDepot ? '#10b981' : '#ef4444'; // Emerald for depot, Red for stops
    const size = isDepot ? 32 : 24;
    
    return L.divIcon({
      className: 'custom-div-icon',
      html: `
        <div class="animate-marker-snap" style="
          background-color: ${bgColor};
          width: ${size}px;
          height: ${size}px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3);
          color: white;
          font-weight: bold;
          font-size: ${isDepot ? '14px' : '12px'};
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
          ${isDepot ? '★' : index}
        </div>
      `,
      iconSize: [size, size],
      iconAnchor: [size/2, size/2],
      popupAnchor: [0, -size/2]
    });
  };

  // Determine colors based on algorithm
  const exploreColor = algorithm === 'A*' ? '#fbbf24' : '#6366f1'; // Amber for A*, Indigo for Dijkstra

  return (
    <div className="h-full w-full bg-slate-800 relative z-0">
      
      {/* Live Distance Overlay during TSP */}
      {currentDistance !== null && tspRoute.length > 0 && (
        <div className="absolute top-8 right-8 z-[1000] bg-slate-900/90 backdrop-blur-md border border-amber-500/30 px-6 py-4 rounded-2xl shadow-xl flex flex-col gap-1 items-end pointer-events-none transition-all">
          <span className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest">2-Opt Optimization</span>
          <span className="text-2xl font-bold text-amber-400">
            {(currentDistance / 1000).toFixed(2)} <span className="text-sm font-normal text-slate-300">km</span>
          </span>
        </div>
      )}

      <MapContainer 
        center={position} 
        zoom={14} 
        style={{ height: '100%', width: '100%' }}
        zoomControl={false}
      >
        <MapInvalidator />
        <MapLocationUpdater position={position} bounds={bounds} />
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        />

        {/* Valid routing area bounds */}
        <Rectangle 
          bounds={bounds}
          pathOptions={{ color: '#3b82f6', weight: 2, fillOpacity: 0.05, dashArray: '5, 10' }} 
        >
          <Tooltip direction="center" offset={[0, 0]} opacity={1} permanent={false}>
            Supported Routing Area ({locationName})
          </Tooltip>
        </Rectangle>

        <MapEvents onAddStop={onAddStop} />

        {/* Explored Nodes Frontier (Algorithm thinking visualization) */}
        {animatedExplored.map((pos, i) => (
          <CircleMarker
            key={i}
            center={pos}
            radius={3}
            pathOptions={{ 
              color: exploreColor, 
              fillColor: exploreColor, 
              fillOpacity: 0.4, 
              weight: 0 
            }}
          />
        ))}

        {/* TSP Optimization Intermediate Routes */}
        {tspRoute.length > 0 && (
          <Polyline 
            positions={tspRoute} 
            color="#f59e0b" // Amber
            weight={4} 
            opacity={0.6}
            dashArray="10, 10"
            lineCap="round" 
            lineJoin="round" 
          />
        )}
        
        {/* Route Shadow / Underlay for contrast */}
        {animatedPath.length > 0 && (
          <Polyline 
            positions={animatedPath} 
            color="#0f172a" 
            weight={12} 
            opacity={0.7}
            lineCap="round" 
            lineJoin="round" 
          />
        )}

        {/* Actual Route Polyline */}
        {animatedPath.length > 0 && (
          <Polyline 
            positions={animatedPath} 
            color="#2dd4bf" 
            weight={6} 
            lineCap="round" 
            lineJoin="round" 
            className="animate-pulse-slow drop-shadow-[0_0_10px_rgba(45,212,191,0.8)]"
          />
        )}

        {/* Directional Arrows */}
        {animatedPath.length > 1 && (() => {
          const arrows = [];
          const step = Math.max(4, Math.floor(animatedPath.length / 15));
          for (let i = step; i < animatedPath.length - 1; i += step) {
            const p1 = animatedPath[i];
            const p2 = animatedPath[i + 1];
            
            const lat1 = p1[0] * Math.PI / 180;
            const lon1 = p1[1] * Math.PI / 180;
            const lat2 = p2[0] * Math.PI / 180;
            const lon2 = p2[1] * Math.PI / 180;
            
            const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
            const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1);
            const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;

            const arrowIcon = L.divIcon({
              className: 'custom-arrow-icon',
              html: `
                <div style="transform: rotate(${bearing}deg); width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; opacity: 1; filter: drop-shadow(0px 2px 4px rgba(0,0,0,0.8));">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="#ffffff">
                    <path d="M12 0l12 18h-24z"/>
                  </svg>
                </div>
              `,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            });

            arrows.push(<Marker key={'arrow-'+i} position={p1} icon={arrowIcon} interactive={false} />);
          }
          return arrows;
        })()}

        {/* Render Stops */}
        {stops.map((stop, index) => (
          <Marker 
            key={index} 
            position={[stop.lat, stop.lng]}
            icon={createMarkerIcon(index, stops.length)}
          >
            <Tooltip direction="top" offset={[0, -16]} opacity={1} permanent={false}>
              <span className="font-bold font-body">
                {index === 0 ? "Depot (Start/End)" : `Stop ${index}`}
              </span>
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
