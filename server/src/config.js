import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const int = (v, d) => {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : d;
};

export const config = {
  port: int(process.env.PORT, 4000),
  mongoUri: (process.env.MONGODB_URI || '').trim(),
  jwtSecret: (process.env.JWT_SECRET || '').trim(),
  adminUsername: (process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || 'admin123',
  eventName: process.env.EVENT_NAME || 'Teck Fluence X',
  corsOrigin: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  trustProxy: (process.env.TRUST_PROXY || '').trim(),
  seedDemo: int(process.env.SEED_DEMO, 0),
  isProduction: process.env.NODE_ENV === 'production',
};
