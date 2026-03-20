import { z } from 'zod';

const leaveRequestStatusSchema = z.enum(['Pending', 'Approved', 'Rejected', 'Cancelled']);
const dateOnlySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date in YYYY-MM-DD format');
const isoDateSchema = z.union([z.string().datetime(), dateOnlySchema]);

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

export const listLeaveRequestsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  status: leaveRequestStatusSchema.optional(),
  employeeId: uuidQuerySchema,
  approverId: uuidQuerySchema,
  search: trimmedOptionalStringSchema,
  upcomingOnly: z.coerce.boolean().default(false),
});

const leaveRequestFieldsSchema = z.object({
  leaveTypeId: z.string().uuid(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  requestedHours: z.coerce.number().positive('Requested hours must be greater than zero'),
  notes: z.string().max(500).optional().nullable(),
});

export const createLeaveRequestSchema = leaveRequestFieldsSchema.refine((value) => new Date(value.startDate) <= new Date(value.endDate), {
  message: 'The start date must be on or before the end date.',
  path: ['endDate'],
});

export const updateLeaveRequestSchema = leaveRequestFieldsSchema.partial().refine(
  (value) =>
    value.startDate === undefined ||
    value.endDate === undefined ||
    new Date(value.startDate) <= new Date(value.endDate),
  {
    message: 'The start date must be on or before the end date.',
    path: ['endDate'],
  },
);

export const leaveDecisionSchema = z.object({
  comments: z.string().max(500).optional().nullable(),
});

export const cancelLeaveRequestSchema = z.object({
  comments: z.string().max(500).optional().nullable(),
});

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>;
export type LeaveDecisionInput = z.infer<typeof leaveDecisionSchema>;
export type ListLeaveRequestsQuery = z.infer<typeof listLeaveRequestsQuerySchema>;
export type UpdateLeaveRequestInput = z.infer<typeof updateLeaveRequestSchema>;
export type CancelLeaveRequestInput = z.infer<typeof cancelLeaveRequestSchema>;
