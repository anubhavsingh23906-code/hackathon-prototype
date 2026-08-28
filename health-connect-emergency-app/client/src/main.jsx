import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import axios from 'axios';
import { io } from 'socket.io-client';
import gsap from 'gsap';
import { Canvas, useFrame } from '@react-three/fiber';
import { Activity, Ambulance, Bell, Building2, CheckCircle2, Clock, Crosshair, Expand, Gauge, HeartPulse, Hospital, LogOut, MapPin, MapPinned, Navigation, PhoneCall, Radio, Route, ShieldCheck, Siren, Sparkles, Stethoscope, UserRound, X, Zap } from 'lucide-react';
import { MapContainer, Marker, Polyline, TileLayer, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const API = import.meta.env.VITE_API_URL || 'http://localhost:8080';
const priorities = ['Critical', 'Moderate', 'Normal'];
const emergencyTypes = ['Cardiac', 'Accident', 'Stroke', 'Respiratory', 'Pregnancy', 'Other'];
const ncrZones = [
  { name: 'South Delhi', load: 'High', eta: '4 min', color: '#ef4444' },
  { name: 'Noida Expressway', load: 'Rising', eta: '6 min', color: '#f59e0b' },
  { name: 'Gurugram Cyber City', load: 'Stable', eta: '8 min', color: '#06b6d4' },
  { name: 'Dwarka-Airport', load: 'Clear', eta: '5 min', color: '#22c55e' }
];
const fleetStats = [
  { icon: <Ambulance />, value: '28', label: 'NCR ambulances live' },
  { icon: <Gauge />, value: '92%', label: 'Dispatch confidence' },
  { icon: <Hospital />, value: '74', label: 'Beds visible now' },
  { icon: <Zap />, value: '1.2s', label: 'Realtime sync' }
];
const responseSteps = [
  { label: 'Request verified', time: '00:08', done: true },
  { label: 'Nearest ALS unit assigned', time: '00:21', done: true },
  { label: 'Hospital pre-alert sent', time: '00:36', done: true },
  { label: 'Family contact notified', time: '00:42', done: false }
];
const fleetUnits = [
  { code: 'DL-ALS-2047', crew: 'Rohan + EMT Kavya', zone: 'South Delhi', eta: '4 min', type: 'ALS' },
  { code: 'UP-BLS-1182', crew: 'Noida Rapid Unit', zone: 'Noida Sec 18', eta: '6 min', type: 'BLS' },
  { code: 'HR-ICU-4309', crew: 'Gurugram ICU Van', zone: 'Cyber City', eta: '8 min', type: 'ICU' }
];
const triageSignals = [
  { label: 'Pulse', value: '118 bpm', tone: 'critical' },
  { label: 'SpO2', value: '91%', tone: 'moderate' },
  { label: 'BP', value: '142/94', tone: 'normal' }
];

const marker = (label, color) =>
  L.divIcon({
    html: `<div class="map-pin" style="--pin:${color}"><span>${label}</span></div>`,
    className: '',
    iconSize: [38, 38],
    iconAnchor: [19, 19]
  });

function Scene() {
  const group = useRef();
  useFrame((state) => {
    group.current.rotation.y = state.clock.elapsedTime * 0.25;
    group.current.position.y = Math.sin(state.clock.elapsedTime) * 0.08;
  });
  return (
    <group ref={group}>
      <mesh position={[0, 0, 0]}>
        <torusKnotGeometry args={[1.1, 0.24, 160, 18]} />
        <meshStandardMaterial color="#38bdf8" roughness={0.14} metalness={0.48} />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.72, 48, 48]} />
        <meshStandardMaterial color="#fb7185" emissive="#f43f5e" transparent opacity={0.76} />
      </mesh>
      <ambientLight intensity={0.8} />
      <pointLight position={[4, 3, 4]} intensity={8} color="#7dd3fc" />
      <pointLight position={[-3, -2, 3]} intensity={4} color="#fda4af" />
    </group>
  );
}

