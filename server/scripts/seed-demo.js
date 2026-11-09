// Realistic demo data for the dashboard, gate phones and bulk tools.
//   npm run seed:demo                 → 5,000 attendees + staff + check-ins (adds to existing data)
//   npm run seed:demo -- --reset      → wipe attendees/check-ins/devices/batches first (staff accounts kept)
//   npm run seed:demo -- 2000         → custom attendee count
// Safety: refuses to run unless the database name contains "dev", "test" or "demo" (pass --force to override).
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../src/config.js';
import { initModels, User, Checkin, Device, Batch, Staff } from '../src/models/index.js';
import { seedAdmin } from '../src/seed.js';
import { generateCode, CODE_ALPHABET } from '../src/lib/code.js';

const args = process.argv.slice(2);
const RESET = args.includes('--reset');
const FORCE = args.includes('--force');
const TOTAL = Number.parseInt(args.find((a) => /^\d+$/.test(a)) ?? '5000', 10);

if (!config.mongoUri) {
  console.error('MONGODB_URI is empty — set it in server/.env first.');
  process.exit(1);
}
const dbName = new URL(config.mongoUri.replace(/^mongodb(\+srv)?:/, 'http:')).pathname.slice(1) || 'test';
if (!/dev|test|demo/i.test(dbName) && !FORCE) {
  console.error(`Refusing to seed database "${dbName}" — it looks like production. Use a *_dev database or pass --force.`);
  process.exit(1);
}

// ---------- name pools ----------
const FIRST = ['Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Krishna', 'Ishaan', 'Rohan', 'Kabir', 'Rahul', 'Karan', 'Nikhil', 'Siddharth',
  'Ananya', 'Diya', 'Priya', 'Aadhya', 'Saanvi', 'Pari', 'Myra', 'Ira', 'Kavya', 'Sneha', 'Neha', 'Pooja', 'Riya', 'Meera', 'Tanvi', 'Shreya', 'Isha',
  'Manish', 'Amit', 'Suresh', 'Deepak', 'Vikram', 'Harsh', 'Yash', 'Om', 'Monika', 'Pratima', 'Shriyansh', 'Rushikesh', 'Aniket', 'Sakshi', 'Komal', 'Gauri'];
const LAST = ['Sharma', 'Verma', 'Patel', 'Kumar', 'Singh', 'Gupta', 'Reddy', 'Iyer', 'Nair', 'Das', 'Mehta', 'Joshi', 'Kulkarni', 'Deshmukh', 'Patil',
  'Pawar', 'Ganjave', 'Chavan', 'Shinde', 'Jadhav', 'Rao', 'Menon', 'Pillai', 'Bose', 'Chatterjee', 'Banerjee', 'Mishra', 'Pandey', 'Agarwal', 'Malhotra'];
const ORGS = ['Teck Fluence X', 'Nexgensis', 'Infosys', 'TCS', 'Wipro', 'Tech Mahindra', 'Persistent Systems', 'Zensar', 'Accenture', 'Capgemini',
  'Cognizant', 'HCLTech', 'COEP Pune', 'MIT Pune', 'VIT Pune', 'Symbiosis', 'Freelance', '', '', ''];
const DOMAINS = ['gmail.com', 'outlook.com', 'yahoo.in', 'hotmail.com', 'icloud.com'];

const pick = (arr, r) => arr[Math.floor(r * arr.length)];
const rand = () => Math.random();
const HOUR = 3600_000;
const now = Date.now();

