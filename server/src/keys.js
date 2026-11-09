import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { generateKeyPair, exportJWK, importJWK, calculateJwkThumbprint, SignJWT } from 'jose';
import { config } from './config.js';

// import.meta.url is undefined when bundled to CommonJS (Netlify Functions); keys/ files are only used in local dev anyway.
const KEYS_DIR = import.meta.url
  ? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'keys')
  : path.resolve(process.cwd(), 'keys');
const PRIVATE_FILE = path.join(KEYS_DIR, 'private.jwk.json');
const PUBLIC_FILE = path.join(KEYS_DIR, 'public.jwk.json');
const SECRET_FILE = path.join(KEYS_DIR, 'jwt-secret.txt');

const state = { kid: null, publicJwk: null, privateKey: null, staffSecret: null };

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

async function keysFromEnv() {
  const raw = (process.env.QR_PRIVATE_JWK || '').trim();
  if (!raw) return null;
  let jwk;
  try {
    jwk = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw new Error('QR_PRIVATE_JWK is not valid JSON (or base64 JSON). Generate it with: npm run deploy-env');
  }
  if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.d) throw new Error('QR_PRIVATE_JWK must be an ES256 (P-256) private JWK');
  const { d, ...pub } = jwk;
  const kid = jwk.kid || (await calculateJwkThumbprint(pub, 'sha256')).slice(0, 8);
  return { privateJwk: { ...jwk, kid, alg: 'ES256', use: 'sig' }, publicJwk: { ...pub, kid, alg: 'ES256', use: 'sig' } };
}

export async function loadKeys() {
  // Cloud hosts (Render, Railway, …) wipe the filesystem on redeploy, so production reads the key from an env var.
  const fromEnv = await keysFromEnv();
  if (fromEnv) {
    state.kid = fromEnv.privateJwk.kid;
    state.publicJwk = fromEnv.publicJwk;
    state.privateKey = await importJWK(fromEnv.privateJwk, 'ES256');
    console.log(`[keys] loaded ES256 key pair from QR_PRIVATE_JWK (kid=${state.kid})`);
    return loadStaffSecret();
  }
  if (config.isProduction) {
    throw new Error('QR_PRIVATE_JWK is required in production (otherwise all QR passes break on redeploy). Run: npm run deploy-env');
  }

  await fs.mkdir(KEYS_DIR, { recursive: true });
  let privateJwk = await readJson(PRIVATE_FILE);
  let publicJwk = await readJson(PUBLIC_FILE);

  if (!privateJwk) {
    const { privateKey } = await generateKeyPair('ES256', { extractable: true });
    privateJwk = await exportJWK(privateKey);
    const { d, ...pub } = privateJwk;
    const thumb = await calculateJwkThumbprint(pub, 'sha256');
    const kid = thumb.slice(0, 8);
    privateJwk = { ...privateJwk, kid, alg: 'ES256', use: 'sig' };
    publicJwk = { ...pub, kid, alg: 'ES256', use: 'sig' };
    await fs.writeFile(PRIVATE_FILE, JSON.stringify(privateJwk, null, 2), { mode: 0o600 });
    await fs.writeFile(PUBLIC_FILE, JSON.stringify(publicJwk, null, 2));
    console.log(`[keys] generated new ES256 key pair (kid=${kid}) in ${KEYS_DIR} — BACK THIS UP`);
  } else {
    if (!publicJwk) {
      const { d, ...pub } = privateJwk;
      publicJwk = pub;
      await fs.writeFile(PUBLIC_FILE, JSON.stringify(publicJwk, null, 2));
    }
    console.log(`[keys] loaded ES256 key pair (kid=${privateJwk.kid})`);
  }

  state.kid = privateJwk.kid;
  state.publicJwk = publicJwk;
  state.privateKey = await importJWK(privateJwk, 'ES256');
  return loadStaffSecret();
}

async function loadStaffSecret() {
  // Staff session secret (HS256)
  let secret = config.jwtSecret;
  if (!secret && config.isProduction) throw new Error('JWT_SECRET is required in production. Run: npm run deploy-env');
  if (!secret) {
    await fs.mkdir(KEYS_DIR, { recursive: true });
    try {
      secret = (await fs.readFile(SECRET_FILE, 'utf8')).trim();
    } catch {
      secret = crypto.randomBytes(48).toString('base64url');
      await fs.writeFile(SECRET_FILE, secret, { mode: 0o600 });
    }
    console.warn('[keys] WARNING: JWT_SECRET is not set — using a generated secret stored in keys/jwt-secret.txt. Set JWT_SECRET in production.');
  }
  state.staffSecret = new TextEncoder().encode(secret);
}

export const getKid = () => state.kid;
export const getPublicJwk = () => state.publicJwk;
export const getStaffSecret = () => state.staffSecret;

/** Sign a QR pass for a user (no expiry). */
export function signPass(user) {
  return new SignJWT({ code: user.code, name: user.fullName })
    .setProtectedHeader({ alg: 'ES256', kid: state.kid })
    .setSubject(String(user._id ?? user.id))
    .setIssuedAt()
    .sign(state.privateKey);
}
