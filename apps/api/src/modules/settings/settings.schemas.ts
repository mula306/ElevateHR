import { z } from 'zod';
import { FEATURE_KEY_VALUES } from '../../shared/lib/features';
import {
  approvalRuleSetSchema,
  fundingTypeSchema,
  requestTypeSchema,
  simulateApprovalRuleSetSchema,
  updateApprovalRuleSetSchema,
  updateFundingTypeSchema,
  updateRequestTypeSchema,
} from '../recruitment/recruitment.schemas';

export const featureKeySchema = z.enum(FEATURE_KEY_VALUES);

export const updateFeatureStateSchema = z.object({
  enabled: z.boolean(),
});

export const createSkillCategorySchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  description: z.string().max(500).optional().nullable(),
  displayOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const updateSkillCategorySchema = createSkillCategorySchema.partial();

export const createSkillTagSchema = z.object({
  categoryId: z.string().uuid(),
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  description: z.string().max(500).optional().nullable(),
  displayOrder: z.number().int().min(0).max(999).default(0),
  isActive: z.boolean().default(true),
});

export const updateSkillTagSchema = createSkillTagSchema.omit({ categoryId: true }).extend({
  categoryId: z.string().uuid().optional(),
});

export const createRequestTypeSchema = requestTypeSchema;
export const createFundingTypeSchema = fundingTypeSchema;
export const createApprovalRuleSetSchema = approvalRuleSetSchema;
export const updateRequestTypeSettingSchema = updateRequestTypeSchema;
export const updateFundingTypeSettingSchema = updateFundingTypeSchema;
export const updateApprovalRuleSetSettingSchema = updateApprovalRuleSetSchema;
export const simulateApprovalRuleSetSettingSchema = simulateApprovalRuleSetSchema;

export type FeatureKeyInput = z.infer<typeof featureKeySchema>;
export type UpdateFeatureStateInput = z.infer<typeof updateFeatureStateSchema>;
export type CreateSkillCategoryInput = z.infer<typeof createSkillCategorySchema>;
export type UpdateSkillCategoryInput = z.infer<typeof updateSkillCategorySchema>;
export type CreateSkillTagInput = z.infer<typeof createSkillTagSchema>;
export type UpdateSkillTagInput = z.infer<typeof updateSkillTagSchema>;
export type RequestTypeInput = z.infer<typeof createRequestTypeSchema>;
export type FundingTypeInput = z.infer<typeof createFundingTypeSchema>;
export type ApprovalRuleSetInput = z.infer<typeof createApprovalRuleSetSchema>;
export type UpdateRequestTypeInput = z.infer<typeof updateRequestTypeSettingSchema>;
export type UpdateFundingTypeInput = z.infer<typeof updateFundingTypeSettingSchema>;
export type UpdateApprovalRuleSetInput = z.infer<typeof updateApprovalRuleSetSettingSchema>;
export type SimulateApprovalRuleSetInput = z.infer<typeof simulateApprovalRuleSetSettingSchema>;