function useSocket(token, onEvent) {
  useEffect(() => {
    if (!token) return undefined;
    const socket = io(API, { auth: { token } });
    socket.on('request:new', (data) => onEvent('request:new', data));
    socket.on('request:update', (data) => onEvent('request:update', data));
    socket.on('tracking:update', (data) => onEvent('tracking:update', data));
    return () => socket.disconnect();
  }, [token, onEvent]);
}

function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('hec-session') || 'null'));
  const [requests, setRequests] = useState([]);
  const [hospitals, setHospitals] = useState([]);
  const [driver, setDriver] = useState(session?.driver || null);
  const [toast, setToast] = useState('');
  const [tracking, setTracking] = useState(null);
  const api = useMemo(() => axios.create({ baseURL: API, headers: session?.token ? { Authorization: `Bearer ${session.token}` } : {} }), [session]);

  const mergeRequest = (incoming) => {
    setRequests((items) => {
      const rest = items.filter((item) => item.id !== incoming.id);
      return [incoming, ...rest].sort((a, b) => ({ Critical: 3, Moderate: 2, Normal: 1 }[b.priority] || 0) - ({ Critical: 3, Moderate: 2, Normal: 1 }[a.priority] || 0));
    });
  };

  useSocket(session?.token, (event, data) => {
    if (event.includes('request')) {
      mergeRequest(data);
      setToast(event === 'request:new' ? 'New emergency request received' : `Request marked ${data.status}`);
    }
    if (event === 'tracking:update') setTracking(data);
  });

  useEffect(() => {
    gsap.fromTo('.rise', { y: 22, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.08, duration: 0.8, ease: 'power3.out' });
    gsap.to('.float-card', { y: -10, duration: 2.4, ease: 'sine.inOut', repeat: -1, yoyo: true, stagger: 0.18 });
    gsap.fromTo('.pulse-line span', { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: 1.3, stagger: 0.16, ease: 'power2.out' });
  }, [session?.user?.role]);

  useEffect(() => {
    if (!session) return;
    Promise.all([api.get('/api/requests'), api.get('/api/hospitals'), api.get('/api/me')]).then(([reqs, hosps, me]) => {
      setRequests(reqs.data);
      setHospitals(hosps.data);
      setDriver(me.data.driver);
    });
  }, [api, session]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const saveSession = (data) => {
    localStorage.setItem('hec-session', JSON.stringify(data));
    setSession(data);
    setDriver(data.driver);
  };

  const logout = () => {
    localStorage.removeItem('hec-session');
    setSession(null);
    setRequests([]);
    setDriver(null);
  };

  return (
    <main>
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />
      <div className="aurora aurora-c" />
      <nav className="nav">
        <div className="brand"><Siren size={22} /> Healthcare Emergency Connect</div>
        {session && <button className="ghost" onClick={logout}><LogOut size={16} /> Logout</button>}
      </nav>
      {!session ? <Landing onAuth={saveSession} /> : session.user.role === 'driver' ? <DriverDashboard api={api} user={session.user} driver={driver} setDriver={setDriver} requests={requests} mergeRequest={mergeRequest} hospitals={hospitals} /> : <PatientDashboard api={api} user={session.user} requests={requests} mergeRequest={mergeRequest} hospitals={hospitals} tracking={tracking} />}
      {toast && <div className="toast"><Bell size={16} /> {toast}</div>}
    </main>
  );
}