function batchId(daysAgo) {
  const d = new Date(now - daysAgo * 24 * HOUR).toISOString().slice(0, 10).replace(/-/g, '');
  let s = '';
  for (let i = 0; i < 4; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `B-${d}-${s}`;
}

await mongoose.connect(config.mongoUri);
await initModels();
console.log(`[demo] connected to database "${dbName}"`);

if (RESET) {
  const [u, c, d, b] = await Promise.all([User.deleteMany({}), Checkin.deleteMany({}), Device.deleteMany({}), Batch.deleteMany({})]);
  console.log(`[demo] reset: removed ${u.deletedCount} attendees, ${c.deletedCount} check-ins, ${d.deletedCount} devices, ${b.deletedCount} batches`);
}

// ---------- staff ----------
await seedAdmin();
const STAFF = [
  { username: 'gate1', name: 'Rahul Patil', role: 'verifier' },
  { username: 'gate2', name: 'Sneha Kulkarni', role: 'verifier' },
  { username: 'gate3', name: 'Amit Deshmukh', role: 'verifier' },
  { username: 'manager', name: 'Priya Mehta', role: 'admin' },
];
const hash = await bcrypt.hash('gate1234', 10);
for (const s of STAFF) {
  await Staff.updateOne({ username: s.username }, { $setOnInsert: { ...s, passwordHash: hash } }, { upsert: true });
}
console.log(`[demo] staff: ${STAFF.map((s) => s.username).join(', ')} (password: gate1234)`);

// ---------- attendees ----------
// 70% from two Excel uploads (bulk), 30% self-registered over the last 7 days.
const tag = Date.now().toString(36).slice(-4);
const phoneBase = 7_000_000_000 + (Date.now() % 1_000_000) * 1000;
const batches = [
  { _id: batchId(6), fileName: 'TFX-Summit-Delegates.xlsx', share: 0.45, daysAgo: 6 },
  { _id: batchId(3), fileName: 'TFX-Partner-Companies.xlsx', share: 0.25, daysAgo: 3 },
];
const docs = [];
for (let i = 0; i < TOTAL; i++) {
  const first = pick(FIRST, rand());
  const last = pick(LAST, rand());
  const r = i / TOTAL;
  const b = r < batches[0].share ? batches[0] : r < batches[0].share + batches[1].share ? batches[1] : null;
  const createdAt = b
    ? new Date(now - b.daysAgo * 24 * HOUR + Math.floor(rand() * 60_000))
    : new Date(now - Math.floor(rand() ** 1.6 * 7 * 24 * HOUR)); // more sign-ups closer to the event
  docs.push({
    code: generateCode(),
    fullName: `${first} ${last}`,
    email: `${first}.${last}.${tag}${i}@${pick(DOMAINS, rand())}`.toLowerCase(),
    phone: String(phoneBase + i),
    organization: pick(ORGS, rand()),
    photo: null,
    status: rand() < 0.015 ? 'cancelled' : 'active',
    source: b ? 'bulk' : 'self',
    batchId: b ? b._id : null,
    createdAt,
    updatedAt: createdAt,
  });
}
let t0 = Date.now();
const users = [];
for (let i = 0; i < docs.length; i += 1000) {
  const res = await User.insertMany(docs.slice(i, i + 1000), { ordered: false, timestamps: false });
  users.push(...res);
}
for (const b of batches) {
  const created = users.filter((u) => u.batchId === b._id).length;
  await Batch.create({ _id: b._id, fileName: b.fileName, createdBy: 'admin', created, skipped: Math.floor(created * 0.01), failed: Math.floor(created * 0.004),
    createdAt: new Date(now - b.daysAgo * 24 * HOUR), updatedAt: new Date(now - b.daysAgo * 24 * HOUR) });
}
console.log(`[demo] attendees: ${users.length} (${users.filter((u) => u.source === 'bulk').length} bulk in ${batches.length} batches) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// ---------- check-ins (event "today", last ~10 hours) ----------
// ~38% of active attendees have arrived; morning rush peaks ~3h after doors open.
const GATES = [
  { id: 'demo-gate-1', name: 'Gate 1 · Main entrance', staff: 'gate1', weight: 0.5 },
  { id: 'demo-gate-2', name: 'Gate 2 · North', staff: 'gate2', weight: 0.3 },
  { id: 'demo-gate-3', name: 'Gate 3 · VIP', staff: 'gate3', weight: 0.2 },
];
const pickGate = () => { const r = rand(); return r < 0.5 ? GATES[0] : r < 0.8 ? GATES[1] : GATES[2]; };
const doorsOpen = now - 10 * HOUR;
const arrivalTime = () => {
  // bell-shaped arrivals across the 10h since doors opened, peaking mid-morning
  const t = (rand() + rand() + rand()) / 3; // bell-shaped 0..1
  return Math.min(now - 60_000, doorsOpen + Math.floor(t * 9.8 * HOUR));
};

const active = users.filter((u) => u.status === 'active').sort(() => rand() - 0.5);
const arrived = active.slice(0, Math.floor(active.length * 0.38));
const checkins = [];
const deviceCounts = new Map();
for (const u of arrived) {
  const g = pickGate();
  const scannedAt = new Date(arrivalTime());
  checkins.push({ _id: crypto.randomUUID(), userId: u._id, deviceId: g.id, deviceName: g.name, verifiedBy: g.staff, scannedAt,
    syncedAt: new Date(Math.min(now, scannedAt.getTime() + Math.floor(rand() * 45 * 60_000))), duplicate: false });
  deviceCounts.set(g.id, (deviceCounts.get(g.id) || 0) + 1);
}
// a few people tried to re-enter at another gate
for (const first of checkins.slice(0, 24)) {
  const g = GATES.find((x) => x.id !== first.deviceId);
  const scannedAt = new Date(Math.min(now - 30_000, first.scannedAt.getTime() + (20 + Math.floor(rand() * 120)) * 60_000));
  checkins.push({ _id: crypto.randomUUID(), userId: first.userId, deviceId: g.id, deviceName: g.name, verifiedBy: g.staff, scannedAt,
    syncedAt: scannedAt, duplicate: true });
  deviceCounts.set(g.id, (deviceCounts.get(g.id) || 0) + 1);
}
t0 = Date.now();
for (let i = 0; i < checkins.length; i += 1000) {
  await Checkin.insertMany(checkins.slice(i, i + 1000), { ordered: false });
}
for (const g of GATES) {
  await Device.updateOne(
    { _id: g.id },
    { $set: { deviceName: g.name, lastSyncAt: new Date(now - Math.floor(rand() * (g.id.endsWith('3') ? 12 : 3) * 60_000)) }, $inc: { count: deviceCounts.get(g.id) || 0 } },
    { upsert: true },
  );
}
const dups = checkins.filter((c) => c.duplicate).length;
console.log(`[demo] check-ins: ${checkins.length - dups} arrivals + ${dups} duplicate scans across ${GATES.length} gates in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

await mongoose.disconnect();
console.log('[demo] done ✓');
