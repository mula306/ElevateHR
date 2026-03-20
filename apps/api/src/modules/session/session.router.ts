import { NextFunction, Request, Response, Router } from 'express';
import { getCurrentSession } from './session.service';

const router = Router();

router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getCurrentSession(req);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
