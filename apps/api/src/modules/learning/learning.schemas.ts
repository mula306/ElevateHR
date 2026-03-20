import { z } from 'zod';

const isoDateSchema = z.union([
  z.string().datetime(),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format'),
]);

const trimmedOptionalStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().optional());

export const learningAssignmentTypeSchema = z.enum(['Content', 'Path']);
export const learningRequirementTypeSchema = z.enum(['Required', 'Recommended']);
export const learningAssignmentStatusSchema = z.enum(['Active', 'Cancelled']);
export const learningPathStatusSchema = z.enum(['Active', 'Inactive']);
export const learningContentStatusSchema = z.enum(['Active', 'Retired']);
export const learningWebhookStatusSchema = z.enum(['Assigned', 'In Progress', 'Completed', 'Expired']);

export const listLearningCatalogQuerySchema = z.object({
  search: z.string().optional(),
  providerId: z.string().uuid().optional(),
  status: learningContentStatusSchema.optional(),
});

export const listLearningAssignmentsQuerySchema = z.object({
  search: z.string().optional(),
  status: learningAssignmentStatusSchema.optional(),
});

export const createLearningPathSchema = z.object({
  code: z.string().min(2).max(50),
  name: z.string().min(3).max(150),
  description: z.string().max(1000).optional().nullable(),
  status: learningPathStatusSchema.default('Active'),
  itemContentIds: z.array(z.string().uuid()).min(1).max(50),
});

export const updateLearningPathSchema = z.object({
  name: z.string().min(3).max(150).optional(),
  description: z.string().max(1000).optional().nullable(),
  status: learningPathStatusSchema.optional(),
  itemContentIds: z.array(z.string().uuid()).min(1).max(50).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one learning path field must be provided.',
});

const learningAssignmentTargetFieldsSchema = z.object({
  employeeId: z.string().uuid().optional().nullable(),
  orgUnitId: z.string().uuid().optional().nullable(),
  positionId: z.string().uuid().optional().nullable(),
  classificationId: z.string().uuid().optional().nullable(),
});

const learningAssignmentFieldsSchema = z.object({
  assignmentType: learningAssignmentTypeSchema,
  contentId: z.string().uuid().optional().nullable(),
  pathId: z.string().uuid().optional().nullable(),
  requirementType: learningRequirementTypeSchema.default('Required'),
  dueDate: isoDateSchema.optional().nullable(),
  renewalDays: z.number().int().min(30).max(1095).optional().nullable(),
  mandatory: z.boolean().default(false),
  notes: z.string().max(500).optional().nullable(),
}).merge(learningAssignmentTargetFieldsSchema);

export const createLearningAssignmentSchema = learningAssignmentFieldsSchema.superRefine((value, context) => {
  const targets = [value.employeeId, value.orgUnitId, value.positionId, value.classificationId].filter(Boolean);
  if (targets.length !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['employeeId'],
      message: 'Select exactly one assignment audience.',
    });
  }

  if (value.assignmentType === 'Content' && !value.contentId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contentId'],
      message: 'Select a course to assign.',
    });
  }

  if (value.assignmentType === 'Path' && !value.pathId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pathId'],
      message: 'Select a learning path to assign.',
    });
  }
});

export const updateLearningAssignmentSchema = z.object({
  requirementType: learningRequirementTypeSchema.optional(),
  dueDate: isoDateSchema.optional().nullable(),
  renewalDays: z.number().int().min(30).max(1095).optional().nullable(),
  mandatory: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one learning assignment field must be provided.',
});

const learningRuleTargetFieldsSchema = z.object({
  orgUnitId: z.string().uuid().optional().nullable(),
  positionId: z.string().uuid().optional().nullable(),
  classificationId: z.string().uuid().optional().nullable(),
  managerEmployeeId: z.string().uuid().optional().nullable(),
});

const learningRuleFieldsSchema = z.object({
  assignmentType: learningAssignmentTypeSchema,
  contentId: z.string().uuid().optional().nullable(),
  pathId: z.string().uuid().optional().nullable(),
  requirementType: learningRequirementTypeSchema.default('Required'),
  defaultDueDays: z.number().int().min(0).max(365).optional().nullable(),
  renewalDays: z.number().int().min(30).max(1095).optional().nullable(),
  mandatory: z.boolean().default(false),
  isActive: z.boolean().default(true),
}).merge(learningRuleTargetFieldsSchema);

export const createLearningAssignmentRuleSchema = learningRuleFieldsSchema.superRefine((value, context) => {
  const targets = [value.orgUnitId, value.positionId, value.classificationId, value.managerEmployeeId].filter(Boolean);
  if (targets.length !== 1) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['orgUnitId'],
      message: 'Select exactly one automation rule audience.',
    });
  }

  if (value.assignmentType === 'Content' && !value.contentId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['contentId'],
      message: 'Select a course for the rule.',
    });
  }

  if (value.assignmentType === 'Path' && !value.pathId) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pathId'],
      message: 'Select a learning path for the rule.',
    });
  }
});

export const updateLearningAssignmentRuleSchema = z.object({
  requirementType: learningRequirementTypeSchema.optional(),
  defaultDueDays: z.number().int().min(0).max(365).optional().nullable(),
  renewalDays: z.number().int().min(30).max(1095).optional().nullable(),
  mandatory: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one automation rule field must be provided.',
});

export const updateLearningContentSkillsSchema = z.object({
  skillTagIds: z.array(z.string().uuid()).max(50),
});

export const launchLearningAssignmentSchema = z.object({
  recordId: z.string().uuid().optional().nullable(),
});

export const learningWebhookSchema = z.object({
  recordId: z.string().uuid().optional(),
  providerContentId: trimmedOptionalStringSchema,
  employeeId: z.string().uuid().optional(),
  employeeEmail: z.string().email().optional(),
  status: learningWebhookStatusSchema.optional(),
  progressPercent: z.number().int().min(0).max(100).optional(),
  completedAt: isoDateSchema.optional().nullable(),
  certificateIssuedAt: isoDateSchema.optional().nullable(),
  certificateExpiresAt: isoDateSchema.optional().nullable(),
  certificateNumber: z.string().max(100).optional().nullable(),
  providerStatus: z.string().max(50).optional().nullable(),
}).refine((value) => Boolean(value.recordId || (value.providerContentId && (value.employeeId || value.employeeEmail))), {
  message: 'Provide a recordId or a providerContentId with employee context.',
});

export type CreateLearningAssignmentInput = z.infer<typeof createLearningAssignmentSchema>;
export type CreateLearningAssignmentRuleInput = z.infer<typeof createLearningAssignmentRuleSchema>;
export type CreateLearningPathInput = z.infer<typeof createLearningPathSchema>;
export type LaunchLearningAssignmentInput = z.infer<typeof launchLearningAssignmentSchema>;
export type LearningWebhookInput = z.infer<typeof learningWebhookSchema>;
export type ListLearningAssignmentsQuery = z.infer<typeof listLearningAssignmentsQuerySchema>;
export type ListLearningCatalogQuery = z.infer<typeof listLearningCatalogQuerySchema>;
export type UpdateLearningAssignmentInput = z.infer<typeof updateLearningAssignmentSchema>;
export type UpdateLearningAssignmentRuleInput = z.infer<typeof updateLearningAssignmentRuleSchema>;
export type UpdateLearningContentSkillsInput = z.infer<typeof updateLearningContentSkillsSchema>;
export type UpdateLearningPathInput = z.infer<typeof updateLearningPathSchema>;
