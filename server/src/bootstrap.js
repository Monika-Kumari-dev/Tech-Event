// One-time startup shared by the long-running server (src/index.js) and the Netlify Function.
import { config } from './config.js';
import { connectDB, isMemoryMode } from './db.js';
import { initModels, User } from './models/index.js';
import { loadKeys } from './keys.js';
import { seedAdmin, seedFakeUsers } from './seed.js';

let ready = null;

/** Idempotent: concurrent/repeated calls share the same promise (serverless warm starts reuse it). */
export function bootstrap() {
  ready ??= (async () => {
    await connectDB();
    await initModels();
    await loadKeys();
    await seedAdmin();
    if (isMemoryMode() && config.seedDemo > 0 && (await User.estimatedDocumentCount()) === 0) {
      const n = await seedFakeUsers(config.seedDemo);
      console.log(`[seed] SEED_DEMO: created ${n} demo users (in-memory)`);
    }
  })().catch((err) => {
    ready = null; // allow a retry on the next request
    throw err;
  });
  return ready;
}
