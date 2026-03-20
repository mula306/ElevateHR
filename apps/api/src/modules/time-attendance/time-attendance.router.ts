import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import { requireFeatureEnabled } from '../../shared/middleware/feature-access';
import {
  createLaborGroupSchema,
  createRuleProfileSchema,
  createScheduleSchema,
  createShiftTemplateSchema,
  listManagementExceptionsQuerySchema,
  listManagementSchedulesQuerySchema,
  listManagementTimeCardsQuerySchema,
  myTimeCardQuerySchema,
  scheduleRangeQuerySchema,
  timeCardDecisionSchema,
  updateLaborGroupSchema,
  updateRuleProfileSchema,
  updateScheduleSchema,
  updateShiftTemplateSchema,
  updateTimeCardEntriesSchema,
} from './time-attendance.schemas';
import {
  approveManagementTimeCard,
  createLaborGroup,
  createManagementSchedule,
  createMyTimeCard,
  createRuleProfile,
  createShiftTemplate,
  getManagementSummary,
  getManagementTimeCardDetail,
  getMySchedule,
  getMyTimeCard,
  getTimeAttendanceHistory,
  getTimeAttendanceSummary,
  listLaborGroups,
  listManagementExceptions,
  listManagementSchedules,
  listManagementTimeCards,
  listRuleProfiles,
  listShiftTemplates,
  publishManagementSchedule,
  recallMyTimeCard,
  rejectManagementTimeCard,
  submitMyTimeCard,
  updateLaborGroup,
  updateManagementSchedule,
  updateMyTimeCardEntries,
  updateRuleProfile,
  updateShiftTemplate,
} from './time-attendance.service';

const router = Router();

function getContext(req: Request) {
  return {
    currentEmployeeId: req.account?.employeeId,
    currentAccountId: req.account?.id,
    roles: req.user?.roles ?? [],
  };
}

