import { SignJWT, jwtVerify } from 'jose';
import { getStaffSecret } from '../keys.js';
import { HttpError } from '../lib/errors.js';

export function signStaffToken(staff) {
  return new SignJWT({ username: staff.username, name: staff.name || '', role: staff.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(staff._id))
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(getStaffSecret());
}

export async function requireStaff(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) throw new HttpError(401, 'Missing staff token');
  try {
    const { payload } = await jwtVerify(token, getStaffSecret(), { algorithms: ['HS256'] });
    req.staff = { id: payload.sub, username: payload.username, name: payload.name, role: payload.role };
  } catch {
    throw new HttpError(401, 'Invalid or expired staff token');
  }
  next();
}

export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.staff || !roles.includes(req.staff.role)) throw new HttpError(403, 'Insufficient permissions');
  next();
};
