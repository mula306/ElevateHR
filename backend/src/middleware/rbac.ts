import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * RBAC middleware factory. Returns middleware that checks if the
 * authenticated user has at least one of the specified roles.
 *
 * Roles are sourced from Entra ID App Roles:
 *   - Admin: Full CRUD, manage settings
 *   - HR.Manager: Create, Read, Update (no delete)
 *   - HR.Viewer: Read-only access
 */
export function requireRole(...allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const userRoles = req.user?.roles || [];

    const hasRole = allowedRoles.some(role => userRoles.includes(role));

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
