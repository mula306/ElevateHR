import { NextFunction, Request, Response } from 'express';
import jsonwebtoken from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { env } from '../config/env';
import { DEV_ACCOUNT_HEADER, resolveDevAccount, resolveOrProvisionAccount } from '../lib/accounts';
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

function getScopes(payload: Record<string, string | string[] | undefined>) {
  const rawScopes = getSingleClaim(payload.scp);
  return rawScopes.split(' ').map((scope) => scope.trim()).filter(Boolean);
}

function hasRequiredScope(scopes: string[], roles: string[]) {
  if (roles.length > 0) {
    return true;
  }

  if (!env.AZURE_API_SCOPE) {
    return true;
  }

  return scopes.includes(env.AZURE_API_SCOPE);
}

function getDevRoles(account: Express.Request['account'] | null) {
  if (!account) {
    return ['Admin'];
  }

  if (account.email === 'hr.admin@elevatehr.dev') {
    return ['Admin'];
  }

  if (account.queueMemberships.includes('HR_OPERATIONS') && account.employee?.department === 'People & Culture') {
    return ['HR.Manager'];
  }

  return [];
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
    void (async () => {
      const devAccountId = typeof req.headers[DEV_ACCOUNT_HEADER] === 'string'
        ? req.headers[DEV_ACCOUNT_HEADER]
        : undefined;
      const account = await resolveDevAccount(devAccountId);
      const roles = getDevRoles(account);

      req.account = account ?? undefined;
      req.user = {
        oid: account?.entraObjectId ?? account?.id ?? 'dev-user-001',
        name: account?.displayName ?? 'Dev Admin',
        email: account?.email ?? 'admin@elevatehr.dev',
        roles,
        scopes: [env.AZURE_API_SCOPE],
      };
      next();
    })().catch((error) => {
      logger.error({ error }, 'Failed to resolve development account');
      res.status(500).json({
        success: false,
        error: { code: 500, message: 'Unable to resolve development account' },
      });
    });
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
      const roles = Array.isArray(payload.roles) ? payload.roles : [];
      const scopes = getScopes(payload);

      if (!hasRequiredScope(scopes, roles)) {
        logger.warn({ scopes, requiredScope: env.AZURE_API_SCOPE }, 'Missing required API scope');
        res.status(403).json({
          success: false,
          error: { code: 403, message: 'Missing required API scope' },
        });
        return;
      }

      const identity = {
        oid: getSingleClaim(payload.oid) || getSingleClaim(payload.sub),
        name: getSingleClaim(payload.name),
        email: getSingleClaim(payload.preferred_username) || getSingleClaim(payload.email),
        roles,
      };

      void (async () => {
        const account = await resolveOrProvisionAccount(identity);

        req.user = {
          ...identity,
          roles,
          scopes,
        };
        req.account = account ?? undefined;
        next();
      })().catch((accountError) => {
        logger.error({ error: accountError }, 'Failed to resolve app account');
        res.status(500).json({
          success: false,
          error: { code: 500, message: 'Unable to resolve account for this request' },
        });
      });
    }
  );
}
