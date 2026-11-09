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
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri('qrpass');
    console.warn(
      '\n' +
        '  ************************************************************\n' +
        '  *  WARNING: MONGODB_URI is empty — using an IN-MEMORY       *\n' +
        '  *  MongoDB. ALL DATA IS LOST WHEN THE SERVER STOPS.         *\n' +
        '  *  Set MONGODB_URI in server/.env for persistent storage.   *\n' +
        '  ************************************************************\n'
    );
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
  console.log(`[db] connected (${memoryServer ? 'in-memory' : 'MONGODB_URI'})`);
}

export async function disconnectDB() {
  await mongoose.disconnect().catch(() => {});
  if (memoryServer) await memoryServer.stop().catch(() => {});
}
