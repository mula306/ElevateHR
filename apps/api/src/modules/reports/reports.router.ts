import { NextFunction, Request, Response, Router } from 'express';
import { requireFeatureEnabled } from '../../shared/middleware/feature-access';
import { getLearningReports, getOperationalReports } from './reports.service';

const router = Router();

router.get('/operations', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getOperationalReports();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/learning', requireFeatureEnabled('learning_management'), async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getLearningReports();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
