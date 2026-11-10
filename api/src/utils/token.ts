import crypto from 'crypto';
import { config } from '../config.js';

export interface AdminTokenPayload {
  userId: string;
  expiresAt: number; // unix timestamp in seconds
}

/**
 * Generates an HMAC-signed admin token valid for 3 days by default (259200s).
 */
export function generateAdminToken(userId: string, expiresInSeconds: number = 259200): { token: string; expiresAt: number } {
  const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
  const data = `${userId}.${expiresAt}`;
  const hmac = crypto.createHmac('sha256', config.API_KEY).update(data).digest('hex');
  return {
    token: `${data}.${hmac}`,
    expiresAt,
  };
}

/**
 * Verifies an HMAC-signed admin token.
 */
export function verifyAdminToken(token: string): { valid: boolean; userId?: string; expiresAt?: number } {
  if (!token || typeof token !== 'string') return { valid: false };
  const parts = token.split('.');
  if (parts.length !== 3) return { valid: false };

  const [userId, expiresAtStr, signature] = parts;
  const expiresAt = parseInt(expiresAtStr, 10);
  if (isNaN(expiresAt)) return { valid: false };

  // Check expiration (with 10s grace period for clock skew)
  if (Math.floor(Date.now() / 1000) > expiresAt + 10) {
    return { valid: false, userId, expiresAt };
  }

  const expectedSignature = crypto.createHmac('sha256', config.API_KEY).update(`${userId}.${expiresAt}`).digest('hex');

  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false };
    }
  } catch {
    return { valid: false };
  }

  return { valid: true, userId, expiresAt };
}
