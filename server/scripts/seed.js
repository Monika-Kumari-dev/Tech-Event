// Usage: npm run seed -- 5000
// Creates N fake users directly via the models (for load testing). Requires a real MONGODB_URI:
// with the in-memory database the data would vanish as soon as this script exits.
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { initModels } from '../src/models/index.js';
import { seedAdmin, seedFakeUsers } from '../src/seed.js';

const n = Number.parseInt(process.argv[2] ?? '1000', 10);
if (!Number.isFinite(n) || n <= 0) {
  console.error('Usage: npm run seed -- <count>');
  process.exit(1);
}
if (!config.mongoUri) {
  console.error('MONGODB_URI is empty. Seeding only makes sense against a persistent database.\n' +
    'For in-memory dev data, set SEED_DEMO=50 in .env and run `npm run dev` instead.');
  process.exit(1);
}

await mongoose.connect(config.mongoUri);
await initModels();
await seedAdmin();
const t0 = Date.now();
const inserted = await seedFakeUsers(n);
console.log(`Inserted ${inserted}/${n} users in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await mongoose.disconnect();