router.get('/summary', requireFeatureEnabled('time_attendance_self_service'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getTimeAttendanceSummary(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/my-schedule', requireFeatureEnabled('time_attendance_self_service'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = scheduleRangeQuerySchema.parse(req.query);
    const data = await getMySchedule(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/my-time-card', requireFeatureEnabled('time_attendance_self_service'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = myTimeCardQuerySchema.parse(req.query);
    const data = await getMyTimeCard(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/my-time-card', requireFeatureEnabled('time_attendance_self_service'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await createMyTimeCard(getContext(req));
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/my-time-card/:id/entries', requireFeatureEnabled('time_attendance_self_service'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateTimeCardEntriesSchema.parse(req.body);
    const timeCard = await updateMyTimeCardEntries(req.params.id, data, getContext(req));
    logger.info({ timeCardId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Time card entries updated');
    res.json({ success: true, data: timeCard });
  } catch (error) {
    next(error);
  }
});

router.post('/my-time-card/:id/submit', requireFeatureEnabled('time_attendance_self_service'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const timeCard = await submitMyTimeCard(req.params.id, getContext(req));
    logger.info({ timeCardId: req.params.id, submittedBy: req.account?.id ?? req.user?.oid }, 'Time card submitted');
    res.json({ success: true, data: timeCard });
  } catch (error) {
    next(error);
  }
});

router.post('/my-time-card/:id/recall', requireFeatureEnabled('time_attendance_self_service'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const timeCard = await recallMyTimeCard(req.params.id, getContext(req));
    logger.info({ timeCardId: req.params.id, recalledBy: req.account?.id ?? req.user?.oid }, 'Time card recalled');
    res.json({ success: true, data: timeCard });
  } catch (error) {
    next(error);
  }
});

router.get('/history', requireFeatureEnabled('time_attendance_self_service'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getTimeAttendanceHistory(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/management/summary', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getManagementSummary(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/management/schedules', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listManagementSchedulesQuerySchema.parse(req.query);
    const data = await listManagementSchedules(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/management/schedules', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createScheduleSchema.parse(req.body);
    const schedule = await createManagementSchedule(data, getContext(req));
    logger.info({ scheduleId: schedule?.id, createdBy: req.account?.id ?? req.user?.oid }, 'Work schedule created');
    res.status(201).json({ success: true, data: schedule });
  } catch (error) {
    next(error);
  }
});

router.put('/management/schedules/:id', requireFeatureEnabled('time_attendance_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateScheduleSchema.parse(req.body);
    const schedule = await updateManagementSchedule(req.params.id, data, getContext(req));
    logger.info({ scheduleId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Work schedule updated');
    res.json({ success: true, data: schedule });
  } catch (error) {
    next(error);
  }
});

router.post('/management/schedules/:id/publish', requireFeatureEnabled('time_attendance_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = await publishManagementSchedule(req.params.id, getContext(req));
    logger.info({ scheduleId: req.params.id, publishedBy: req.account?.id ?? req.user?.oid }, 'Work schedule published');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/management/time-cards', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listManagementTimeCardsQuerySchema.parse(req.query);
    const data = await listManagementTimeCards(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/management/time-cards/:id', requireFeatureEnabled('time_attendance_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = await getManagementTimeCardDetail(req.params.id, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/management/time-cards/:id/approve', requireFeatureEnabled('time_attendance_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = timeCardDecisionSchema.parse(req.body ?? {});
    const timeCard = await approveManagementTimeCard(req.params.id, data, getContext(req));
    logger.info({ timeCardId: req.params.id, approvedBy: req.account?.id ?? req.user?.oid }, 'Time card approved');
    res.json({ success: true, data: timeCard });
  } catch (error) {
    next(error);
  }
});

router.post('/management/time-cards/:id/reject', requireFeatureEnabled('time_attendance_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = timeCardDecisionSchema.parse(req.body ?? {});
    const timeCard = await rejectManagementTimeCard(req.params.id, data, getContext(req));
    logger.info({ timeCardId: req.params.id, rejectedBy: req.account?.id ?? req.user?.oid }, 'Time card rejected');
    res.json({ success: true, data: timeCard });
  } catch (error) {
    next(error);
  }
});

router.get('/management/exceptions', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listManagementExceptionsQuerySchema.parse(req.query);
    const data = await listManagementExceptions(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/labor-groups', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listLaborGroups(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/labor-groups', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createLaborGroupSchema.parse(req.body);
    const laborGroup = await createLaborGroup(data, getContext(req));
    logger.info({ laborGroupId: laborGroup.id, createdBy: req.account?.id ?? req.user?.oid }, 'Labor group created');
    res.status(201).json({ success: true, data: laborGroup });
  } catch (error) {
    next(error);
  }
});

router.put('/labor-groups/:id', requireFeatureEnabled('time_attendance_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateLaborGroupSchema.parse(req.body);
    const laborGroup = await updateLaborGroup(req.params.id, data, getContext(req));
    logger.info({ laborGroupId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Labor group updated');
    res.json({ success: true, data: laborGroup });
  } catch (error) {
    next(error);
  }
});

router.get('/rule-profiles', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listRuleProfiles(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/rule-profiles', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createRuleProfileSchema.parse(req.body);
    const ruleProfile = await createRuleProfile(data, getContext(req));
    logger.info({ ruleProfileId: ruleProfile.id, createdBy: req.account?.id ?? req.user?.oid }, 'Work rule profile created');
    res.status(201).json({ success: true, data: ruleProfile });
  } catch (error) {
    next(error);
  }
});

router.put('/rule-profiles/:id', requireFeatureEnabled('time_attendance_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateRuleProfileSchema.parse(req.body);
    const ruleProfile = await updateRuleProfile(req.params.id, data, getContext(req));
    logger.info({ ruleProfileId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Work rule profile updated');
    res.json({ success: true, data: ruleProfile });
  } catch (error) {
    next(error);
  }
});

router.get('/shift-templates', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listShiftTemplates(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/shift-templates', requireFeatureEnabled('time_attendance_management'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createShiftTemplateSchema.parse(req.body);
    const shiftTemplate = await createShiftTemplate(data, getContext(req));
    logger.info({ shiftTemplateId: shiftTemplate.id, createdBy: req.account?.id ?? req.user?.oid }, 'Shift template created');
    res.status(201).json({ success: true, data: shiftTemplate });
  } catch (error) {
    next(error);
  }
});

router.put('/shift-templates/:id', requireFeatureEnabled('time_attendance_management'), async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateShiftTemplateSchema.parse(req.body);
    const shiftTemplate = await updateShiftTemplate(req.params.id, data, getContext(req));
    logger.info({ shiftTemplateId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Shift template updated');
    res.json({ success: true, data: shiftTemplate });
  } catch (error) {
    next(error);
  }
});

export default router;
