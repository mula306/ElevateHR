import { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';

export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRoles = req.user?.roles ?? [];
    const hasRole = allowedRoles.some((role) => userRoles.includes(role));

    if (!hasRole) {
      logger.warn(
        { userId: req.user?.oid, requiredRoles: allowedRoles, userRoles },
        'RBAC: Access denied'
      );
      res.status(403).json({
        success: false,
        error: {
          code: 403,
          message: 'You do not have permission to perform this action',
        },
      });
      return;
    }

    next();
  };
}
