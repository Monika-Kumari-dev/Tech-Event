// Prints the secret environment variables for a production deploy (Render / Railway / any host).
//   npm run deploy-env            → NEW signing key (use for a fresh production launch)
//   npm run deploy-env -- --local → reuse server/keys/private.jwk.json (keeps passes issued locally valid)
import fs from 'node:fs';
import crypto from 'node:crypto';
import { generateKeyPair, exportJWK, calculateJwkThumbprint } from 'jose';

let jwk;
if (process.argv.includes('--local')) {
  jwk = JSON.parse(fs.readFileSync(new URL('../keys/private.jwk.json', import.meta.url), 'utf8'));
} else {
  const { privateKey } = await generateKeyPair('ES256', { extractable: true });
  jwk = await exportJWK(privateKey);
  const { d, ...pub } = jwk;
  jwk = { ...jwk, kid: (await calculateJwkThumbprint(pub, 'sha256')).slice(0, 8), alg: 'ES256', use: 'sig' };
}

console.log('\nAdd these as environment variables on your backend host (keep them SECRET, back them up):\n');
console.log(`QR_PRIVATE_JWK=${Buffer.from(JSON.stringify(jwk)).toString('base64')}`);
console.log(`JWT_SECRET=${crypto.randomBytes(48).toString('base64url')}`);
console.log(`\n(kid=${jwk.kid}) — losing QR_PRIVATE_JWK invalidates every QR pass issued with it.\n`);
