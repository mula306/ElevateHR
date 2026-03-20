import { NextFunction, Request, Response } from 'express';
import { Prisma } from '../../generated/prisma';
import { ZodError } from 'zod';
import { logger } from '../lib/logger';

export function errorHandler(err: Error, req: Request, res: Response, _next: NextFunction): void {
  logger.error({ err, path: req.path, method: req.method }, 'Unhandled error');

  if (err instanceof ZodError) {
    const details = err.flatten();
    const firstValidationMessage = [
      ...details.formErrors,
      ...Object.values(details.fieldErrors).flat().filter(Boolean),
    ][0] ?? 'Request validation failed';

    res.status(400).json({
      success: false,
      error: {
        code: 400,
        message: firstValidationMessage,
        details,
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
  const errorType = (err as Error & { errorType?: string }).errorType;
  const details = (err as Error & { details?: Record<string, unknown> }).details;
  const message = statusCode === 500 ? 'Internal server error' : err.message;

  res.status(statusCode).json({
    success: false,
    error: {
      code: statusCode,
      type: errorType,
      message,
      details,
    },
  });
}
