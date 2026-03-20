import { NextFunction, Request, Response, Router } from 'express';
import { getCurrentSession } from '../session/session.service';
import { searchQuerySchema } from './search.schemas';
import { searchGlobal } from './search.service';

const router = Router();

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = searchQuerySchema.parse(req.query);
    const session = await getCurrentSession(req);
    const data = await searchGlobal(query, {
      currentAccount: req.account,
      visibleRoutes: session.access.visibleRoutes,
      roles: req.user?.roles ?? [],
      features: session.features,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
