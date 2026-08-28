import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { nanoid } from 'nanoid';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
const dataFile = path.join(dataDir, 'db.json');

const hospitalSeed = [
  { id: 'hosp-aiims', name: 'AIIMS Trauma Centre, Delhi', distance: '2.1 km', beds: 14, icu: 5, trauma: true, region: 'South Delhi', location: { lat: 28.5672, lng: 77.21 } },
  { id: 'hosp-max-saket', name: 'Max Super Speciality, Saket', distance: '4.7 km', beds: 9, icu: 3, trauma: true, region: 'Saket', location: { lat: 28.5276, lng: 77.2128 } },
  { id: 'hosp-fortis-noida', name: 'Fortis Hospital, Noida', distance: '8.4 km', beds: 18, icu: 6, trauma: true, region: 'Noida Sector 62', location: { lat: 28.6181, lng: 77.3726 } },
  { id: 'hosp-medanta', name: 'Medanta The Medicity, Gurugram', distance: '18.2 km', beds: 22, icu: 8, trauma: true, region: 'Gurugram', location: { lat: 28.4399, lng: 77.0419 } },
  { id: 'hosp-yatharth', name: 'Yatharth Hospital, Greater Noida', distance: '24.8 km', beds: 11, icu: 4, trauma: false, region: 'Greater Noida', location: { lat: 28.4744, lng: 77.503 } }
];

const driverLocation = { lat: 28.5843, lng: 77.1639 };
const patientLocation = { lat: 28.5672, lng: 77.21 };
const demoRequests = [
  {
    id: 'demo-req-noida-critical',
    patientId: 'walk-in-noida',
    patientName: 'Neha Sharma',
    contact: '+91 98111 22334',
    driverId: null,
    status: 'Pending',
    emergencyType: 'Accident',
    priority: 'Critical',
    distance: '6.2 km',
    eta: 5,
    region: 'Noida Sector 18',
    patientLocation: { lat: 28.5708, lng: 77.3261 },
    driverLocation: { lat: 28.5865, lng: 77.2191 },
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString()
  },
  {
    id: 'demo-req-gurugram-moderate',
    patientId: 'walk-in-gurugram',
    patientName: 'Kabir Malhotra',
    contact: '+91 98990 77881',
    driverId: 'driver-profile-demo',
    status: 'Accepted',
    emergencyType: 'Cardiac',
    priority: 'Moderate',
    distance: '9.8 km',
    eta: 8,
    region: 'Cyber Hub, Gurugram',
    patientLocation: { lat: 28.495, lng: 77.089 },
    driverLocation: { lat: 28.4595, lng: 77.0266 },
    createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString()
  }
];

const userSchema = new mongoose.Schema(
  { _id: String, name: String, email: String, password: String, role: String, phone: String },
  { timestamps: true }
);
const driverSchema = new mongoose.Schema(
  { _id: String, userId: String, name: String, licenseNumber: String, vehicleNumber: String, phone: String, status: String, location: Object, completed: Number },
  { timestamps: true }
);
const requestSchema = new mongoose.Schema(
  {
    _id: String,
    patientId: String,
    patientName: String,
    contact: String,
    driverId: String,
    status: String,
    emergencyType: String,
    priority: String,
    distance: String,
    eta: Number,
    patientLocation: Object,
    driverLocation: Object,
    createdAt: String
  },
  { timestamps: true }
);

let UserModel;
let DriverModel;
let RequestModel;
let mode = 'json';
let db = null;

async function seedJson() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    db = JSON.parse(await fs.readFile(dataFile, 'utf8'));
    db.hospitals = hospitalSeed;
    db.requests = db.requests || [];
    db.drivers = db.drivers || [];
    db.drivers = db.drivers.map((driver) => driver.id === 'driver-profile-demo' ? { ...driver, location: driverLocation, completed: Math.max(driver.completed || 0, 16) } : driver);
    for (const request of demoRequests) {
      if (!db.requests.some((item) => item.id === request.id)) db.requests.push(request);
    }
    await saveJson();
  } catch {
    const patientPassword = await bcrypt.hash('123456', 10);
    const driverPassword = await bcrypt.hash('123456', 10);
    db = {
      users: [
        { id: 'patient-demo', name: 'Aarav Mehta', email: 'patient@test.com', password: patientPassword, role: 'patient', phone: '+91 98765 43210' },
        { id: 'driver-demo', name: 'Rohan Singh', email: 'driver@test.com', password: driverPassword, role: 'driver', phone: '+91 99887 76655' }
      ],
      drivers: [
        {
          id: 'driver-profile-demo',
          userId: 'driver-demo',
          name: 'Rohan Singh',
          licenseNumber: 'DL-042026-AMB',
          vehicleNumber: 'DL 01 AM 2047',
          phone: '+91 99887 76655',
          status: 'ONLINE',
          location: driverLocation,
          completed: 8
        }
      ],
      requests: demoRequests,
      hospitals: hospitalSeed
    };
    await saveJson();
  }
}

async function saveJson() {
  if (mode === 'json') {
    try {
      await fs.mkdir(dataDir, { recursive: true });
      await fs.writeFile(dataFile, JSON.stringify(db, null, 2));
    } catch (error) {
      console.warn(`JSON store is running in memory because disk write failed: ${error.message}`);
    }
  }
}

