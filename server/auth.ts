import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { getDb } from './db.ts';

const JWT_SECRET =
  process.env.JWT_SECRET || 'shopkart-jwt-development-secret-2026-change-in-prod';

export interface AuthPayload {
  id: string;
  email: string;
  role: 'customer' | 'super_admin' | 'admin' | 'manager';
  type: 'customer' | 'admin';
}

export interface AuthedRequest extends Request {
  auth?: AuthPayload;
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return null;
  return header.slice(7).trim();
}

export function requireCustomer(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required. Please sign in.' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'customer') {
    res.status(401).json({ error: 'Invalid or expired customer session.' });
    return;
  }
  const db = getDb();
  const user = db.users.find((u) => u.id === payload.id);
  if (!user) {
    res.status(401).json({ error: 'Customer account not found.' });
    return;
  }
  if (user.isBlocked) {
    res.status(403).json({
      error: 'Your account has been suspended. Please contact support.',
    });
    return;
  }
  req.auth = payload;
  next();
}

export function requireAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Admin authentication required.' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload || payload.type !== 'admin') {
    res.status(401).json({ error: 'Invalid or expired admin session.' });
    return;
  }
  const db = getDb();
  const admin = db.admins.find((a) => a.id === payload.id);
  if (!admin || !admin.isActive) {
    res.status(403).json({ error: 'Admin account is inactive or unauthorized.' });
    return;
  }
  req.auth = { ...payload, role: admin.role };
  next();
}

export function requireSuperAdmin(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
): void {
  requireAdmin(req, res, () => {
    if (req.auth?.role !== 'super_admin') {
      res.status(403).json({
        error:
          'Super Admin privileges are required to modify payment accounts or security configuration.',
      });
      return;
    }
    next();
  });
}

// Simple in-memory sliding window rate limiter for sensitive endpoints
const rateBuckets = new Map<string, number[]>();

export function rateLimit(maxRequests = 40, windowMs = 60_000) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `${req.ip || 'local'}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const hits = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
    if (hits.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
      });
      return;
    }
    hits.push(now);
    rateBuckets.set(key, hits);
    next();
  };
}
