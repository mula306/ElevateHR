import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import { requireRole } from '../../shared/middleware/rbac';
import {
  archiveRecordSchema,
  createClassificationSchema,
  createLevelSchema,
  createOrgUnitSchema,
  createPositionSchema,
  listEmployeeOptionsQuerySchema,
  listLevelsQuerySchema,
  listOrgUnitsQuerySchema,
  listPositionsQuerySchema,
  organizationListQuerySchema,
  updateClassificationSchema,
  updateLevelSchema,
  updateOrgUnitSchema,
  updatePositionSchema,
} from './organization.schemas';
import {
  archiveClassification,
  archiveLevel,
  archiveOrgUnit,
  archivePosition,
  createClassification,
  createLevel,
  createOrgUnit,
  createPosition,
  getOrganizationSnapshot,
  listClassifications,
  listEmployeeOptions,
  listLevels,
  listOrgUnits,
  listPositions,
  restoreClassification,
  restoreLevel,
  restoreOrgUnit,
  restorePosition,
  updateClassification,
  updateLevel,
  updateOrgUnit,
  updatePosition,
} from './organization.service';

const router = Router();
const requireOrganizationWriteRole = requireRole('Admin', 'HR.Manager');

router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getOrganizationSnapshot();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/employee-options', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listEmployeeOptionsQuerySchema.parse(req.query);
    const data = await listEmployeeOptions(query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/org-units', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listOrgUnitsQuerySchema.parse(req.query);
    const data = await listOrgUnits(query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/org-units', requireOrganizationWriteRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createOrgUnitSchema.parse(req.body);
    const orgUnit = await createOrgUnit(data);
    logger.info({ orgUnitId: orgUnit.id, createdBy: req.user?.oid }, 'Organization org unit created');
    res.status(201).json({ success: true, data: orgUnit });
  } catch (error) {
    next(error);
  }
});

router.put('/org-units/:id', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateOrgUnitSchema.parse(req.body);
    const orgUnit = await updateOrgUnit(req.params.id, data, req.user?.oid);
    logger.info({ orgUnitId: req.params.id, updatedBy: req.user?.oid }, 'Organization org unit updated');
    res.json({ success: true, data: orgUnit });
  } catch (error) {
    next(error);
  }
});

router.post('/org-units/:id/archive', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = archiveRecordSchema.parse(req.body);
    const orgUnit = await archiveOrgUnit(req.params.id, data, req.user?.oid);
    logger.info({ orgUnitId: req.params.id, archivedBy: req.user?.oid }, 'Organization org unit archived');
    res.json({ success: true, data: orgUnit });
  } catch (error) {
    next(error);
  }
});

router.post('/org-units/:id/restore', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const orgUnit = await restoreOrgUnit(req.params.id);
    logger.info({ orgUnitId: req.params.id, restoredBy: req.user?.oid }, 'Organization org unit restored');
    res.json({ success: true, data: orgUnit });
  } catch (error) {
    next(error);
  }
});

router.get('/positions', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listPositionsQuerySchema.parse(req.query);
    const data = await listPositions(query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/positions', requireOrganizationWriteRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createPositionSchema.parse(req.body);
    const position = await createPosition(data, req.user?.oid);
    logger.info({ positionId: position.id, createdBy: req.user?.oid }, 'Organization position created');
    res.status(201).json({ success: true, data: position });
  } catch (error) {
    next(error);
  }
});

router.put('/positions/:id', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updatePositionSchema.parse(req.body);
    const position = await updatePosition(req.params.id, data, req.user?.oid);
    logger.info({ positionId: req.params.id, updatedBy: req.user?.oid }, 'Organization position updated');
    res.json({ success: true, data: position });
  } catch (error) {
    next(error);
  }
});

router.post('/positions/:id/archive', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = archiveRecordSchema.parse(req.body);
    const position = await archivePosition(req.params.id, data, req.user?.oid);
    logger.info({ positionId: req.params.id, archivedBy: req.user?.oid }, 'Organization position archived');
    res.json({ success: true, data: position });
  } catch (error) {
    next(error);
  }
});

router.post('/positions/:id/restore', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const position = await restorePosition(req.params.id);
    logger.info({ positionId: req.params.id, restoredBy: req.user?.oid }, 'Organization position restored');
    res.json({ success: true, data: position });
  } catch (error) {
    next(error);
  }
});

router.get('/classifications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = organizationListQuerySchema.parse(req.query);
    const data = await listClassifications(query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/classifications', requireOrganizationWriteRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createClassificationSchema.parse(req.body);
    const classification = await createClassification(data);
    logger.info({ classificationId: classification.id, createdBy: req.user?.oid }, 'Organization classification created');
    res.status(201).json({ success: true, data: classification });
  } catch (error) {
    next(error);
  }
});

router.put('/classifications/:id', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateClassificationSchema.parse(req.body);
    const classification = await updateClassification(req.params.id, data);
    logger.info({ classificationId: req.params.id, updatedBy: req.user?.oid }, 'Organization classification updated');
    res.json({ success: true, data: classification });
  } catch (error) {
    next(error);
  }
});

router.post('/classifications/:id/archive', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = archiveRecordSchema.parse(req.body);
    const classification = await archiveClassification(req.params.id, data, req.user?.oid);
    logger.info({ classificationId: req.params.id, archivedBy: req.user?.oid }, 'Organization classification archived');
    res.json({ success: true, data: classification });
  } catch (error) {
    next(error);
  }
});

router.post('/classifications/:id/restore', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const classification = await restoreClassification(req.params.id);
    logger.info({ classificationId: req.params.id, restoredBy: req.user?.oid }, 'Organization classification restored');
    res.json({ success: true, data: classification });
  } catch (error) {
    next(error);
  }
});

router.get('/levels', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listLevelsQuerySchema.parse(req.query);
    const data = await listLevels(query);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/levels', requireOrganizationWriteRole, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createLevelSchema.parse(req.body);
    const level = await createLevel(data);
    logger.info({ levelId: level.id, createdBy: req.user?.oid }, 'Organization classification level created');
    res.status(201).json({ success: true, data: level });
  } catch (error) {
    next(error);
  }
});

router.put('/levels/:id', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateLevelSchema.parse(req.body);
    const level = await updateLevel(req.params.id, data);
    logger.info({ levelId: req.params.id, updatedBy: req.user?.oid }, 'Organization classification level updated');
    res.json({ success: true, data: level });
  } catch (error) {
    next(error);
  }
});

router.post('/levels/:id/archive', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = archiveRecordSchema.parse(req.body);
    const level = await archiveLevel(req.params.id, data, req.user?.oid);
    logger.info({ levelId: req.params.id, archivedBy: req.user?.oid }, 'Organization classification level archived');
    res.json({ success: true, data: level });
  } catch (error) {
    next(error);
  }
});

router.post('/levels/:id/restore', requireOrganizationWriteRole, async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const level = await restoreLevel(req.params.id);
    logger.info({ levelId: req.params.id, restoredBy: req.user?.oid }, 'Organization classification level restored');
    res.json({ success: true, data: level });
  } catch (error) {
    next(error);
  }
});

export default router;
