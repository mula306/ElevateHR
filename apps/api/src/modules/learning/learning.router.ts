import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import { requireAnyFeatureEnabled, requireFeatureEnabled } from '../../shared/middleware/feature-access';
import {
  createLearningAssignmentRuleSchema,
  createLearningAssignmentSchema,
  createLearningPathSchema,
  launchLearningAssignmentSchema,
  learningWebhookSchema,
  listLearningAssignmentsQuerySchema,
  listLearningCatalogQuerySchema,
  updateLearningAssignmentRuleSchema,
  updateLearningContentSkillsSchema,
  updateLearningAssignmentSchema,
  updateLearningPathSchema,
} from './learning.schemas';
import {
  cancelLearningAssignment,
  createLearningAssignment,
  createLearningAssignmentRule,
  createLearningPath,
  getLearningSummary,
  getMyLearningWorkspace,
  launchLearningAssignment,
  listLearningAssignmentRules,
  listLearningAssignments,
  listLearningCatalog,
  listLearningPaths,
  listLearningProviders,
  processLearningProviderWebhook,
  syncLearningProvider,
  updateLearningAssignment,
  updateLearningAssignmentRule,
  updateLearningContentSkills,
  updateLearningPath,
} from './learning.service';

const router = Router();

function getContext(req: Request) {
  return {
    currentEmployeeId: req.account?.employeeId,
    currentAccountId: req.account?.id,
    roles: req.user?.roles ?? [],
  };
}

router.get('/summary', requireFeatureEnabled('learning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getLearningSummary(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/my', requireFeatureEnabled('learning_self_service'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getMyLearningWorkspace(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/catalog', requireFeatureEnabled('learning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listLearningCatalogQuerySchema.parse(req.query);
    const data = await listLearningCatalog(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/catalog/:id/skills', requireFeatureEnabled('learning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateLearningContentSkillsSchema.parse(req.body);
    const content = await updateLearningContentSkills(req.params.id, data, getContext(req));
    logger.info({ contentId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Learning content skills updated');
    res.json({ success: true, data: content });
  } catch (error) {
    next(error);
  }
});

router.get('/assignments', requireFeatureEnabled('learning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listLearningAssignmentsQuerySchema.parse(req.query);
    const data = await listLearningAssignments(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/assignments', requireFeatureEnabled('learning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createLearningAssignmentSchema.parse(req.body);
    const assignment = await createLearningAssignment(data, getContext(req));
    logger.info({ assignmentId: assignment?.id, createdBy: req.account?.id ?? req.user?.oid }, 'Learning assignment created');
    res.status(201).json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
});

router.put('/assignments/:id', requireFeatureEnabled('learning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateLearningAssignmentSchema.parse(req.body);
    const assignment = await updateLearningAssignment(req.params.id, data, getContext(req));
    logger.info({ assignmentId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Learning assignment updated');
    res.json({ success: true, data: assignment });
  } catch (error) {
    next(error);
  }
});

router.post('/assignments/:id/cancel', requireFeatureEnabled('learning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    await cancelLearningAssignment(req.params.id, getContext(req));
    logger.info({ assignmentId: req.params.id, cancelledBy: req.account?.id ?? req.user?.oid }, 'Learning assignment cancelled');
    res.json({ success: true, data: { id: req.params.id } });
  } catch (error) {
    next(error);
  }
});

router.post('/assignments/:id/launch', requireFeatureEnabled('learning_self_service'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = launchLearningAssignmentSchema.parse(req.body ?? {});
    const launch = await launchLearningAssignment(req.params.id, data, getContext(req));
    res.json({ success: true, data: launch });
  } catch (error) {
    next(error);
  }
});

router.get('/paths', requireFeatureEnabled('learning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listLearningPaths(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/paths', requireFeatureEnabled('learning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createLearningPathSchema.parse(req.body);
    const path = await createLearningPath(data, getContext(req));
    logger.info({ pathId: path?.id, createdBy: req.account?.id ?? req.user?.oid }, 'Learning path created');
    res.status(201).json({ success: true, data: path });
  } catch (error) {
    next(error);
  }
});

router.put('/paths/:id', requireFeatureEnabled('learning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateLearningPathSchema.parse(req.body);
    const path = await updateLearningPath(req.params.id, data, getContext(req));
    logger.info({ pathId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Learning path updated');
    res.json({ success: true, data: path });
  } catch (error) {
    next(error);
  }
});

router.get('/rules', requireFeatureEnabled('learning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listLearningAssignmentRules(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/rules', requireFeatureEnabled('learning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createLearningAssignmentRuleSchema.parse(req.body);
    const rule = await createLearningAssignmentRule(data, getContext(req));
    logger.info({ ruleId: rule?.id, createdBy: req.account?.id ?? req.user?.oid }, 'Learning rule created');
    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

router.put('/rules/:id', requireFeatureEnabled('learning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateLearningAssignmentRuleSchema.parse(req.body);
    const rule = await updateLearningAssignmentRule(req.params.id, data, getContext(req));
    logger.info({ ruleId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Learning rule updated');
    res.json({ success: true, data: rule });
  } catch (error) {
    next(error);
  }
});

router.get('/providers', requireFeatureEnabled('learning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listLearningProviders(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/providers/:id/sync', requireFeatureEnabled('learning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = await syncLearningProvider(req.params.id, getContext(req));
    logger.info({ providerId: req.params.id, syncedBy: req.account?.id ?? req.user?.oid }, 'Learning provider sync completed');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/providers/:id/webhook', requireAnyFeatureEnabled(['learning_management', 'learning_self_service']), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = learningWebhookSchema.parse(req.body);
    const result = await processLearningProviderWebhook(req.params.id, data);
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
