import crypto from 'node:crypto';

// No 0/O/1/I to avoid confusion when read aloud or typed.
export const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `TFX-${s}`;
}
