import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import {
  createMySkillSchema,
  updateMyProfileSchema,
  updateMySkillSchema,
} from './my-profile.schemas';
import {
  createMySkill,
  deleteMySkill,
  getMyProfile,
  listMySkills,
  updateMyProfile,
  updateMySkill,
} from './my-profile.service';

const router = Router();

function getContext(req: Request) {
  return {
    currentEmployeeId: req.account?.employeeId,
    userId: req.user?.oid ?? req.account?.id,
  };
}

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await getMyProfile(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = updateMyProfileSchema.parse(req.body);
    const profile = await updateMyProfile(data, getContext(req));
    logger.info({ employeeId: req.account?.employeeId, updatedBy: req.user?.oid ?? req.account?.id }, 'My profile updated');
    res.json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

router.get('/skills', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listMySkills(getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/skills', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createMySkillSchema.parse(req.body);
    const skill = await createMySkill(data, getContext(req));
    logger.info({ employeeId: req.account?.employeeId, skillId: skill.id }, 'Employee skill created');
    res.status(201).json({ success: true, data: skill });
  } catch (error) {
    next(error);
  }
});

router.put('/skills/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateMySkillSchema.parse(req.body);
    const skill = await updateMySkill(req.params.id, data, getContext(req));
    logger.info({ employeeId: req.account?.employeeId, skillId: skill.id }, 'Employee skill updated');
    res.json({ success: true, data: skill });
  } catch (error) {
    next(error);
  }
});

router.delete('/skills/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = await deleteMySkill(req.params.id, getContext(req));
    logger.info({ employeeId: req.account?.employeeId, skillId: req.params.id }, 'Employee skill deleted');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

export default router;
