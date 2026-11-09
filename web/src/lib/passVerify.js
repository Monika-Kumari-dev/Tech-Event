// Offline verification of QR pass tokens (compact ES256 JWS, see CONTRACT.md).
import { importJWK, jwtVerify, decodeProtectedHeader } from 'jose';

let cached = { sig: null, key: null };

async function getKey(publicKey) {
  const jwk = publicKey?.jwk || publicKey;
  const sig = JSON.stringify(jwk);
  if (cached.sig !== sig) {
    cached = { sig, key: await importJWK(jwk, 'ES256') };
  }
  return cached.key;
}

const JWS_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export function looksLikeToken(text) {
  return JWS_RE.test(String(text || '').trim());
}

/**
 * @param {string} text scanned QR content
 * @param {{kid?:string, jwk:object}} publicKey from the snapshot
 * @returns {Promise<{ok:true,payload:{sub:string,code:string,name:string}} | {ok:false,reason:'invalid'|'malformed'|'wrong-key'|'no-key'}>}
 */
export async function verifyPass(text, publicKey) {
  const token = String(text || '').trim();
  if (!looksLikeToken(token)) return { ok: false, reason: 'malformed' };
  if (!publicKey?.jwk && !publicKey?.kty) return { ok: false, reason: 'no-key' };

  let header;
  try {
    header = decodeProtectedHeader(token);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (header.alg !== 'ES256') return { ok: false, reason: 'invalid' };
  if (publicKey.kid && header.kid && header.kid !== publicKey.kid) return { ok: false, reason: 'wrong-key' };

  let key;
  try {
    key = await getKey(publicKey);
  } catch {
    return { ok: false, reason: 'no-key' };
  }

  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['ES256'] });
    if (!payload.sub || !payload.code) return { ok: false, reason: 'malformed' };
    return { ok: true, payload: { sub: String(payload.sub), code: String(payload.code), name: String(payload.name || '') } };
  } catch (e) {
    const code = e?.code || '';
    if (code === 'ERR_JWS_INVALID' || code === 'ERR_JWT_INVALID') return { ok: false, reason: 'malformed' };
    return { ok: false, reason: 'invalid' };
  }
}

export const reasonText = {
  invalid: 'The signature does not match. This pass was not issued by us or has been altered.',
  malformed: 'This QR code is not a Teck Fluence X pass.',
  'wrong-key': 'This pass was signed with a different key (another event or an outdated list). Sync and try again.',
  'no-key': 'No verification key on this device yet. Download the attendee list first.',
};