function Landing({ onAuth }) {
  return (
    <section className="landing">
      <div className="hero-copy rise">
        <span className="pill"><Radio size={14} /> Real-time emergency dispatch</span>
        <h1>Patient requests. Driver accepts. Ambulance moves live.</h1>
        <p>A Delhi NCR emergency response cockpit with driver dispatch, live ambulance movement, hospital capacity, and priority routing in one polished demo.</p>
        <div className="metrics">
          <Metric value="4 min" label="Critical ETA" />
          <Metric value="Live" label="Socket.io updates" />
          <Metric value="5" label="NCR hospital feeds" />
        </div>
        <div className="city-strip">
          {ncrZones.map((zone) => <span key={zone.name} style={{ '--zone': zone.color }}>{zone.name}</span>)}
        </div>
      </div>
      <div className="hero-visual rise">
        <Canvas camera={{ position: [0, 0, 4] }}><Scene /></Canvas>
        <div className="signal-card"><Activity /> Delhi NCR network armed</div>
        <div className="float-card float-a"><Navigation size={16} /> AIIMS corridor</div>
        <div className="float-card float-b"><Route size={16} /> Noida route clean</div>
      </div>
      <AuthPanel onAuth={onAuth} />
    </section>
  );
}

function Metric({ value, label }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function AuthPanel({ onAuth }) {
  const [mode, setMode] = useState('login');
  const [role, setRole] = useState('patient');
  const [form, setForm] = useState({ name: '', email: 'patient@test.com', password: '123456', phone: '', licenseNumber: '', vehicleNumber: '' });
  const [error, setError] = useState('');

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    try {
      const payload = mode === 'login' ? { email: form.email, password: form.password } : { ...form, role };
      const { data } = await axios.post(`${API}/api/auth/${mode}`, payload);
      onAuth(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not authenticate');
    }
  };

  const demo = (nextRole) => {
    setRole(nextRole);
    setMode('login');
    setForm((old) => ({ ...old, email: nextRole === 'driver' ? 'driver@test.com' : 'patient@test.com', password: '123456' }));
  };

  return (
    <form className="panel auth rise" onSubmit={submit}>
      <div className="tabs">
        <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Login</button>
        <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Register</button>
      </div>
      <div className="quick">
        <button type="button" onClick={() => demo('patient')}>Patient demo</button>
        <button type="button" onClick={() => demo('driver')}>Driver demo</button>
      </div>
      {mode === 'register' && <input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
      <input placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input placeholder="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      {mode === 'register' && (
        <>
          <select value={role} onChange={(e) => setRole(e.target.value)}><option value="patient">Patient</option><option value="driver">Driver</option></select>
          <input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          {role === 'driver' && <><input placeholder="License number" value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} /><input placeholder="Vehicle number" value={form.vehicleNumber} onChange={(e) => setForm({ ...form, vehicleNumber: e.target.value })} /></>}
        </>
      )}
      {error && <p className="error">{error}</p>}
      <button className="primary">{mode === 'login' ? 'Enter Command Center' : 'Create Account'}</button>
    </form>
  );
}

