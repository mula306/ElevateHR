import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { env } from '../config/env';
import { logger } from '../utils/logger';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        oid: string;
        name: string;
        email: string;
        roles: string[];
      };
    }
  }
}

// JWKS client for Entra ID token verification
const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

/**
 * Middleware to validate Entra ID JWT tokens.
 * In dev mode with AUTH_BYPASS=true, assigns a mock admin user.
 */
export function authenticate(req: Request, res: Response, next: NextFunction): void {
  // Dev bypass mode
  if (env.AUTH_BYPASS === 'true' && env.NODE_ENV === 'development') {
    req.user = {
      oid: 'dev-user-001',
      name: 'Dev Admin',
      email: 'admin@elevatehr.dev',
      roles: ['Admin'],
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { code: 401, message: 'Missing or invalid authorization header' },
    });
    return;
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(
    token,
    getKey,
    {
      audience: env.AZURE_CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/v2.0`,
      algorithms: ['RS256'],
    },
    (err, decoded) => {
      if (err) {
        logger.warn({ err: err.message }, 'JWT verification failed');
        res.status(401).json({
          success: false,
          error: { code: 401, message: 'Invalid or expired token' },
        });
        return;
      }

      const payload = decoded as Record<string, any>;
      req.user = {
        oid: payload.oid || payload.sub || '',
        name: payload.name || '',
        email: payload.preferred_username || payload.email || '',
        roles: payload.roles || [],
      };

      next();
    }
  );
}
