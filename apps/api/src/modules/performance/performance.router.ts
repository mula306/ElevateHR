import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import { requireAnyFeatureEnabled, requireFeatureEnabled } from '../../shared/middleware/feature-access';
import {
  acknowledgePerformanceReviewSchema,
  createPerformanceCycleSchema,
  createPerformanceGoalSchema,
  createPerformanceGoalUpdateSchema,
  listPerformanceGoalsQuerySchema,
  listPerformanceReviewsQuerySchema,
  updateManagerReviewSchema,
  updatePerformanceCycleSchema,
  updatePerformanceGoalSchema,
  updateSelfReviewSchema,
} from './performance.schemas';
import {
  acknowledgePerformanceReview,
  createPerformanceCycle,
  createPerformanceGoal,
  createPerformanceGoalUpdate,
  finalizePerformanceReview,
  getPerformanceReviewById,
  getPerformanceSummary,
  listPerformanceCycles,
  listPerformanceGoals,
  listPerformanceReviews,
  publishPerformanceCycle,
  updateManagerReview,
  updatePerformanceCycle,
  updatePerformanceGoal,
  updateSelfReview,
} from './performance.service';

const router = Router();

function getContext(req: Request) {
  return {
    currentEmployeeId: req.account?.employeeId,
    roles: req.user?.roles ?? [],
    userId: req.user?.oid ?? req.account?.id,
  };
}

router.get('/summary', requireAnyFeatureEnabled(['planning_management', 'planning_self_service']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getPerformanceSummary(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/cycles', requireFeatureEnabled('planning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listPerformanceCycles(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/cycles', requireFeatureEnabled('planning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createPerformanceCycleSchema.parse(req.body);
    const cycle = await createPerformanceCycle(data, getContext(req));
    logger.info({ cycleId: cycle.id, createdBy: req.user?.oid ?? req.account?.id }, 'Performance cycle created');
    res.status(201).json({ success: true, data: cycle });
  } catch (error) {
    next(error);
  }
});

router.put('/cycles/:id', requireFeatureEnabled('planning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updatePerformanceCycleSchema.parse(req.body);
    const cycle = await updatePerformanceCycle(req.params.id, data, getContext(req));
    logger.info({ cycleId: cycle.id, updatedBy: req.user?.oid ?? req.account?.id }, 'Performance cycle updated');
    res.json({ success: true, data: cycle });
  } catch (error) {
    next(error);
  }
});

router.post('/cycles/:id/publish', requireFeatureEnabled('planning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const cycle = await publishPerformanceCycle(req.params.id, getContext(req));
    logger.info({ cycleId: cycle.id, publishedBy: req.user?.oid ?? req.account?.id }, 'Performance cycle published');
    res.json({ success: true, data: cycle });
  } catch (error) {
    next(error);
  }
});

router.get('/reviews', requireAnyFeatureEnabled(['planning_management', 'planning_self_service']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listPerformanceReviewsQuerySchema.parse(req.query);
    const data = await listPerformanceReviews(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/reviews/:id', requireAnyFeatureEnabled(['planning_management', 'planning_self_service']), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = await getPerformanceReviewById(req.params.id, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/reviews/:id/self-review', requireFeatureEnabled('planning_self_service'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateSelfReviewSchema.parse(req.body);
    const review = await updateSelfReview(req.params.id, data, getContext(req));
    logger.info({ reviewId: review.id, employeeId: req.account?.employeeId }, 'Performance self-review submitted');
    res.json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
});

router.put('/reviews/:id/manager-review', requireFeatureEnabled('planning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateManagerReviewSchema.parse(req.body);
    const review = await updateManagerReview(req.params.id, data, getContext(req));
    logger.info({ reviewId: review.id, managerId: req.account?.employeeId }, 'Performance manager review updated');
    res.json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
});

router.post('/reviews/:id/finalize', requireFeatureEnabled('planning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const review = await finalizePerformanceReview(req.params.id, getContext(req));
    logger.info({ reviewId: review.id, finalizedBy: req.account?.employeeId ?? req.user?.oid }, 'Performance review finalized');
    res.json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
});

router.post('/reviews/:id/acknowledge', requireFeatureEnabled('planning_self_service'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = acknowledgePerformanceReviewSchema.parse(req.body);
    const review = await acknowledgePerformanceReview(req.params.id, data, getContext(req));
    logger.info({ reviewId: review.id, employeeId: req.account?.employeeId }, 'Performance review acknowledged');
    res.json({ success: true, data: review });
  } catch (error) {
    next(error);
  }
});

router.get('/goals', requireAnyFeatureEnabled(['planning_management', 'planning_self_service']), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listPerformanceGoalsQuerySchema.parse(req.query);
    const data = await listPerformanceGoals(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/goals', requireFeatureEnabled('planning_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createPerformanceGoalSchema.parse(req.body);
    const goal = await createPerformanceGoal(data, getContext(req));
    logger.info({ goalId: goal.id, createdBy: req.account?.employeeId ?? req.user?.oid }, 'Performance goal created');
    res.status(201).json({ success: true, data: goal });
  } catch (error) {
    next(error);
  }
});

router.put('/goals/:id', requireFeatureEnabled('planning_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updatePerformanceGoalSchema.parse(req.body);
    const goal = await updatePerformanceGoal(req.params.id, data, getContext(req));
    logger.info({ goalId: goal.id, updatedBy: req.account?.employeeId ?? req.user?.oid }, 'Performance goal updated');
    res.json({ success: true, data: goal });
  } catch (error) {
    next(error);
  }
});

router.post('/goals/:id/updates', requireFeatureEnabled('planning_self_service'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = createPerformanceGoalUpdateSchema.parse(req.body);
    const goal = await createPerformanceGoalUpdate(req.params.id, data, getContext(req));
    logger.info({ goalId: goal.id, updatedBy: req.account?.employeeId }, 'Performance goal progress updated');
    res.json({ success: true, data: goal });
  } catch (error) {
    next(error);
  }
});

export default router;
