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

export const dynamicFieldTypeSchema = z.enum(['text', 'textarea', 'number', 'select', 'date']);

export const dynamicFieldDefinitionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]*$/, 'Keys must start with a lowercase letter and use lowercase letters, numbers, or underscores.').max(100),
  label: z.string().min(1).max(150),
  type: dynamicFieldTypeSchema,
  required: z.boolean().optional(),
  options: z.array(z.string().min(1).max(100)).optional(),
}).superRefine((field, context) => {
  if (field.type === 'select' && (!field.options || field.options.length === 0)) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Select fields must define at least one option.',
    });
  }

  if (field.type !== 'select' && field.options && field.options.length > 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['options'],
      message: 'Only select fields can define options.',
    });
  }
});

export const dynamicFieldSchemaInputSchema = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
}, z.array(dynamicFieldDefinitionSchema)
  .superRefine((fields, context) => {
    const seenKeys = new Set<string>();

    fields.forEach((field, index) => {
      if (seenKeys.has(field.key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [index, 'key'],
          message: 'Field keys must be unique.',
        });
        return;
      }

      seenKeys.add(field.key);
    });
  }));

export const jsonObjectSchema = z.preprocess((value) => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }

  return value;
}, z.record(z.string(), z.unknown()).nullable());

export const jobRequestStatusSchema = z.enum([
  'Draft',
  'Submitted',
  'In Review',
  'Needs Rework',
  'Rejected',
  'Approved',
  'Cancelled',
  'Hiring In Progress',
  'Closed',
]);

export const approvalRuleSetStatusSchema = z.enum(['Draft', 'Active', 'Archived']);

export const listJobRequestsQuerySchema = z.object({
  status: jobRequestStatusSchema.optional(),
  requestTypeId: z.string().uuid().optional(),
  orgUnitId: z.string().uuid().optional(),
  search: z.string().max(150).optional(),
});

export const listRuleSetsQuerySchema = z.object({
  status: approvalRuleSetStatusSchema.optional(),
});

export const jobRequestFieldValueSchema = z.object({
  fieldKey: z.string().min(1).max(100),
  fieldLabel: z.string().min(1).max(150),
  valueType: dynamicFieldTypeSchema,
  value: z.string().max(2000).optional().nullable(),
});

const jobRequestFieldsSchema = z.object({
  requestTypeId: z.string().uuid(),
  budgetImpacting: z.boolean(),
  fundingTypeId: z.string().uuid(),
  orgUnitId: z.string().uuid(),
  classificationId: z.string().uuid(),
  levelId: z.string().uuid(),
  reportsToPositionId: z.string().uuid().optional().nullable(),
  targetPositionId: z.string().uuid().optional().nullable(),
  title: z.string().min(3).max(150),
  headcount: z.number().int().min(1).max(100).default(1),
  fte: z.number().min(0.1).max(10).default(1),
  weeklyHours: z.number().min(1).max(168).default(40),
  justification: z.string().max(2000).optional().nullable(),
  businessCase: z.string().max(2000).optional().nullable(),
  fieldValues: z.array(jobRequestFieldValueSchema).default([]),
});

export const createJobRequestSchema = jobRequestFieldsSchema;

export const updateJobRequestSchema = jobRequestFieldsSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one job request field must be provided.',
});

export const requestDecisionSchema = z.object({
  comments: z.string().max(1000).optional().nullable(),
});

export const createHiringRecordSchema = z.object({
  positionId: z.string().uuid().optional().nullable(),
  selectedEmployeeId: z.string().uuid().optional().nullable(),
  candidateName: z.string().min(3).max(200),
  competitionNumber: z.string().min(1).max(100),
  compensationAmount: z.number().min(0).max(10000000),
  payFrequency: z.string().min(3).max(20).default('Biweekly'),
  hireDate: isoDateSchema,
  notes: z.string().max(1000).optional().nullable(),
});

export const updateHiringRecordSchema = createHiringRecordSchema.partial().refine((value) => Object.keys(value).length > 0, {
  message: 'At least one hiring field must be provided.',
});

export const requestTypeSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  description: trimmedOptionalStringSchema.nullable().optional(),
  fieldSchema: dynamicFieldSchemaInputSchema.default([]),
  isActive: z.boolean().default(true),
});

