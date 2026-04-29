import { useState, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Polyline, CircleMarker, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, List, Map as MapIcon, Filter, X, Zap, MapPin, Clock, CalendarCheck, Activity, Navigation, AlertTriangle } from 'lucide-react';
import { getStatusColor, getDistance } from '../../utils/helpers';
import { generateNearbyStations } from '../../utils/generateStations';
import { getTrafficColor } from '../../services/tomtomRouting';
import StationDetail from '../station/StationDetail';
import BookingCountdown from './BookingCountdown';
import DrivingMode from './DrivingMode';
import './MapFinder.css';

/* ── Marker Factories ─────────────────────────────────────── */
function createMarkerIcon(color, slots) {
  return L.divIcon({
    className: 'station-marker',
    html: `<div class="marker-pin" style="background:${color}"><span class="marker-slots">${slots}</span></div>`,
    iconSize: [36, 44], iconAnchor: [18, 44], popupAnchor: [0, -44],
  });
}

function createUserIcon(battery) {
  const col = battery > 60 ? '#30D158' : battery > 25 ? '#FF9F0A' : '#FF453A';
  const circ = 2 * Math.PI * 18;
  const off = circ - (battery / 100) * circ;
  return L.divIcon({
    className: 'user-location-marker',
    html: `<div class="user-marker-container">
      <div class="user-marker-pulse"></div>
      <svg class="user-battery-ring" width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="18" fill="none" stroke="rgba(0,0,0,0.08)" stroke-width="3.5"/>
        <circle cx="24" cy="24" r="18" fill="none" stroke="${col}" stroke-width="3.5"
          stroke-dasharray="${circ}" stroke-dashoffset="${off}"
          stroke-linecap="round" transform="rotate(-90 24 24)"/>
      </svg>
      <div class="user-marker-dot"><span class="user-battery-text">${battery}%</span></div>
    </div>`,
    iconSize: [48, 48], iconAnchor: [24, 24], popupAnchor: [0, -28],
  });
}

function createTollIcon() {
  return L.divIcon({
    className: '',
    html: `<div class="toll-marker">₹ Toll</div>`,
    iconSize: [52, 24], iconAnchor: [26, 12],
  });
}

/* ── Map Utilities ─────────────────────────────────────────── */
function LocateButton({ onLocate }) {
  const map = useMap();
  return (
    <button className="locate-btn btn btn-glass" title="Locate Me" id="locate-me-btn"
      onClick={() => navigator.geolocation?.getCurrentPosition(
        p => { map.flyTo([p.coords.latitude, p.coords.longitude], 14); onLocate([p.coords.latitude, p.coords.longitude]); },
        () => map.flyTo([31.634, 74.872], 13)
      )}>
      <Crosshair size={18} />
    </button>
  );
}

function MapCenterUpdater({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.flyTo(center, 14, { duration: 1.5 }); }, [center, map]);
  return null;
}

function FitRouteBounds({ points }) {
  const map = useMap();
  useEffect(() => {
    if (points?.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 16, animate: true });
  }, [points, map]);
  return null;
}

/* ── Route Polyline (Dynamic Pathfinding + Traffic Colors) ─── */
function RoutePolyline({ routeData, active, dimmed }) {
  if (!routeData?.routePoints?.length) return null;
  const { routePoints, trafficSections } = routeData;
  const opacity = dimmed ? 0.35 : 1;
  const weight = active ? 7 : 5;

  return (
    <>
      {/* Shadow */}
      <Polyline positions={routePoints} pathOptions={{ color: 'rgba(0,0,0,0.15)', weight: weight + 4, lineCap: 'round', lineJoin: 'round', opacity }} />

      {/* Base route color */}
      <Polyline positions={routePoints} pathOptions={{ color: active ? '#0071E3' : '#6E6E73', weight, opacity, lineCap: 'round', lineJoin: 'round' }} />

      {/* Traffic-colored sections */}
      {trafficSections?.map((sec, i) => {
        const start = Math.max(0, sec.startPointIndex);
        const end = Math.min(routePoints.length - 1, sec.endPointIndex);
        const pts = routePoints.slice(start, end + 1);
        if (pts.length < 2) return null;
        const color = getTrafficColor(sec.simpleCategory, sec.magnitudeOfDelay);
        if (color === '#30D158') return null; // skip green (free flow)
        return (
          <Polyline key={i} positions={pts}
            pathOptions={{ color, weight, opacity, lineCap: 'round', lineJoin: 'round' }} />
        );
      })}

      {/* Animated white dash overlay */}
      {active && (
        <Polyline positions={routePoints}
          pathOptions={{ color: 'rgba(255,255,255,0.5)', weight: 2, dashArray: '10,14', lineCap: 'round', className: 'route-dash-anim', opacity }} />
      )}
    </>
  );
}

