import { NextFunction, Request, Response } from 'express';
import { type FeatureKey, getFeatureStateRecord, isFeatureEnabled } from '../lib/features';
import { createFeatureDisabledError } from '../lib/service-utils';

export function requireFeatureEnabled(featureKey: FeatureKey, message?: string) {
  return async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      const featureStates = await getFeatureStateRecord();

      if (!isFeatureEnabled(featureStates, featureKey)) {
        next(createFeatureDisabledError(featureKey, message));
        return;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAnyFeatureEnabled(featureKeys: FeatureKey[], message?: string) {
  return async (_req: Request, _res: Response, next: NextFunction) => {
    try {
      const featureStates = await getFeatureStateRecord();

      if (featureKeys.some((featureKey) => isFeatureEnabled(featureStates, featureKey))) {
        next();
        return;
      }

      next(createFeatureDisabledError(featureKeys[0], message));
    } catch (error) {
      next(error);
    }
  };
}