function PatientDashboard({ api, user, requests, mergeRequest, hospitals, tracking }) {
  const [form, setForm] = useState({
    name: user.name,
    contact: user.phone || '+91 98765 43210',
    emergencyType: 'Cardiac',
    priority: 'Critical'
  });

  const [recommendations, setRecommendations] = useState([]);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);

  const active = requests[0];

  const submit = async (event) => {
    event.preventDefault();

    try {
      // Book ambulance
      const { data } = await api.post('/api/requests', form);

      mergeRequest(data.request);

      // Get AI hospital recommendations
      setLoadingRecommendations(true);

      const response = await api.post('/api/hospitals/recommend', {
        emergencyType: form.emergencyType,
        priority: form.priority
      });

      setRecommendations(response.data.recommendations || []);

    } catch (error) {
      console.error('Booking / AI recommendation error:', error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  return (
    <section className="dashboard">
      <Header
        title={`Welcome, ${user.name}`}
        subtitle="Book an ambulance and watch the dispatch system react in real time."
        icon={<HeartPulse />}
      />

      <NcrIntel />

      <RealisticOps request={active} />

      <div className="grid two">

        <form className="panel rise" onSubmit={submit}>
          <h2>Emergency Booking</h2>

          <input
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            placeholder="Patient name"
          />

          <input
            value={form.contact}
            onChange={(e) =>
              setForm({ ...form, contact: e.target.value })
            }
            placeholder="Contact"
          />

          <select
            value={form.emergencyType}
            onChange={(e) =>
              setForm({
                ...form,
                emergencyType: e.target.value
              })
            }
          >
            {emergencyTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>

          <div className="segmented">
            {priorities.map((item) => (
              <button
                type="button"
                className={form.priority === item ? 'active' : ''}
                onClick={() =>
                  setForm({
                    ...form,
                    priority: item
                  })
                }
                key={item}
              >
                {item}
              </button>
            ))}
          </div>

          <button className="emergency">
            <Siren />
            Request Ambulance
          </button>
        </form>

        <StatusPanel request={active} />

      </div>

      {/* AI HOSPITAL RECOMMENDATIONS */}
      <AiHospitalRecommendations
        recommendations={recommendations}
        loading={loadingRecommendations}
      />

      <MapAndHospitals
        request={active}
        hospitals={hospitals}
        tracking={tracking}
      />

    </section>
  );
}
function AiHospitalRecommendations({ recommendations, loading }) {
  return (
    <section className="panel rise ai-recommendations">

      <div className="section-title">
        <h2>🧠 AI Hospital Recommendation</h2>
        <span>ML-powered suitability ranking</span>
      </div>

      {loading && (
        <p className="muted">
          Analyzing hospital capacity and suitability...
        </p>
      )}

      {!loading && recommendations.length === 0 && (
        <p className="muted">
          Book an ambulance to generate AI hospital recommendations.
        </p>
      )}

      {!loading && recommendations.length > 0 && (
        <div className="ai-hospital-list">

          {recommendations.map((hospital, index) => (
            <article
              className={`ai-hospital ${
                index === 0 ? 'top-hospital' : ''
              }`}
              key={hospital.name}
            >

              <div className="hospital-rank">
                {index === 0
                  ? '🥇'
                  : index === 1
                    ? '🥈'
                    : index === 2
                      ? '🥉'
                      : `#${index + 1}`}
              </div>

              <div className="hospital-info">
                <strong>{hospital.name}</strong>

                <span>
                  {hospital.distance_km} km
                  {' • '}
                  {hospital.beds} beds
                  {' • '}
                  {hospital.icu_beds} ICU beds
                </span>
              </div>

              <div className="hospital-score">
                <strong>
                  {hospital.suitability_score}%
                </strong>

                <span>Suitability</span>
              </div>

            </article>
          ))}

        </div>
      )}

    </section>
  );
}

function DriverDashboard({ api, user, driver, setDriver, requests, mergeRequest, hospitals }) {
  const active = requests.find((req) => req.status === 'Accepted') || requests[0];
  const changeStatus = async () => {
    const { data } = await api.patch('/api/driver/status', { status: driver?.status === 'ONLINE' ? 'OFFLINE' : 'ONLINE' });
    setDriver(data);
  };
  const setRequestStatus = async (id, status) => {
    const { data } = await api.patch(`/api/requests/${id}/status`, { status });
    mergeRequest(data);
  };

  return (
    <section className="dashboard">
      <Header title="Driver Command Center" subtitle="Accept the highest priority case and keep availability visible." icon={<Ambulance />} />
      <NcrIntel />
      <RealisticOps request={active} driverView />
      <div className="grid driver-grid">
        <div className="panel rise">
          <h2>{driver?.name || user.name}</h2>
          <Info icon={<ShieldCheck />} label="License" value={driver?.licenseNumber} />
          <Info icon={<Ambulance />} label="Vehicle" value={driver?.vehicleNumber} />
          <Info icon={<UserRound />} label="Phone" value={driver?.phone} />
          <button className={`availability ${driver?.status === 'ONLINE' ? 'online' : ''}`} onClick={changeStatus}>{driver?.status || 'OFFLINE'}</button>
          <div className="mini-stats"><Metric value={requests.filter((r) => r.status === 'Accepted').length} label="Active" /><Metric value={driver?.completed || 0} label="Completed" /></div>
        </div>
        <div className="panel rise requests">
          <h2>Incoming Requests</h2>
          {requests.length === 0 && <p className="muted">No active requests yet. Submit one from the patient dashboard.</p>}
          {requests.map((request) => (
            <article className={`request-card ${request.priority.toLowerCase()}`} key={request.id}>
              <div>
                <strong>{request.patientName}</strong>
                <span>{request.emergencyType} - {request.region || 'Delhi NCR'} - {request.distance} - ETA {request.eta} min</span>
              </div>
              <b>{request.priority}</b>
              <div className="actions">
                <button onClick={() => setRequestStatus(request.id, 'Accepted')}>Accept</button>
                <button className="ghost" onClick={() => setRequestStatus(request.id, 'Rejected')}>Reject</button>
                {request.status === 'Accepted' && <button onClick={() => setRequestStatus(request.id, 'Completed')}>Complete</button>}
              </div>
            </article>
          ))}
        </div>
      </div>
      <MapAndHospitals request={active} hospitals={hospitals} />
    </section>
  );
}

function Header({ title, subtitle, icon }) {
  return <header className="dash-head rise"><div className="head-icon">{icon}</div><div><h1>{title}</h1><p>{subtitle}</p></div></header>;
}

function NcrIntel() {
  return (
    <div className="intel-grid rise">
      {fleetStats.map((item) => (
        <article className="intel-card" key={item.label}>
          <div>{item.icon}</div>
          <strong>{item.value}</strong>
          <span>{item.label}</span>
        </article>
      ))}
      <article className="intel-card wide">
        <div><Sparkles /></div>
        <strong>AIIMS Trauma Centre recommended</strong>
        <span>Fastest route from South Delhi with ICU and trauma capacity available.</span>
        <div className="pulse-line"><span /><span /><span /></div>
      </article>
    </div>
  );
}

function RealisticOps({ request, driverView = false }) {
  return (
    <div className="ops-grid rise">
      <section className="panel ops-card">
        <div className="section-title"><h2>Emergency Timeline</h2><span><Radio size={15} /> Auto-dispatch log</span></div>
        <div className="timeline">
          {responseSteps.map((step) => (
            <div className={step.done ? 'done' : ''} key={step.label}>
              <CheckCircle2 size={17} />
              <span>{step.label}</span>
              <b>{step.time}</b>
            </div>
          ))}
        </div>
      </section>
      <section className="panel ops-card">
        <div className="section-title"><h2>{driverView ? 'Fleet Backup' : 'Assigned Unit'}</h2><span><Ambulance size={15} /> Live fleet</span></div>
        <div className="fleet-list">
          {fleetUnits.map((unit) => (
            <article key={unit.code}>
              <strong>{unit.code}</strong>
              <span>{unit.crew} - {unit.zone}</span>
              <b>{unit.type} / {unit.eta}</b>
            </article>
          ))}
        </div>
      </section>
      <section className="panel ops-card">
        <div className="section-title"><h2>Patient Signals</h2><span><Stethoscope size={15} /> Simulated triage</span></div>
        <div className="triage-grid">
          {triageSignals.map((signal) => (
            <div className={signal.tone} key={signal.label}>
              <span>{signal.label}</span>
              <strong>{signal.value}</strong>
            </div>
          ))}
        </div>
        <p className="microcopy">{request ? `${request.priority} ${request.emergencyType} case routed via ${request.region || 'Delhi NCR'}.` : 'Triage summary activates after booking.'}</p>
      </section>
      <section className="panel ops-card contact-card">
        <div className="section-title"><h2>Notifications</h2><span><PhoneCall size={15} /> Mock alerts</span></div>
        <p>SMS sent to emergency contact, ER desk, and driver crew. Consent and medical ID checks are simulated for demo.</p>
      </section>
    </div>
  );
}

function Info({ icon, label, value }) {
  return <div className="info">{icon}<span>{label}</span><strong>{value || '-'}</strong></div>;
}

function StatusPanel({ request }) {
  return (
    <div className="panel rise status">
      <h2>Live Status</h2>
      {!request ? <p className="muted">Your ambulance status appears here after booking.</p> : (
        <>
          <span className={`status-badge ${request.status.toLowerCase()}`}>{request.status}</span>
          <h3>{request.emergencyType} emergency</h3>
          <Info icon={<Clock />} label="ETA" value={`${request.eta} minutes`} />
          <Info icon={<MapPin />} label="Region" value={request.region || request.distance} />
          <Info icon={<Activity />} label="Priority" value={request.priority} />
        </>
      )}
    </div>
  );
}

function MapResizer({ active }) {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, active ? 180 : 60);
    return () => clearTimeout(timer);
  }, [active, map]);
  return null;
}

