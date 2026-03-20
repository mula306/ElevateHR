import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import {
  listTeamSkillsQuerySchema,
  updateTeamSkillValidationSchema,
} from './skills.schemas';
import {
  listActiveSkillTaxonomy,
  listTeamSkills,
  markTeamSkillNotValidated,
  validateTeamSkill,
} from './skills.service';

const router = Router();

function getContext(req: Request) {
  return {
    currentEmployeeId: req.account?.employeeId,
    roles: req.user?.roles ?? [],
  };
}

router.get('/taxonomy', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listActiveSkillTaxonomy();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/team', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const query = listTeamSkillsQuerySchema.parse(req.query);
    const data = await listTeamSkills(query, getContext(req));
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/team/:employeeSkillId/validate', async (req: Request<{ employeeSkillId: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateTeamSkillValidationSchema.parse(req.body ?? {});
    const skill = await validateTeamSkill(req.params.employeeSkillId, data, getContext(req));
    logger.info({ employeeSkillId: req.params.employeeSkillId, validator: req.account?.employeeId ?? req.user?.oid }, 'Employee skill validated');
    res.json({ success: true, data: skill });
  } catch (error) {
    next(error);
  }
});

router.post('/team/:employeeSkillId/not-validated', async (req: Request<{ employeeSkillId: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateTeamSkillValidationSchema.parse(req.body ?? {});
    const skill = await markTeamSkillNotValidated(req.params.employeeSkillId, data, getContext(req));
    logger.info({ employeeSkillId: req.params.employeeSkillId, validator: req.account?.employeeId ?? req.user?.oid }, 'Employee skill marked not validated');
    res.json({ success: true, data: skill });
  } catch (error) {
    next(error);
  }
});

export default router;
