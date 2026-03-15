import { NextFunction, Request, Response } from 'express';
import jsonwebtoken from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { env } from '../config/env';
import { logger } from '../lib/logger';

const client = jwksClient({
  jwksUri: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/discovery/v2.0/keys`,
  cache: true,
  rateLimit: true,
});

function getSingleClaim(value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value[0] ?? '';
  }

  return value ?? '';
}

function getKey(header: jsonwebtoken.JwtHeader, callback: jsonwebtoken.SigningKeyCallback) {
  client.getSigningKey(header.kid, (error, key) => {
    if (error) {
      callback(error);
      return;
    }

    callback(null, key?.getPublicKey());
  });
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  if (env.AUTH_BYPASS === 'true' && env.NODE_ENV === 'development') {
    req.user = {
      oid: 'dev-user-001',
      name: 'Dev Admin',
      email: 'admin@elevatehr.dev',
      roles: ['Admin'],
    };
    next();
    return;
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
  jsonwebtoken.verify(
    token,
    getKey,
    {
      audience: env.AZURE_CLIENT_ID,
      issuer: `https://login.microsoftonline.com/${env.AZURE_TENANT_ID}/v2.0`,
      algorithms: ['RS256'],
    },
    (error, decoded) => {
      if (error) {
        logger.warn({ error: error.message }, 'JWT verification failed');
        res.status(401).json({
          success: false,
          error: { code: 401, message: 'Invalid or expired token' },
        });
        return;
      }

      const payload = decoded as Record<string, string | string[] | undefined>;
      req.user = {
        oid: getSingleClaim(payload.oid) || getSingleClaim(payload.sub),
        name: getSingleClaim(payload.name),
        email: getSingleClaim(payload.preferred_username) || getSingleClaim(payload.email),
        roles: Array.isArray(payload.roles) ? payload.roles : [],
      };
      next();
    }
  );
}
