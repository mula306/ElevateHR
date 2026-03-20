import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import { requireFeatureEnabled } from '../../shared/middleware/feature-access';
import {
  approvalRuleSetSchema,
  createHiringRecordSchema,
  createJobRequestSchema,
  fundingTypeSchema,
  listJobRequestsQuerySchema,
  listRuleSetsQuerySchema,
  requestDecisionSchema,
  requestTypeSchema,
  simulateApprovalRuleSetSchema,
  updateApprovalRuleSetSchema,
  updateFundingTypeSchema,
  updateHiringRecordSchema,
  updateJobRequestSchema,
  updateRequestTypeSchema,
} from './recruitment.schemas';
import {
  approveJobRequest,
  cancelJobRequest,
  createApprovalRuleSet,
  createFundingType,
  createHiringRecordForRequest,
  createJobRequest,
  createPositionFromApprovedRequest,
  createRequestType,
  getJobRequestById,
  getRecruitmentSummary,
  listApprovalRuleSets,
  listFundingTypes,
  listJobRequests,
  listRequestTypes,
  publishApprovalRuleSet,
  rejectJobRequest,
  reworkJobRequest,
  simulateApprovalRuleSet,
  submitJobRequest,
  updateApprovalRuleSet,
  updateFundingType,
  updateHiringRecord,
  updateJobRequest,
  updateRequestType,
} from './recruitment.service';

const router = Router();

function getContext(req: Request) {
  return {
    currentEmployeeId: req.account?.employeeId,
    currentAccountId: req.account?.id ?? null,
    currentAccount: req.account,
    roles: req.user?.roles ?? [],
    userId: req.user?.oid ?? req.account?.id ?? null,
  };
}

router.get('/summary', requireFeatureEnabled('recruitment_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getRecruitmentSummary(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/requests', requireFeatureEnabled('recruitment_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listJobRequestsQuerySchema.parse(req.query);
    const data = await listJobRequests(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/requests/:id', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = await getJobRequestById(req.params.id, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/requests', requireFeatureEnabled('recruitment_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = createJobRequestSchema.parse(req.body);
    const data = await createJobRequest(payload, getContext(req));
    logger.info({ requestId: data.id, createdBy: req.account?.id ?? req.user?.oid }, 'Job request created');
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/requests/:id', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = updateJobRequestSchema.parse(req.body);
    const data = await updateJobRequest(req.params.id, payload, getContext(req));
    logger.info({ requestId: data.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Job request updated');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:id/submit', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = await submitJobRequest(req.params.id, getContext(req));
    logger.info({ requestId: data.id, submittedBy: req.account?.id ?? req.user?.oid }, 'Job request submitted');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:id/rework', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = requestDecisionSchema.parse(req.body ?? {});
    const data = await reworkJobRequest(req.params.id, payload, getContext(req));
    logger.info({ requestId: data.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Job request moved back to draft');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:id/cancel', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = requestDecisionSchema.parse(req.body ?? {});
    const data = await cancelJobRequest(req.params.id, payload, getContext(req));
    logger.info({ requestId: data.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Job request cancelled');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:id/approve', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = requestDecisionSchema.parse(req.body ?? {});
    const data = await approveJobRequest(req.params.id, payload, getContext(req));
    logger.info({ requestId: data.id, approvedBy: req.account?.id ?? req.user?.oid }, 'Job request approval recorded');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:id/reject', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = requestDecisionSchema.parse(req.body ?? {});
    const data = await rejectJobRequest(req.params.id, payload, getContext(req));
    logger.info({ requestId: data.id, rejectedBy: req.account?.id ?? req.user?.oid }, 'Job request rejection recorded');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:id/create-position', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = await createPositionFromApprovedRequest(req.params.id, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/requests/:id/hiring', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = createHiringRecordSchema.parse(req.body);
    const data = await createHiringRecordForRequest(req.params.id, payload, getContext(req));
    logger.info({ requestId: data.id, createdBy: req.account?.id ?? req.user?.oid }, 'Hiring close-out created');
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/hiring/:id', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = updateHiringRecordSchema.parse(req.body);
    const data = await updateHiringRecord(req.params.id, payload, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/request-types', requireFeatureEnabled('recruitment_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listRequestTypes(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/request-types', requireFeatureEnabled('recruitment_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = requestTypeSchema.parse(req.body);
    const data = await createRequestType(payload, getContext(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/request-types/:id', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = updateRequestTypeSchema.parse(req.body);
    const data = await updateRequestType(req.params.id, payload, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/funding-types', requireFeatureEnabled('recruitment_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listFundingTypes(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/funding-types', requireFeatureEnabled('recruitment_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = fundingTypeSchema.parse(req.body);
    const data = await createFundingType(payload, getContext(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/funding-types/:id', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = updateFundingTypeSchema.parse(req.body);
    const data = await updateFundingType(req.params.id, payload, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/approval-rule-sets', requireFeatureEnabled('recruitment_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listRuleSetsQuerySchema.parse(req.query);
    const data = await listApprovalRuleSets(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/approval-rule-sets', requireFeatureEnabled('recruitment_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = approvalRuleSetSchema.parse(req.body);
    const data = await createApprovalRuleSet(payload, getContext(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/approval-rule-sets/:id', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = updateApprovalRuleSetSchema.parse(req.body);
    const data = await updateApprovalRuleSet(req.params.id, payload, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/approval-rule-sets/:id/publish', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = await publishApprovalRuleSet(req.params.id, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/approval-rule-sets/:id/simulate', requireFeatureEnabled('recruitment_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = simulateApprovalRuleSetSchema.parse(req.body);
    const data = await simulateApprovalRuleSet(req.params.id, payload, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
