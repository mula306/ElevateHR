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

export const performanceCycleStatusSchema = z.enum(['Draft', 'Published', 'Closed']);
export const performanceReviewStatusSchema = z.enum([
  'Pending Self Review',
  'Self Review Submitted',
  'Manager Review In Progress',
  'Finalized',
  'Acknowledged',
]);
export const performanceGoalStatusSchema = z.enum(['Active', 'Completed', 'Closed']);

export const listPerformanceReviewsQuerySchema = z.object({
  cycleId: z.string().uuid().optional(),
  status: performanceReviewStatusSchema.optional(),
});

export const listPerformanceGoalsQuerySchema = z.object({
  employeeId: z.string().uuid().optional(),
  status: performanceGoalStatusSchema.optional(),
});

const performanceCycleFieldsSchema = z.object({
  name: z.string().min(3).max(150),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  selfReviewDueDate: isoDateSchema,
  managerReviewDueDate: isoDateSchema,
  releaseDate: isoDateSchema,
  orgUnitId: z.string().uuid().optional().nullable(),
});

export const createPerformanceCycleSchema = performanceCycleFieldsSchema.superRefine((value, context) => {
  const startDate = new Date(value.startDate);
  const endDate = new Date(value.endDate);
  const selfDueDate = new Date(value.selfReviewDueDate);
  const managerDueDate = new Date(value.managerReviewDueDate);
  const releaseDate = new Date(value.releaseDate);

  if (startDate > endDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['endDate'],
      message: 'The end date must be on or after the start date.',
    });
  }

  if (selfDueDate < startDate || selfDueDate > endDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['selfReviewDueDate'],
      message: 'Self-review due date must fall within the cycle window.',
    });
  }

  if (managerDueDate < selfDueDate || managerDueDate > endDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['managerReviewDueDate'],
      message: 'Manager review due date must be on or after the self-review due date and within the cycle window.',
    });
  }

  if (releaseDate < managerDueDate) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['releaseDate'],
      message: 'Release date must be on or after the manager review due date.',
    });
  }
});

export const updatePerformanceCycleSchema = performanceCycleFieldsSchema.partial();

const reviewSectionUpdateSchema = z.object({
  sectionKey: z.enum(['achievements', 'strengths', 'growth_focus', 'development_actions']),
  response: z.string().max(2000),
});

export const updateSelfReviewSchema = z.object({
  sections: z.array(reviewSectionUpdateSchema).min(1),
});

export const updateManagerReviewSchema = z.object({
  sections: z.array(reviewSectionUpdateSchema).min(1),
  managerSummary: z.string().max(2000).optional().nullable(),
});

export const acknowledgePerformanceReviewSchema = z.object({
  comments: z.string().max(500).optional().nullable(),
});

export const createPerformanceGoalSchema = z.object({
  employeeId: z.string().uuid(),
  title: z.string().min(3).max(150),
  description: z.string().max(1000).optional().nullable(),
  status: performanceGoalStatusSchema.default('Active'),
  targetDate: isoDateSchema.optional().nullable(),
  createdInCycleId: z.string().uuid().optional().nullable(),
});

export const updatePerformanceGoalSchema = z.object({
  title: z.string().min(3).max(150).optional(),
  description: z.string().max(1000).optional().nullable(),
  status: performanceGoalStatusSchema.optional(),
  targetDate: isoDateSchema.optional().nullable(),
}).refine((value) => Object.keys(value).length > 0, {
  message: 'At least one goal field must be provided.',
});

const percentCompleteSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }

  const numericValue = typeof value === 'number' ? value : Number(value);

  if (Number.isNaN(numericValue)) {
    return value;
  }

  return Math.min(100, Math.max(0, Math.round(numericValue)));
}, z.number().int('Percent complete must be a whole number.').nullable());

export const createPerformanceGoalUpdateSchema = z.object({
  progressNote: z.string().min(3).max(2000),
  percentComplete: percentCompleteSchema.optional(),
});

export type AcknowledgePerformanceReviewInput = z.infer<typeof acknowledgePerformanceReviewSchema>;
export type CreatePerformanceCycleInput = z.infer<typeof createPerformanceCycleSchema>;
export type CreatePerformanceGoalInput = z.infer<typeof createPerformanceGoalSchema>;
export type CreatePerformanceGoalUpdateInput = z.infer<typeof createPerformanceGoalUpdateSchema>;
export type ListPerformanceGoalsQuery = z.infer<typeof listPerformanceGoalsQuerySchema>;
export type ListPerformanceReviewsQuery = z.infer<typeof listPerformanceReviewsQuerySchema>;
export type UpdateManagerReviewInput = z.infer<typeof updateManagerReviewSchema>;
export type UpdatePerformanceCycleInput = z.infer<typeof updatePerformanceCycleSchema>;
export type UpdatePerformanceGoalInput = z.infer<typeof updatePerformanceGoalSchema>;
export type UpdateSelfReviewInput = z.infer<typeof updateSelfReviewSchema>;
