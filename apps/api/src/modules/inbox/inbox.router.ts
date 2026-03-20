import { NextFunction, Request, Response, Router } from 'express';
import { listInboxItemsQuerySchema } from './inbox.schemas';
import { getInboxSummary, listInboxItems } from './inbox.service';

const router = Router();

router.get('/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getInboxSummary(req.account);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/items', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listInboxItemsQuerySchema.parse(req.query);
    const result = await listInboxItems(req.account, query);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

export default router;
