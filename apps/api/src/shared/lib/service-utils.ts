import { Prisma } from '../../generated/prisma';
import type { FeatureKey } from './features';

export function createHttpError(statusCode: number, message: string, details?: Record<string, unknown>) {
  const error = new Error(message) as Error & {
    statusCode: number;
    errorType?: string;
    details?: Record<string, unknown>;
  };
  error.statusCode = statusCode;

  if (details) {
    error.details = details;
  }

  return error;
}

export function createFeatureDisabledError(featureKey: FeatureKey, message?: string) {
  const error = createHttpError(
    423,
    message ?? 'This feature is currently unavailable because it has been disabled by your administrator.',
    { featureKey },
  ) as Error & {
    statusCode: number;
    errorType?: string;
    details?: Record<string, unknown>;
  };
  error.errorType = 'FEATURE_DISABLED';
  return error;
}

export function decimalToNumber(value: Prisma.Decimal | number | string) {
  return Number(value);
}

export function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function trimToNull(value: string | null | undefined) {
  if (value === undefined || value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toDateValue(value: string | Date | null | undefined) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}