export const updateRequestTypeSchema = z.object({
  code: z.string().min(1).max(50).optional(),
  name: z.string().min(1).max(150).optional(),
  description: trimmedOptionalStringSchema.nullable().optional(),
  fieldSchema: dynamicFieldSchemaInputSchema.optional(),
  isActive: z.boolean().optional(),
});

export const fundingTypeSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(150),
  category: trimmedOptionalStringSchema.nullable().optional(),
  description: trimmedOptionalStringSchema.nullable().optional(),
  durationType: trimmedOptionalStringSchema.nullable().optional(),
  isPermanent: z.boolean().default(false),
  isActive: z.boolean().default(true),
});

export const updateFundingTypeSchema = fundingTypeSchema.partial();

export const approvalRuleStepInputSchema = z.object({
  id: z.string().uuid().optional(),
  stepOrder: z.number().int().min(1).max(25),
  label: z.string().min(1).max(150),
  assigneeSource: z.enum(['RequestorManager', 'PositionIncumbent', 'Queue', 'SpecificAccount']),
  assigneeValue: trimmedOptionalStringSchema.nullable().optional(),
  fallbackQueueKey: trimmedOptionalStringSchema.nullable().optional(),
  escalationDays: z.number().int().min(1).max(365).optional().nullable(),
  dueDays: z.number().int().min(0).max(365).optional().nullable(),
});

export const approvalRuleInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(150),
  priority: z.number().int().min(1).max(999),
  isActive: z.boolean().default(true),
  isFallback: z.boolean().default(false),
  requestTypeId: z.string().uuid().optional().nullable(),
  fundingTypeId: z.string().uuid().optional().nullable(),
  budgetImpacting: z.boolean().optional().nullable(),
  requestorRole: trimmedOptionalStringSchema.nullable().optional(),
  orgUnitId: z.string().uuid().optional().nullable(),
  conditions: jsonObjectSchema.optional(),
  steps: z.array(approvalRuleStepInputSchema).min(1),
});

export const approvalRuleSetSchema = z.object({
  name: z.string().min(3).max(150),
  description: trimmedOptionalStringSchema.nullable().optional(),
  status: approvalRuleSetStatusSchema.default('Draft'),
  version: z.number().int().min(1).max(999).default(1),
  scopeOrgUnitId: z.string().uuid().optional().nullable(),
  effectiveStartDate: isoDateSchema.optional().nullable(),
  effectiveEndDate: isoDateSchema.optional().nullable(),
  rules: z.array(approvalRuleInputSchema).min(1),
});

export const updateApprovalRuleSetSchema = approvalRuleSetSchema.partial().extend({
  rules: z.array(approvalRuleInputSchema).min(1).optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one rule set field must be provided.',
});

export const simulateApprovalRuleSetSchema = z.object({
  requestTypeId: z.string().uuid(),
  budgetImpacting: z.boolean(),
  fundingTypeId: z.string().uuid(),
  orgUnitId: z.string().uuid(),
  requestorRole: trimmedOptionalStringSchema.nullable().optional(),
});

export type ApprovalRuleInput = z.infer<typeof approvalRuleInputSchema>;
export type ApprovalRuleSetInput = z.infer<typeof approvalRuleSetSchema>;
export type CreateHiringRecordInput = z.infer<typeof createHiringRecordSchema>;
export type CreateJobRequestInput = z.infer<typeof createJobRequestSchema>;
export type DynamicFieldDefinitionInput = z.infer<typeof dynamicFieldDefinitionSchema>;
export type FundingTypeInput = z.infer<typeof fundingTypeSchema>;
export type JobRequestDecisionInput = z.infer<typeof requestDecisionSchema>;
export type ListJobRequestsQuery = z.infer<typeof listJobRequestsQuerySchema>;
export type ListRuleSetsQuery = z.infer<typeof listRuleSetsQuerySchema>;
export type RequestTypeInput = z.infer<typeof requestTypeSchema>;
export type SimulateApprovalRuleSetInput = z.infer<typeof simulateApprovalRuleSetSchema>;
export type UpdateApprovalRuleSetInput = z.infer<typeof updateApprovalRuleSetSchema>;
export type UpdateFundingTypeInput = z.infer<typeof updateFundingTypeSchema>;
export type UpdateHiringRecordInput = z.infer<typeof updateHiringRecordSchema>;
export type UpdateJobRequestInput = z.infer<typeof updateJobRequestSchema>;
export type UpdateRequestTypeInput = z.infer<typeof updateRequestTypeSchema>;
