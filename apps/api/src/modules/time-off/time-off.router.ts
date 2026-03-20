import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import { requireFeatureEnabled } from '../../shared/middleware/feature-access';
import { requireRole } from '../../shared/middleware/rbac';
import {
  cancelLeaveRequestSchema,
  createLeaveRequestSchema,
  leaveDecisionSchema,
  listLeaveRequestsQuerySchema,
  updateLeaveRequestSchema,
} from './time-off.schemas';
import {
  approveLeaveRequest,
  cancelLeaveRequest,
  createLeaveRequest,
  listHolidays,
  listLeaveRequests,
  listLeaveTypes,
  rejectLeaveRequest,
  updateLeaveRequest,
} from './time-off.service';

const router = Router();
const requireTimeOffWriteRole = requireRole('Admin', 'HR.Manager');

router.get('/leave-types', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listLeaveTypes();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/holidays', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listHolidays();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/leave-requests', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listLeaveRequestsQuerySchema.parse(req.query);
    const result = await listLeaveRequests(query, req.account?.employeeId);
    res.json({ success: true, ...result });
  } catch (error) {
    next(error);
  }
});

router.post('/leave-requests', requireFeatureEnabled('time_off_requests'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createLeaveRequestSchema.parse(req.body);
    const leaveRequest = await createLeaveRequest(data, {
      requesterEmployeeId: req.account?.employeeId,
      userId: req.user?.oid ?? req.account?.id,
    });
    logger.info({ leaveRequestId: leaveRequest.id, createdBy: req.user?.oid }, 'Leave request created');
    res.status(201).json({ success: true, data: leaveRequest });
  } catch (error) {
    next(error);
  }
});

router.put('/leave-requests/:id', requireFeatureEnabled('time_off_requests'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateLeaveRequestSchema.parse(req.body);
    const leaveRequest = await updateLeaveRequest(req.params.id, data, {
      requesterEmployeeId: req.account?.employeeId,
      userId: req.user?.oid ?? req.account?.id,
    });
    logger.info({ leaveRequestId: req.params.id, updatedBy: req.user?.oid }, 'Leave request updated');
    res.json({ success: true, data: leaveRequest });
  } catch (error) {
    next(error);
  }
});

router.post('/leave-requests/:id/cancel', requireFeatureEnabled('time_off_requests'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = cancelLeaveRequestSchema.parse(req.body);
    const leaveRequest = await cancelLeaveRequest(req.params.id, data, {
      requesterEmployeeId: req.account?.employeeId,
      userId: req.user?.oid ?? req.account?.id,
    });
    logger.info({ leaveRequestId: req.params.id, cancelledBy: req.user?.oid ?? req.account?.id }, 'Leave request cancelled');
    res.json({ success: true, data: leaveRequest });
  } catch (error) {
    next(error);
  }
});

router.post('/leave-requests/:id/approve', requireFeatureEnabled('time_off_requests'), requireTimeOffWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = leaveDecisionSchema.parse(req.body);
    const leaveRequest = await approveLeaveRequest(req.params.id, data, req.account?.employeeId);
    logger.info({ leaveRequestId: req.params.id, approvedBy: req.user?.oid }, 'Leave request approved');
    res.json({ success: true, data: leaveRequest });
  } catch (error) {
    next(error);
  }
});

router.post('/leave-requests/:id/reject', requireFeatureEnabled('time_off_requests'), requireTimeOffWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = leaveDecisionSchema.parse(req.body);
    const leaveRequest = await rejectLeaveRequest(req.params.id, data, req.account?.employeeId);
    logger.info({ leaveRequestId: req.params.id, rejectedBy: req.user?.oid }, 'Leave request rejected');
    res.json({ success: true, data: leaveRequest });
  } catch (error) {
    next(error);
  }
});

export default router;