export async function initStore() {
  if (process.env.MONGODB_URI) {
    try {
      await mongoose.connect(process.env.MONGODB_URI);
      UserModel = mongoose.model('User', userSchema);
      DriverModel = mongoose.model('Driver', driverSchema);
      RequestModel = mongoose.model('AmbulanceRequest', requestSchema);
      mode = 'mongo';
      await seedMongo();
      return { mode };
    } catch (error) {
      console.warn('MongoDB unavailable, falling back to JSON store:', error.message);
    }
  }
  mode = 'json';
  await seedJson();
  return { mode };
}

async function seedMongo() {
  const users = await UserModel.countDocuments();
  if (users > 0) return;
  const patientPassword = await bcrypt.hash('123456', 10);
  const driverPassword = await bcrypt.hash('123456', 10);
  await UserModel.create([
    { _id: 'patient-demo', name: 'Aarav Mehta', email: 'patient@test.com', password: patientPassword, role: 'patient', phone: '+91 98765 43210' },
    { _id: 'driver-demo', name: 'Rohan Singh', email: 'driver@test.com', password: driverPassword, role: 'driver', phone: '+91 99887 76655' }
  ]);
  await DriverModel.create({
    _id: 'driver-profile-demo',
    userId: 'driver-demo',
    name: 'Rohan Singh',
    licenseNumber: 'DL-042026-AMB',
    vehicleNumber: 'DL 01 AM 2047',
    phone: '+91 99887 76655',
    status: 'ONLINE',
    location: driverLocation,
    completed: 8
  });
}

const normalize = (doc) => {
  const raw = doc?.toObject ? doc.toObject() : doc;
  if (!raw) return null;
  return { ...raw, id: raw.id || raw._id?.toString() };
};

export async function findUserByEmail(email) {
  if (mode === 'mongo') return normalize(await UserModel.findOne({ email }));
  return db.users.find((user) => user.email === email) || null;
}

export async function createUser(payload) {
  const user = { id: nanoid(), ...payload, password: await bcrypt.hash(payload.password, 10) };
  if (mode === 'mongo') return normalize(await UserModel.create({ _id: user.id, ...user }));
  db.users.push(user);
  if (user.role === 'driver') {
    db.drivers.push({
      id: nanoid(),
      userId: user.id,
      name: user.name,
      licenseNumber: payload.licenseNumber || 'DL-DEMO-0001',
      vehicleNumber: payload.vehicleNumber || 'AMB-DEMO',
      phone: payload.phone,
      status: 'OFFLINE',
      location: driverLocation,
      completed: 0
    });
  }
  await saveJson();
  return user;
}

export async function getDriverByUser(userId) {
  if (mode === 'mongo') return normalize(await DriverModel.findOne({ userId }));
  return db.drivers.find((driver) => driver.userId === userId) || null;
}

export async function setDriverStatus(userId, status) {
  if (mode === 'mongo') {
    return normalize(await DriverModel.findOneAndUpdate({ userId }, { status }, { new: true }));
  }
  const driver = db.drivers.find((item) => item.userId === userId);
  if (driver) driver.status = status;
  await saveJson();
  return driver;
}

export async function listOnlineDrivers() {
  if (mode === 'mongo') return (await DriverModel.find({ status: 'ONLINE' })).map(normalize);
  return db.drivers.filter((driver) => driver.status === 'ONLINE');
}

export async function createRequest(payload) {
  const priorityEta = { Critical: 4, Moderate: 7, Normal: 11 };
  const request = {
    id: nanoid(),
    patientId: payload.patientId,
    patientName: payload.patientName,
    contact: payload.contact,
    driverId: null,
    status: 'Pending',
    emergencyType: payload.emergencyType,
    priority: payload.priority,
    distance: payload.priority === 'Critical' ? '2.1 km' : '4.6 km',
    eta: priorityEta[payload.priority] || 8,
    region: 'AIIMS - South Delhi corridor',
    patientLocation,
    driverLocation,
    createdAt: new Date().toISOString()
  };
  if (mode === 'mongo') return normalize(await RequestModel.create({ _id: request.id, ...request }));
  db.requests.unshift(request);
  await saveJson();
  return request;
}

export async function listRequestsForUser(user) {
  const sort = (items) => items.sort((a, b) => {
    const weight = { Critical: 3, Moderate: 2, Normal: 1 };
    return (weight[b.priority] || 0) - (weight[a.priority] || 0) || new Date(b.createdAt) - new Date(a.createdAt);
  });
  if (mode === 'mongo') {
    const query = user.role === 'patient' ? { patientId: user.id } : {};
    return sort((await RequestModel.find(query)).map(normalize));
  }
  const items = user.role === 'patient' ? db.requests.filter((req) => req.patientId === user.id) : db.requests;
  return sort([...items]);
}

export async function updateRequestStatus(id, status, driverUserId) {
  const driver = driverUserId ? await getDriverByUser(driverUserId) : null;
  const patch = { status, ...(driver ? { driverId: driver.id } : {}) };
  if (mode === 'mongo') return normalize(await RequestModel.findOneAndUpdate({ _id: id }, patch, { new: true }));
  const request = db.requests.find((item) => item.id === id);
  if (request) Object.assign(request, patch);
  if (status === 'Completed' && driver) driver.completed += 1;
  await saveJson();
  return request;
}

export async function getHospitals() {
  return mode === 'mongo' ? hospitalSeed : db.hospitals;
}