/* ── Toll Markers ──────────────────────────────────────────── */
function TollMarkers({ routeData }) {
  if (!routeData?.tollSections?.length) return null;
  const { routePoints, tollSections } = routeData;
  return tollSections.map((sec, i) => {
    const idx = Math.min(sec.midPointIndex, routePoints.length - 1);
    const pt = routePoints[idx];
    if (!pt) return null;
    return <Marker key={i} position={pt} icon={createTollIcon()} />;
  });
}

/* ── Main Component ────────────────────────────────────────── */
export default function StationMap() {
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [showList, setShowList] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [userLocation, setUserLocation] = useState([31.634, 74.872]);
  const [userLocated, setUserLocated] = useState(false);
  const [batteryLevel] = useState(() => Math.floor(Math.random() * 60) + 20);
  const [filters, setFilters] = useState({ chargerType: 'all', vehicleType: 'all', speed: 'all', amenities: [] });

  // Route state — fastest + shortest
  const [fastestRoute, setFastestRoute] = useState(null);
  const [shortestRoute, setShortestRoute] = useState(null);
  const [activeRouteType, setActiveRouteType] = useState('fastest'); // 'fastest' | 'shortest'
  const [routeTarget, setRouteTarget] = useState(null); // station being navigated to

  // Driving mode
  const [drivingMode, setDrivingMode] = useState(false);

  const generateStations = useCallback((lat, lng) => {
    setStations(generateNearbyStations(lat, lng, 15));
  }, []);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      p => { setUserLocation([p.coords.latitude, p.coords.longitude]); setUserLocated(true); generateStations(p.coords.latitude, p.coords.longitude); },
      () => { setUserLocated(true); generateStations(31.634, 74.872); }
    );
  }, [generateStations]);

  useEffect(() => {
    const t = setInterval(() => setStations(prev => prev.map(s => {
      const d = Math.random() > 0.7 ? (Math.random() > 0.5 ? 1 : -1) : 0;
      const n = Math.max(0, Math.min(s.totalSlots, s.availableSlots + d));
      return { ...s, availableSlots: n, status: n === 0 ? 'full' : n <= 1 ? 'limited' : 'available' };
    })), 15000);
    return () => clearInterval(t);
  }, []);

  const filteredStations = stations.filter(s => {
    if (filters.chargerType !== 'all' && !s.chargerTypes.includes(filters.chargerType)) return false;
    if (filters.vehicleType !== 'all' && !s.vehicleTypes.includes(filters.vehicleType)) return false;
    if (filters.speed !== 'all' && s.speed !== filters.speed) return false;
    return true;
  });

  // Called by StationDetail when routes are ready
  const handleRoutesReady = useCallback((station, routes) => {
    setFastestRoute(routes.fastest);
    setShortestRoute(routes.shortest);
    setRouteTarget(station);
    setActiveRouteType('fastest');
    setSelectedStation(null); // close panel — route shows on map
  }, []);

  // Start driving mode with the chosen route
  const handleStartDriving = useCallback(() => {
    setDrivingMode(true);
    setShowFilters(false);
  }, []);

  const handleStopDriving = useCallback(() => {
    setDrivingMode(false);
  }, []);

  const handleClearRoute = useCallback(() => {
    setFastestRoute(null);
    setShortestRoute(null);
    setRouteTarget(null);
    setDrivingMode(false);
  }, []);

  const handleInstantBook = () => {
    const s = filteredStations.filter(s => s.availableSlots > 0)
      .sort((a, b) => parseFloat(getDistance(userLocation[0], userLocation[1], a.lat, a.lng)) - parseFloat(getDistance(userLocation[0], userLocation[1], b.lat, b.lng)));
    if (s.length > 0) setSelectedStation(s[0]);
  };

  const activeRoute = activeRouteType === 'fastest' ? fastestRoute : shortestRoute;
  const hasRoute = !!(fastestRoute || shortestRoute);

  return (
    <div className="map-finder" id="map-finder">
      {/* Filter Sidebar */}
      {!drivingMode && (
        <div className={`filter-sidebar ${showFilters ? 'open' : ''}`}>
          <div className="filter-header">
            <h4>Filters</h4>
            <button className="btn btn-icon filter-close" onClick={() => setShowFilters(false)}><X size={18} /></button>
          </div>
          <div className="filter-group">
            <label className="filter-label">Charger Type</label>
            <select value={filters.chargerType} onChange={e => setFilters(f => ({ ...f, chargerType: e.target.value }))} className="input-glass" id="filter-charger-type">
              <option value="all">All Types</option>
              <option value="CCS2">CCS2</option>
              <option value="Type 2">Type 2</option>
              <option value="CHAdeMO">CHAdeMO</option>
              <option value="GB/T">GB/T</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Vehicle Type</label>
            <select value={filters.vehicleType} onChange={e => setFilters(f => ({ ...f, vehicleType: e.target.value }))} className="input-glass" id="filter-vehicle-type">
              <option value="all">All Vehicles</option>
              <option value="2-wheeler">2-Wheeler</option>
              <option value="4-wheeler">4-Wheeler</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Speed</label>
            <select value={filters.speed} onChange={e => setFilters(f => ({ ...f, speed: e.target.value }))} className="input-glass" id="filter-speed">
              <option value="any">Any Speed</option>
              <option value="Fast">Fast Charging</option>
              <option value="Slow">Slow Charging</option>
            </select>
          </div>
          <div className="filter-group">
            <label className="filter-label">Amenities</label>
            <div className="amenity-tags">
              {['Restroom', 'Cafe', 'WiFi', 'Parking', 'Lounge', 'Kids Area'].map(a => (
                <button key={a} className={`amenity-tag ${filters.amenities.includes(a) ? 'active' : ''}`}
                  onClick={() => setFilters(f => ({ ...f, amenities: f.amenities.includes(a) ? f.amenities.filter(x => x !== a) : [...f.amenities, a] }))}>
                  {a}
                </button>
              ))}
            </div>
          </div>
          <div className="filter-count">Showing {filteredStations.length} of {stations.length} stations</div>
        </div>
      )}

      {/* Map Area */}
      <div className="map-area">
        {!drivingMode && <BookingCountdown stations={stations} userLocation={userLocation} onRoutesReady={handleRoutesReady} />}
        {!drivingMode && (
          <div className="map-controls">
            <button className={`btn btn-glass btn-sm ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)}><Filter size={15} /> Filters</button>
            <button className={`btn btn-glass btn-sm ${showList ? 'active' : ''}`} onClick={() => setShowList(!showList)}>
              {showList ? <MapIcon size={15} /> : <List size={15} />} {showList ? 'Map View' : 'List View'}
            </button>
          </div>
        )}

        {/* Route Selector Bar */}
        {hasRoute && !drivingMode && (
          <div className="route-selector-bar" id="route-selector-bar">
            <div className="route-selector-tabs">
              <button
                className={`route-tab ${activeRouteType === 'fastest' ? 'active' : ''}`}
                onClick={() => setActiveRouteType('fastest')}
              >
                <span className="route-tab-icon">⚡</span>
                <span className="route-tab-label">Fastest</span>
                {fastestRoute && <span className="route-tab-meta">{fastestRoute.travelTimeMin} min · {fastestRoute.distanceKm} km</span>}
              </button>
              <button
                className={`route-tab ${activeRouteType === 'shortest' ? 'active' : ''}`}
                onClick={() => setActiveRouteType('shortest')}
              >
                <span className="route-tab-icon">🔋</span>
                <span className="route-tab-label">Battery Saver</span>
                {shortestRoute && <span className="route-tab-meta">{shortestRoute.travelTimeMin} min · {shortestRoute.distanceKm} km</span>}
              </button>
            </div>
            <div className="route-selector-actions">
              {activeRoute?.trafficDelaySeconds > 30 && (
                <span className="route-traffic-chip">
                  🚦 +{activeRoute.trafficDelayMin} min traffic
                </span>
              )}
              {activeRoute?.tollSections?.length > 0 && (
                <span className="route-toll-chip">₹ Toll road</span>
              )}
              <button className="btn btn-primary btn-sm route-drive-btn" onClick={handleStartDriving} id="start-drive-btn">
                <Navigation size={14} /> Start
              </button>
              <button className="btn btn-glass btn-sm" onClick={handleClearRoute}><X size={14} /></button>
            </div>
          </div>
        )}

        {/* Traffic Legend */}
        {hasRoute && !drivingMode && (
          <div className="traffic-legend">
            <span className="legend-item"><span className="legend-dot" style={{ background: '#30D158' }} />Free</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#FF9F0A' }} />Moderate</span>
            <span className="legend-item"><span className="legend-dot" style={{ background: '#FF453A' }} />Jam</span>
            {activeRoute?.tollSections?.length > 0 && <span className="legend-item"><span className="legend-toll">₹</span>Toll</span>}
          </div>
        )}

        {!showList ? (
          <MapContainer center={[31.634, 74.872]} zoom={13} style={{ height: '100%', width: '100%' }} zoomControl={!drivingMode}>
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; OpenStreetMap' />
            <MapCenterUpdater center={!hasRoute && userLocated ? userLocation : null} />
            <LocateButton onLocate={loc => { setUserLocation(loc); setUserLocated(true); generateStations(loc[0], loc[1]); }} />

            {/* Fit map to active route */}
            {activeRoute && <FitRouteBounds points={activeRoute.routePoints} />}

            {/* Fastest route */}
            {fastestRoute && (
              <RoutePolyline routeData={fastestRoute} active={activeRouteType === 'fastest'} dimmed={activeRouteType !== 'fastest'} />
            )}
            {/* Shortest route */}
            {shortestRoute && (
              <RoutePolyline routeData={shortestRoute} active={activeRouteType === 'shortest'} dimmed={activeRouteType !== 'shortest'} />
            )}

            {/* Toll markers on active route */}
            {activeRoute && <TollMarkers routeData={activeRoute} />}

            {/* User marker */}
            {userLocated && (
              <Marker position={userLocation} icon={createUserIcon(batteryLevel)} zIndexOffset={1000}>
                <Popup className="station-popup">
                  <div className="popup-content">
                    <strong>📍 Your Location</strong>
                    <div className="popup-meta" style={{ marginTop: 6 }}>
                      <span className={`badge badge-${batteryLevel > 60 ? 'success' : batteryLevel > 25 ? 'warning' : 'danger'}`}>
                        🔋 {batteryLevel}%
                      </span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )}

            {/* Destination marker when route active */}
            {routeTarget && (
              <CircleMarker center={[routeTarget.lat, routeTarget.lng]} radius={14}
                pathOptions={{ color: '#30D158', fillColor: '#30D158', fillOpacity: 0.25, weight: 3 }}>
                <Popup><div className="popup-content"><strong>⚡ {routeTarget.name}</strong></div></Popup>
              </CircleMarker>
            )}

            {/* Station markers */}
            {filteredStations.map(station => {
              const dist = getDistance(userLocation[0], userLocation[1], station.lat, station.lng);
              return (
                <Marker key={station._id} position={[station.lat, station.lng]}
                  icon={createMarkerIcon(getStatusColor(station), station.availableSlots)}
                  eventHandlers={{ click: () => setSelectedStation(station) }}>
                  <Tooltip direction="top" offset={[0, -44]} className="station-tooltip" interactive sticky={false}>
                    <div className="tooltip-content">
                      <strong className="tooltip-name">{station.name}</strong>
                      <div className="tooltip-info">
                        <span className={`tooltip-slots ${station.availableSlots === 0 ? 'full' : station.availableSlots <= 1 ? 'limited' : 'available'}`}>
                          {station.availableSlots}/{station.totalSlots} slots
                        </span>
                        <span className="tooltip-dist">{dist} km</span>
                      </div>
                    </div>
                  </Tooltip>
                  <Popup className="station-popup">
                    <div className="popup-content">
                      <strong>{station.name}</strong>
                      <div className="popup-meta">
                        <span className={`badge badge-${station.availableSlots === 0 ? 'danger' : station.availableSlots <= 1 ? 'warning' : 'success'}`}>
                          {station.availableSlots}/{station.totalSlots}
                        </span>
                        <span>{dist} km</span>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        ) : (
          <div className="list-view">
            {filteredStations.sort((a, b) =>
              parseFloat(getDistance(userLocation[0], userLocation[1], a.lat, a.lng)) -
              parseFloat(getDistance(userLocation[0], userLocation[1], b.lat, b.lng))
            ).map(station => (
              <div key={station._id} className="glass-card list-card" onClick={() => setSelectedStation(station)}>
                <div className="list-card-left"><img src={station.image} alt={station.name} className="list-card-img" /></div>
                <div className="list-card-info">
                  <h4>{station.name}</h4>
                  <p className="text-secondary">{station.address}</p>
                  <div className="list-card-meta">
                    <span className={`badge badge-${station.availableSlots === 0 ? 'danger' : station.availableSlots <= 1 ? 'warning' : 'success'}`}>
                      {station.availableSlots}/{station.totalSlots}
                    </span>
                    <span className="badge badge-accent">{station.speed}</span>
                    <span className="list-distance">{getDistance(userLocation[0], userLocation[1], station.lat, station.lng)} km</span>
                  </div>
                  <div className="list-card-types">{station.chargerTypes.map(t => <span key={t} className="charger-type-tag">{t}</span>)}</div>
                </div>
                <div className="list-card-price">
                  <span className="price-value">₹{station.pricePerKwh}</span>
                  <span className="price-unit">/kWh</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bottom panel */}
        {!drivingMode && !hasRoute && (
          <div className="instant-booking-panel" id="instant-booking-panel">
            <div className="instant-booking-features">
              <div className="instant-feature"><div className="instant-feature-icon"><MapPin size={16} /></div><span>Locate nearby stations</span></div>
              <div className="instant-feature-divider" />
              <div className="instant-feature"><div className="instant-feature-icon live"><Clock size={16} /></div><span>Real-time availability</span></div>
              <div className="instant-feature-divider" />
              <div className="instant-feature"><div className="instant-feature-icon"><CalendarCheck size={16} /></div><span>Book & pre-book slots</span></div>
              <div className="instant-feature-divider" />
              <div className="instant-feature"><div className="instant-feature-icon"><Activity size={16} /></div><span>Live traffic updates</span></div>
            </div>
            <button className="btn btn-primary instant-book-btn" id="instant-book-btn" onClick={handleInstantBook}>
              <Zap size={18} /> Instant Book Nearest Station
            </button>
          </div>
        )}
      </div>

      {/* Station Detail Panel */}
      {selectedStation && (
        <StationDetail
          station={selectedStation}
          userLocation={userLocation}
          batteryLevel={batteryLevel}
          onClose={() => setSelectedStation(null)}
          onRoutesReady={handleRoutesReady}
        />
      )}

      {/* Driving Mode */}
      {drivingMode && activeRoute && routeTarget && (
        <DrivingMode
          routeData={activeRoute}
          routeType={activeRouteType}
          station={routeTarget}
          batteryLevel={batteryLevel}
          userLocation={userLocation}
          onStop={handleStopDriving}
          onUpdatePosition={setUserLocation}
        />
      )}

    </div>
  );
}
