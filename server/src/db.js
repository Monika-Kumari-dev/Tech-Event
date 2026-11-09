import mongoose from 'mongoose';
import { config } from './config.js';

let memoryServer = null;

export const isMemoryMode = () => memoryServer !== null;

export async function connectDB() {
  let uri = config.mongoUri;
  if (!uri && config.isProduction) {
    throw new Error('MONGODB_URI is required in production (e.g. a MongoDB Atlas connection string).');
  }
  if (!uri) {
    // Dev-only package (devDependency, not deployed). The module name is a variable on purpose so bundlers
    // (Netlify Functions) can't hoist it into a static import — that crashed the function at startup.
    const devPkg = ['mongodb', 'memory', 'server'].join('-');
    const { MongoMemoryServer } = await import(devPkg);
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('qrpass');
    console.warn(
      '\n' +
        '  ********************\n' +
        '  *  WARNING: MONGODB_URI is empty — using an IN-MEMORY       *\n' +
        '  *  MongoDB. ALL DATA IS LOST WHEN THE SERVER STOPS.         *\n' +
        '  *  Set MONGODB_URI in server/.env for persistent storage.   *\n' +
        '  ********************\n'
    );
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
}

export async function disconnectDB() {
  await mongoose.disconnect().catch(() => {});
  if (memoryServer) await memoryServer.stop().catch(() => {});
}