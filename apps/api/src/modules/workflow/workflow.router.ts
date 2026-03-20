import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import { requireRole } from '../../shared/middleware/rbac';
import {
  createWorkflowTaskSchema,
  listWorkflowTasksQuerySchema,
  updateWorkflowTaskSchema,
} from './workflow.schemas';
import {
  createWorkflowTask,
  listWorkflowTasks,
  updateWorkflowTask,
} from './workflow.service';

const router = Router();
const requireWorkflowWriteRole = requireRole('Admin', 'HR.Manager');

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listWorkflowTasksQuerySchema.parse(req.query);
    const data = await listWorkflowTasks(query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/', requireWorkflowWriteRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createWorkflowTaskSchema.parse(req.body);
    const task = await createWorkflowTask(data);
    logger.info({ workflowTaskId: task.id, createdBy: req.user?.oid }, 'Workflow task created');
    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

router.put('/:id', requireWorkflowWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateWorkflowTaskSchema.parse(req.body);
    const task = await updateWorkflowTask(req.params.id, data);
    logger.info({ workflowTaskId: req.params.id, updatedBy: req.user?.oid }, 'Workflow task updated');
    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
});

export default router;
