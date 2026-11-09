import { HttpError } from './errors.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+={0,2}$/;
export const MAX_PHOTO_CHARS = 280_000; // ~200KB of binary once base64-encoded

export const normalizeEmail = (v) => (typeof v === 'string' ? v.trim().toLowerCase() : '');
export const normalizePhone = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '') : '');

export function validateRegistration(body = {}) {
  const fullName = typeof body.fullName === 'string' ? body.fullName.trim().replace(/\s+/g, ' ') : '';
  if (fullName.length < 2 || fullName.length > 80) throw new HttpError(400, 'Full name must be 2–80 characters', 'fullName');

  const email = normalizeEmail(body.email);
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(400, 'Enter a valid email address', 'email');

  const phone = normalizePhone(body.phone);
  if (phone.length < 10 || phone.length > 15) throw new HttpError(400, 'Phone must have 10–15 digits', 'phone');

  let organization = '';
  if (body.organization != null) {
    if (typeof body.organization !== 'string') throw new HttpError(400, 'Organization must be text', 'organization');
    organization = body.organization.trim();
    if (organization.length > 100) throw new HttpError(400, 'Organization must be at most 100 characters', 'organization');
  }

  let photo = null;
  if (body.photo != null && body.photo !== '') {
    if (typeof body.photo !== 'string' || !PHOTO_RE.test(body.photo)) {
      throw new HttpError(400, 'Photo must be a JPEG, PNG or WebP image', 'photo');
    }
    if (body.photo.length > MAX_PHOTO_CHARS) throw new HttpError(400, 'Photo is too large (max ~200KB)', 'photo');
    photo = body.photo;
  }

  return { fullName, email, phone, organization, photo };
}

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
