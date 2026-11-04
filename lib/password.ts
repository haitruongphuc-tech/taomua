import crypto from 'node:crypto';

const PARAMS = { N: 16384, r: 8, p: 1 };

export function hashPassword(pw: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64, PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [alg, saltHex, hashHex] = stored.split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const hash = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64, PARAMS);
  const expected = Buffer.from(hashHex, 'hex');
  return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}
