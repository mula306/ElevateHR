import { z } from 'zod';

const trimmedOptionalStringSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().optional());

export const listInboxItemsQuerySchema = z.object({
  tab: z.enum(['open', 'approvals', 'tasks', 'completed']).default('open'),
  source: z.enum(['Leave', 'Time', 'Recruitment', 'Checklist', 'Document', 'Performance', 'Learning', 'Operational']).optional(),
  status: z.enum(['Open', 'Completed', 'Cancelled']).optional(),
  dueWindow: z.enum(['all', 'overdue', 'today', 'next7']).default('all'),
  search: trimmedOptionalStringSchema,
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export type ListInboxItemsQuery = z.infer<typeof listInboxItemsQuerySchema>;
