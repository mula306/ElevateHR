import { z } from 'zod';

const checklistStatusSchema = z.enum(['In Progress', 'Completed']);
const checklistItemStatusSchema = z.enum(['Open', 'Completed']);

const trimmedOptionalStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().optional());

const uuidQuerySchema = z.preprocess((value) => {
  if (value === '' || value === null) {
    return undefined;
  }

  return value;
}, z.string().uuid().optional());

export const listEmployeeChecklistsQuerySchema = z.object({
  employeeId: uuidQuerySchema,
  status: checklistStatusSchema.optional(),
  lifecycleType: trimmedOptionalStringSchema,
});

export const createEmployeeChecklistSchema = z.object({
  employeeId: z.string().uuid(),
  templateId: z.string().uuid().optional().nullable(),
  lifecycleType: z.enum(['Onboarding', 'Offboarding']).optional(),
});

export const updateChecklistItemSchema = z.object({
  status: checklistItemStatusSchema,
});

export type CreateEmployeeChecklistInput = z.infer<typeof createEmployeeChecklistSchema>;
export type ListEmployeeChecklistsQuery = z.infer<typeof listEmployeeChecklistsQuerySchema>;
export type UpdateChecklistItemInput = z.infer<typeof updateChecklistItemSchema>;