function DispatchMap({ patient, driver, hospitals, expanded = false }) {
  return (
    <MapContainer key={expanded ? 'expanded-map' : 'compact-map'} center={[28.58, 77.22]} zoom={expanded ? 11 : 10} scrollWheelZoom={expanded}>
      <MapResizer active={expanded} />
      <TileLayer attribution="&copy; OpenStreetMap" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <Marker position={[patient.lat, patient.lng]} icon={marker('P', '#22c55e')} />
      <Marker position={[driver.lat, driver.lng]} icon={marker('A', '#ef4444')} />
      {hospitals.filter((hospital) => hospital.location).map((hospital) => (
        <Marker key={hospital.id} position={[hospital.location.lat, hospital.location.lng]} icon={marker('H', '#2563eb')} />
      ))}
      <Polyline positions={[[driver.lat, driver.lng], [patient.lat, patient.lng]]} color="#67e8f9" weight={5} />
    </MapContainer>
  );
}

function MapAndHospitals({ request, hospitals, tracking }) {
  const [expanded, setExpanded] = useState(false);
  const patient = request?.patientLocation || { lat: 28.6239, lng: 77.218 };
  const driver = tracking?.driverLocation || request?.driverLocation || { lat: 28.6139, lng: 77.209 };

  useEffect(() => {
    if (!expanded) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.body.classList.add('modal-open');
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('modal-open');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [expanded]);

  return (
    <div className="grid two lower">
      <div className="panel map-wrap rise">
        <div className="section-title"><h2>Delhi NCR Live Tracking</h2><span><MapPinned size={15} /> Delhi - Noida - Gurugram</span></div>
        <button className="map-click-layer" type="button" onClick={() => setExpanded(true)} aria-label="Expand Delhi NCR map">
          <span><Expand size={16} /> Click to expand command map</span>
        </button>
        <DispatchMap patient={patient} driver={driver} hospitals={hospitals} />
        {expanded && (
          <div className="map-modal" role="dialog" aria-modal="true" onMouseDown={() => setExpanded(false)}>
            <div className="map-modal-panel" onMouseDown={(event) => event.stopPropagation()}>
              <div className="modal-head">
                <div>
                  <h2>Delhi NCR Command Map</h2>
                  <p>Expanded route view with ambulance, patient, hospitals, and NCR coverage points.</p>
                </div>
                <button className="ghost close-map" type="button" onClick={() => setExpanded(false)}><X size={18} /> Close</button>
              </div>
              <div className="expanded-map"><DispatchMap patient={patient} driver={driver} hospitals={hospitals} expanded /></div>
              <div className="map-legend">
                <span><i style={{ '--legend': '#ef4444' }} /> Ambulance</span>
                <span><i style={{ '--legend': '#22c55e' }} /> Patient</span>
                <span><i style={{ '--legend': '#2563eb' }} /> Hospital</span>
                <span><Route size={15} /> Suggested route corridor</span>
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="panel rise hospitals">
        <div className="section-title"><h2>Hospital Availability</h2><span><Crosshair size={15} /> Live fake NCR data</span></div>
        {hospitals.map((hospital) => (
          <article key={hospital.id}>
            {hospital.trauma ? <Hospital /> : <Building2 />}
            <div><strong>{hospital.name}</strong><span>{hospital.region} - {hospital.distance} away - ICU {hospital.icu}</span></div>
            <b>{hospital.beds} beds</b>
          </article>
        ))}
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
