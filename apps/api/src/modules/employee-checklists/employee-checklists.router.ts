import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import { requireRole } from '../../shared/middleware/rbac';
import {
  createEmployeeChecklistSchema,
  listEmployeeChecklistsQuerySchema,
  updateChecklistItemSchema,
} from './employee-checklists.schemas';
import {
  createEmployeeChecklist,
  listChecklistTemplates,
  listEmployeeChecklists,
  updateChecklistItem,
} from './employee-checklists.service';

const router = Router();
const requireChecklistWriteRole = requireRole('Admin', 'HR.Manager');

router.get('/templates', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listChecklistTemplates();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listEmployeeChecklistsQuerySchema.parse(req.query);
    const data = await listEmployeeChecklists(query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireChecklistWriteRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createEmployeeChecklistSchema.parse(req.body);
    const checklist = await createEmployeeChecklist(data);
    logger.info({ checklistId: checklist.id, createdBy: req.user?.oid }, 'Employee checklist created');
    res.status(201).json({ success: true, data: checklist });
  } catch (error) {
    next(error);
  }
});

router.put('/items/:id', requireChecklistWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateChecklistItemSchema.parse(req.body);
    const checklist = await updateChecklistItem(req.params.id, data);
    logger.info({ checklistItemId: req.params.id, updatedBy: req.user?.oid }, 'Checklist item updated');
    res.json({ success: true, data: checklist });
  } catch (error) {
    next(error);
  }
});

export default router;
