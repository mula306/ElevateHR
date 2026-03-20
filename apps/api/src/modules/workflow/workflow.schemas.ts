import { z } from 'zod';

const workflowStatusSchema = z.enum(['Open', 'Completed', 'Cancelled']);

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

export const listWorkflowTasksQuerySchema = z.object({
  status: workflowStatusSchema.optional(),
  taskType: trimmedOptionalStringSchema,
  employeeId: uuidQuerySchema,
  ownerEmployeeId: uuidQuerySchema,
  assigneeAccountId: uuidQuerySchema,
  assigneeQueueKey: trimmedOptionalStringSchema,
  overdueOnly: z.coerce.boolean().default(false),
  search: trimmedOptionalStringSchema,
});

export const createWorkflowTaskSchema = z.object({
  taskType: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(150),
  description: z.string().trim().max(500).optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  ownerEmployeeId: z.string().uuid().optional().nullable(),
  assigneeAccountId: z.string().uuid().optional().nullable(),
  assigneeQueueKey: z.string().trim().max(50).optional().nullable(),
  ownerLabel: z.string().trim().max(100).optional().nullable(),
  relatedEntityType: z.string().trim().max(50).optional().nullable(),
  relatedEntityId: z.string().trim().max(100).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  priority: z.enum(['Low', 'Normal', 'High']).default('Normal'),
  comments: z.string().trim().max(500).optional().nullable(),
});

export const updateWorkflowTaskSchema = z.object({
  status: workflowStatusSchema.optional(),
  dueDate: z.string().datetime().optional().nullable(),
  ownerEmployeeId: z.string().uuid().optional().nullable(),
  assigneeAccountId: z.string().uuid().optional().nullable(),
  assigneeQueueKey: z.string().trim().max(50).optional().nullable(),
  ownerLabel: z.string().trim().max(100).optional().nullable(),
  comments: z.string().trim().max(500).optional().nullable(),
});

export type CreateWorkflowTaskInput = z.infer<typeof createWorkflowTaskSchema>;
export type ListWorkflowTasksQuery = z.infer<typeof listWorkflowTasksQuerySchema>;
export type UpdateWorkflowTaskInput = z.infer<typeof updateWorkflowTaskSchema>;
