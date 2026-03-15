import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '../generated/prisma';
import { logger } from '../utils/logger';

/**
 * Centralized error-handling middleware.
 * Catches all unhandled errors and returns a consistent JSON response.
 */
export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        code: 400,
        message: 'Request validation failed',
        details: err.flatten(),
      },
    });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: {
          code: 409,
          message: 'A record with the same unique value already exists.',
        },
      });
      return;
    }

    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: {
          code: 404,
          message: 'The requested record could not be found.',
        },
      });
      return;
    }
  }

  const statusCode = (err as Error & { statusCode?: number }).statusCode ?? 500;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode,
      message,
    },
  });
}
