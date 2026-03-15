import { NextFunction, Request, Response, Router } from 'express';
import { getDashboardSummary } from './dashboard.service';

const router = Router();

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getDashboardSummary();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
