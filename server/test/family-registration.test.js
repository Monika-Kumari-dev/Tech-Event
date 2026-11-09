import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateKeyPair, exportJWK } from 'jose';

// Tests always use an isolated in-memory database, never .env database credentials.
process.env.MONGODB_URI = '';
process.env.JWT_SECRET = 'isolated-test-secret-that-is-long-enough';
process.env.NODE_ENV = 'test';
process.env.SEED_DEMO = '0';
const { privateKey } = await generateKeyPair('ES256', { extractable: true });
process.env.QR_PRIVATE_JWK = JSON.stringify(await exportJWK(privateKey));
const { connectDB, disconnectDB } = await import('../src/db.js');
const { initModels, User, Staff } = await import('../src/models/index.js');
const { loadKeys } = await import('../src/keys.js');
const { signStaffToken } = await import('../src/middleware/auth.js');
const { createApp } = await import('../src/app.js');

test('family registrations, legacy index migration, lookup, and staff passwords', async () => {
  let server;
  try {
    await connectDB();
    await User.collection.createIndex({ email: 1 }, { unique: true });
    await initModels();
    assert.equal((await User.collection.indexes()).find((i) => i.key.email)?.sparse, true);
    await loadKeys();
    server = createApp().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function post(path, body, token) {
      const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
      return { status: res.status, body: await res.json() };
    }
    const adults = Array.from({ length: 5 }, (_, i) => ({ name: `Adult ${i}`, relationship: 'brother' }));
    const kids = Array.from({ length: 5 }, (_, i) => ({ name: `Child ${i}` }));
    const first = await post('/register', { fullName: 'Family One', phone: '9876543210', adults, kids });
    assert.equal(first.status, 201);
    assert.equal(first.body.user.adults.length, 5);
    assert.equal(first.body.user.kids.length, 5);
    assert.equal((await post('/register', { fullName: 'Family Two', phone: '9876543211' })).status, 201);
    assert.equal((await post('/register', { fullName: 'Family Three', phone: '9876543212', adults: [...adults, adults[0]] })).status, 400);
    assert.equal((await post('/register', { fullName: 'Family Three', phone: '9876543212', kids: [...kids, kids[0]] })).status, 400);
    assert.equal((await post('/register', { fullName: 'Family Three', phone: '9876543212', adults: [{ name: 'Someone', relationship: 'invalid' }] })).status, 400);
    assert.equal((await post('/register', { fullName: 'Duplicate Phone', phone: '9876543210' })).status, 409);
    const lookup = await post('/pass/lookup', { fullName: 'family one', phone: '9876543210' });
    assert.equal(lookup.status, 200);
    assert.equal(lookup.body.user.kids.length, 5);
    assert.equal((await post('/pass/lookup', { fullName: 'Wrong Person', phone: '9876543210' })).status, 404);
    assert.equal((await post('/admin/staff', { username: 'denied' })).status, 401);
    const token = await signStaffToken({ _id: '000000000000000000000001', username: 'admin', role: 'admin' });
    const snapshot = await fetch(base + '/sync/snapshot', { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(snapshot.status, 200);
    const snapshotBody = await snapshot.json();
    assert.equal(snapshotBody.users.find((u) => u.phone === '9876543210').adults.length, 5);
    const legacy = await post('/register', { fullName: 'Legacy Person', phone: '9876543213', email: 'legacy@example.com' });
    assert.equal(legacy.status, 201);
    assert.equal((await post('/pass/lookup', { email: 'legacy@example.com', phone: '9876543213' })).status, 200);
    assert.equal((await post('/register', { fullName: 'Other Person', phone: '9876543214', email: 'legacy@example.com' })).status, 409);
    assert.equal((await post('/admin/staff', { username: 'gate-default' }, token)).status, 201);
    assert.equal((await post('/staff/login', { username: 'gate-default', password: 'Test123' })).status, 200);
    const stored = await Staff.findOne({ username: 'gate-default' }).lean();
    assert.notEqual(stored.passwordHash, 'Test123');
    assert.equal((await post('/admin/staff', { username: 'gate-custom', password: 'Custom456' }, token)).status, 201);
    assert.equal((await post('/staff/login', { username: 'gate-custom', password: 'Custom456' })).status, 200);
    assert.equal((await post('/admin/staff', { username: 'gate-short', password: 'bad' }, token)).status, 400);
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await disconnectDB();
  }
});
