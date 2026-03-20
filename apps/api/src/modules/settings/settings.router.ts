import { NextFunction, Request, Response, Router } from 'express';
import { logger } from '../../shared/lib/logger';
import {
  createApprovalRuleSetSchema,
  createFundingTypeSchema,
  createRequestTypeSchema,
  createSkillCategorySchema,
  createSkillTagSchema,
  featureKeySchema,
  simulateApprovalRuleSetSettingSchema,
  updateApprovalRuleSetSettingSchema,
  updateFeatureStateSchema,
  updateFundingTypeSettingSchema,
  updateRequestTypeSettingSchema,
  updateSkillCategorySchema,
  updateSkillTagSchema,
} from './settings.schemas';
import {
  createApprovalRuleSetSetting,
  createFundingTypeSetting,
  createRequestTypeSetting,
  createSkillCategory,
  createSkillTag,
  listApprovalRuleSetSettings,
  listFeatureSettings,
  listFundingTypeSettings,
  listRequestTypeSettings,
  listSkillSettings,
  publishApprovalRuleSetSetting,
  simulateApprovalRuleSetSetting,
  updateApprovalRuleSetSetting,
  updateFeatureSetting,
  updateFundingTypeSetting,
  updateRequestTypeSetting,
  updateSkillCategory,
  updateSkillTag,
} from './settings.service';

const router = Router();

router.get('/features', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listFeatureSettings({
      roles: req.user?.roles ?? [],
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/features/:key', async (req: Request<{ key: string }>, res: Response, next: NextFunction) => {
  try {
    const featureKey = featureKeySchema.parse(req.params.key);
    const payload = updateFeatureStateSchema.parse(req.body);
    const data = await updateFeatureSetting(featureKey, payload.enabled, {
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });

    logger.info({ featureKey, enabled: payload.enabled, updatedBy: req.account?.id ?? req.user?.oid }, 'Feature setting updated');
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/request-types', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listRequestTypeSettings({
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/request-types', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = createRequestTypeSchema.parse(req.body);
    const data = await createRequestTypeSetting(payload, {
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/request-types/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = updateRequestTypeSettingSchema.parse(req.body);
    const data = await updateRequestTypeSetting(req.params.id, payload, {
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/funding-types', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listFundingTypeSettings({
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/funding-types', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = createFundingTypeSchema.parse(req.body);
    const data = await createFundingTypeSetting(payload, {
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/funding-types/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = updateFundingTypeSettingSchema.parse(req.body);
    const data = await updateFundingTypeSetting(req.params.id, payload, {
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/approval-rule-sets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listApprovalRuleSetSettings({
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/approval-rule-sets', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const payload = createApprovalRuleSetSchema.parse(req.body);
    const data = await createApprovalRuleSetSetting(payload, {
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.put('/approval-rule-sets/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = updateApprovalRuleSetSettingSchema.parse(req.body);
    const data = await updateApprovalRuleSetSetting(req.params.id, payload, {
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/approval-rule-sets/:id/publish', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = await publishApprovalRuleSetSetting(req.params.id, {
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/approval-rule-sets/:id/simulate', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const payload = simulateApprovalRuleSetSettingSchema.parse(req.body);
    const data = await simulateApprovalRuleSetSetting(req.params.id, payload, {
      roles: req.user?.roles ?? [],
      accountId: req.account?.id ?? null,
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.get('/skills', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await listSkillSettings({
      roles: req.user?.roles ?? [],
    });
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/skill-categories', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSkillCategorySchema.parse(req.body);
    const result = await createSkillCategory(data, {
      roles: req.user?.roles ?? [],
    });
    logger.info({ categoryCode: data.code, createdBy: req.account?.id ?? req.user?.oid }, 'Skill category created');
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.put('/skill-categories/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateSkillCategorySchema.parse(req.body);
    const result = await updateSkillCategory(req.params.id, data, {
      roles: req.user?.roles ?? [],
    });
    logger.info({ categoryId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Skill category updated');
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.post('/skills/tags', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = createSkillTagSchema.parse(req.body);
    const result = await createSkillTag(data, {
      roles: req.user?.roles ?? [],
    });
    logger.info({ tagCode: data.code, createdBy: req.account?.id ?? req.user?.oid }, 'Skill tag created');
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

router.put('/skills/tags/:id', async (req: Request<{ id: string }>, res: Response, next: NextFunction) => {
  try {
    const data = updateSkillTagSchema.parse(req.body);
    const result = await updateSkillTag(req.params.id, data, {
      roles: req.user?.roles ?? [],
    });
    logger.info({ tagId: req.params.id, updatedBy: req.account?.id ?? req.user?.oid }, 'Skill tag updated');
    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

export default router;
