import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'node:http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Server } from 'socket.io';
import {
  createRequest,
  createUser,
  findUserByEmail,
  getDriverByUser,
  getHospitals,
  initStore,
  listOnlineDrivers,
  listRequestsForUser,
  setDriverStatus,
  updateRequestStatus
} from './store.js';

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 8080;
const CLIENT_URLS = (process.env.CLIENT_URL || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((url) => url.trim())
  .filter(Boolean);
const JWT_SECRET = process.env.JWT_SECRET || 'healthcare-connect-demo-secret';
const isAllowedOrigin = (origin) => !origin || CLIENT_URLS.includes(origin) || /\.vercel\.app$/.test(origin) || /\.netlify\.app$/.test(origin);
const corsOrigin = (origin, callback) => {
  if (isAllowedOrigin(origin)) return callback(null, true);
  return callback(new Error(`CORS blocked origin: ${origin}`));
};

const io = new Server(server, {
  cors: { origin: corsOrigin, credentials: true }
});
const trackingTimers = new Map();

app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

function publicUser(user) {
  const { password, ...safe } = user;
  return safe;
}

function sign(user) {
  return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, { expiresIn: '2d' });
}

function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    return next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'Healthcare Emergency Connect API' });
});

app.post('/api/auth/login', async (req, res) => {
  const user = await findUserByEmail(req.body.email);
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
    return res.status(401).json({ message: 'Invalid credentials' });
  }
  const driver = user.role === 'driver' ? await getDriverByUser(user.id) : null;
  return res.json({ token: sign(user), user: publicUser(user), driver });
});

app.post('/api/auth/register', async (req, res) => {
  const existing = await findUserByEmail(req.body.email);
  if (existing) return res.status(409).json({ message: 'Email already exists' });
  const user = await createUser(req.body);
  const driver = user.role === 'driver' ? await getDriverByUser(user.id) : null;
  return res.status(201).json({ token: sign(user), user: publicUser(user), driver });
});

app.get('/api/me', requireAuth, async (req, res) => {
  const user = await findUserByEmail(req.user.email);
  const driver = user.role === 'driver' ? await getDriverByUser(user.id) : null;
  res.json({ user: publicUser(user), driver });
});

app.get('/api/hospitals', requireAuth, async (_req, res) => {
  res.json(await getHospitals());
});
app.post('/api/hospitals/recommend', requireAuth, async (req, res) => {
  try {
    const hospitals = await getHospitals();

    console.log("HOSPITALS FROM STORE:", hospitals);

    const mlHospitals = hospitals.map((hospital) => ({
      name: hospital.name,

      distance_km: parseFloat(
        String(hospital.distance).replace(' km', '')
      ),

      beds: Number(hospital.beds),

      icu_beds: Number(hospital.icu),

      trauma: hospital.trauma ? 1 : 0,

      emergency_match: 1,

      priority:
        req.body.priority === 'Critical'
          ? 3
          : req.body.priority === 'Moderate'
            ? 2
            : 1
    }));

    console.log("DATA SENT TO ML:", mlHospitals);

    const response = await fetch(
      'http://127.0.0.1:8000/recommend-hospitals',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          hospitals: mlHospitals
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error('ML service error:', errorText);

      return res.status(502).json({
        message: 'ML recommendation service unavailable'
      });
    }

    const recommendations = await response.json();

    res.json(recommendations);

  } catch (error) {
    console.error('Hospital recommendation error:', error);

    res.status(500).json({
      message: 'Failed to get hospital recommendations'
    });
  }
});
app.get('/api/requests', requireAuth, async (req, res) => {
  res.json(await listRequestsForUser(req.user));
});

app.post('/api/requests', requireAuth, async (req, res) => {
  const user = await findUserByEmail(req.user.email);
  const request = await createRequest({
    patientId: user.id,
    patientName: req.body.name || user.name,
    contact: req.body.contact || user.phone,
    emergencyType: req.body.emergencyType,
    priority: req.body.priority
  });
  const onlineDrivers = await listOnlineDrivers();
  io.to('drivers').emit('request:new', request);
  io.to(`patient:${user.id}`).emit('request:update', request);
  res.status(201).json({ request, notifiedDrivers: onlineDrivers.length });
});

app.patch('/api/driver/status', requireAuth, async (req, res) => {
  if (req.user.role !== 'driver') return res.status(403).json({ message: 'Drivers only' });
  const driver = await setDriverStatus(req.user.id, req.body.status);
  io.to('drivers').emit('driver:status', driver);
  res.json(driver);
});

app.patch('/api/requests/:id/status', requireAuth, async (req, res) => {
  const request = await updateRequestStatus(req.params.id, req.body.status, req.user.role === 'driver' ? req.user.id : null);
  io.to('drivers').emit('request:update', request);
  io.to(`patient:${request.patientId}`).emit('request:update', request);
  if (request.status === 'Accepted') startTracking(request);
  res.json(request);
});

function startTracking(request) {
  if (trackingTimers.has(request.id)) clearInterval(trackingTimers.get(request.id));
  let step = 0;
  const total = 24;
  const timer = setInterval(() => {
    step += 1;
    const progress = Math.min(step / total, 1);
    const lat = request.driverLocation.lat + (request.patientLocation.lat - request.driverLocation.lat) * progress;
    const lng = request.driverLocation.lng + (request.patientLocation.lng - request.driverLocation.lng) * progress;
    const payload = {
      requestId: request.id,
      patientId: request.patientId,
      eta: Math.max(1, Math.ceil(request.eta * (1 - progress))),
      progress,
      driverLocation: { lat, lng }
    };
    io.to('drivers').emit('tracking:update', payload);
    io.to(`patient:${request.patientId}`).emit('tracking:update', payload);
    if (progress >= 1) {
      clearInterval(timer);
      trackingTimers.delete(request.id);
    }
  }, 1100);
  trackingTimers.set(request.id, timer);
}

io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  if (socket.user.role === 'driver') socket.join('drivers');
  socket.join(`patient:${socket.user.id}`);

  socket.on('tracking:tick', (payload) => {
    io.to(`patient:${payload.patientId}`).emit('tracking:update', payload);
    io.to('drivers').emit('tracking:update', payload);
  });
});

const { mode } = await initStore();
server.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT} using ${mode} store`);
});
